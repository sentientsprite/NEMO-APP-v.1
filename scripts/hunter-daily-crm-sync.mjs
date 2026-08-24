#!/usr/bin/env node
/**
 * Weak-presence Hunter → Outbound CRM (GitHub Actions).
 *
 * ICP: SERP-first — category/branded/site miss + grade C/D/F + 1:1 packages.
 * Pipeline: Places → Details → SERP (site + branded + category) → POST top N.
 *
 * Env:
 *   GOOGLE_PLACES_API_KEY      — Places API
 *   OUTBOUND_CRM_WEBHOOK_URL   — https://…/api/webhooks/hunter
 *   HUNTER_WEBHOOK_SECRET      — Bearer secret (match Vercel)
 *   SERPER_API_KEY             — required (serper.dev)
 *   SERPAPI_API_KEY            — optional fallback
 *   MAX_LEADS                  — optional, default 10
 *   STRONG_REVIEW_HARD_SKIP    — default 40
 *   STRONG_REVIEW_HARD_SKIP_NO_CSE — default 25
 *   MIN_OPPORTUNITY            — default 45
 *   POOL_MULTIPLIER            — default 6
 *   HUNTER_SEARCH_QUERIES_PATH — optional JSON array of query strings
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const KEY = process.env.GOOGLE_PLACES_API_KEY?.trim();
const WEBHOOK = process.env.OUTBOUND_CRM_WEBHOOK_URL?.trim().replace(/\/+$/, "");
const SECRET = process.env.HUNTER_WEBHOOK_SECRET?.trim();
const SERPER_KEY = process.env.SERPER_API_KEY?.trim() || "";
const SERPAPI_KEY = process.env.SERPAPI_API_KEY?.trim() || "";
const MAX_LEADS = Math.min(50, Math.max(1, parseInt(process.env.MAX_LEADS || "10", 10) || 10));
const STRONG_REVIEW_HARD_SKIP = Math.max(
  20,
  parseInt(process.env.STRONG_REVIEW_HARD_SKIP || "40", 10) || 40,
);
const STRONG_REVIEW_HARD_SKIP_NO_CSE = Math.max(
  15,
  parseInt(process.env.STRONG_REVIEW_HARD_SKIP_NO_CSE || "25", 10) || 25,
);
const MIN_OPPORTUNITY = Math.max(0, parseInt(process.env.MIN_OPPORTUNITY || "45", 10) || 45);
const POOL_MULTIPLIER = Math.min(12, Math.max(2, parseInt(process.env.POOL_MULTIPLIER || "6", 10) || 6));
const THIN_SITE_MAX = 3;
const WEAK_REVIEW_CRITICAL = 12;
const WEAK_REVIEW_SOFT = 25;

const DETAIL_FIELDS = [
  "name",
  "formatted_phone_number",
  "formatted_address",
  "business_status",
  "place_id",
  "rating",
  "user_ratings_total",
  "website",
  "types",
  "url",
  "opening_hours",
  "photos",
].join(",");

const queriesPath =
  process.env.HUNTER_SEARCH_QUERIES_PATH?.trim() || join(__dirname, "hunter-search-queries.json");

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

if (!KEY) fail("Missing GOOGLE_PLACES_API_KEY");
if (!WEBHOOK) fail("Missing OUTBOUND_CRM_WEBHOOK_URL");
if (!SECRET) fail("Missing HUNTER_WEBHOOK_SECRET");
if (!SERPER_KEY && !SERPAPI_KEY) fail("Missing SERPER_API_KEY (SERP-first Hunter requires Serper)");

let queries;
try {
  queries = JSON.parse(readFileSync(queriesPath, "utf8"));
} catch (e) {
  fail(`Could not read queries JSON (${queriesPath}): ${e instanceof Error ? e.message : e}`);
}
if (!Array.isArray(queries) || !queries.every((q) => typeof q === "string" && q.trim())) {
  fail("Queries file must be a JSON array of non-empty strings");
}

function hostnameFromUrl(url) {
  if (!url?.trim()) return null;
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

function cityHint(address, mapsQuery) {
  if (address?.trim()) {
    const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const city = parts[parts.length - 2];
      if (!/^\d{5}/.test(city) && city.length > 1) return city.replace(/\s+[A-Z]{2}$/, "").trim();
    }
  }
  if (mapsQuery?.trim()) {
    const m = mapsQuery.match(/\b([A-Za-z][A-Za-z\s]+?)\s+(?:UT|Utah)\b/i);
    if (m?.[1]) return m[1].trim();
  }
  return "Salt Lake City";
}

async function serpSearch(q, num = 5) {
  if (SERPER_KEY) {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": SERPER_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ q, num }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || `Serper HTTP ${res.status}`);
    const items = (data.organic || []).map((i) => ({ link: i.link, title: i.title || "" }));
    let totalResults = parseInt(String(data.searchInformation?.totalResults || "0").replace(/,/g, ""), 10) || 0;
    if (totalResults <= 0 && items.length) totalResults = items.length;
    return { totalResults, items };
  }
  if (SERPAPI_KEY) {
    const u = new URL("https://serpapi.com/search.json");
    u.searchParams.set("engine", "google");
    u.searchParams.set("q", q);
    u.searchParams.set("num", String(num));
    u.searchParams.set("api_key", SERPAPI_KEY);
    const res = await fetch(u);
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || `SerpAPI HTTP ${res.status}`);
    const items = (data.organic_results || []).map((i) => ({ link: i.link, title: i.title || "" }));
    let totalResults =
      parseInt(String(data.search_information?.total_results || "0").replace(/,/g, ""), 10) || 0;
    if (totalResults <= 0 && items.length) totalResults = items.length;
    return { totalResults, items };
  }
  return null;
}

async function fetchOrganic(name, website, city, categoryQuery) {
  const fetched_at = new Date().toISOString();
  if (!SERPER_KEY && !SERPAPI_KEY) {
    return { skipped: true, reason: "SERPER_API_KEY not set", fetched_at };
  }
  const hostname = hostnameFromUrl(website);
  const out = { skipped: false, hostname, fetched_at };
  try {
    if (hostname) {
      out.site_query = `site:${hostname}`;
      const site = await serpSearch(out.site_query, 5);
      out.site_total_results = site?.totalResults ?? 0;
    } else {
      out.site_total_results = null;
    }
    const safeName = name.replace(/"/g, "").trim();
    out.branded_query = `"${safeName}" ${city}`;
    const branded = await serpSearch(out.branded_query, 8);
    out.branded_top_links = (branded?.items || []).map((i) => i.link);
    let rank = null;
    if (hostname) {
      for (let i = 0; i < (branded?.items || []).length; i++) {
        const host = hostnameFromUrl(branded.items[i].link);
        if (host && (host === hostname || host.endsWith(`.${hostname}`))) {
          rank = i + 1;
          break;
        }
      }
    }
    out.branded_rank = rank;
    out.branded_hit = rank != null;

    if (categoryQuery?.trim()) {
      out.category_query = categoryQuery.trim();
      const category = await serpSearch(out.category_query, 10);
      let cRank = null;
      if (hostname) {
        for (let i = 0; i < (category?.items || []).length; i++) {
          const host = hostnameFromUrl(category.items[i].link);
          if (host && (host === hostname || host.endsWith(`.${hostname}`))) {
            cRank = i + 1;
            break;
          }
        }
      }
      if (cRank == null) {
        const tokens = safeName
          .toLowerCase()
          .split(/\s+/)
          .filter((t) => t.length > 2)
          .slice(0, 3);
        for (let i = 0; i < (category?.items || []).length; i++) {
          const title = (category.items[i].title || "").toLowerCase();
          if (tokens.length && tokens.every((t) => title.includes(t))) {
            cRank = i + 1;
            break;
          }
        }
      }
      out.category_rank = cRank;
      out.category_hit = cRank != null;
    }
  } catch (e) {
    return { skipped: true, reason: e instanceof Error ? e.message : String(e), hostname, fetched_at };
  }
  return out;
}

function gradeFromVisibility(score) {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 65) return "C";
  if (score >= 50) return "D";
  return "F";
}

function listPackages(det, organic) {
  const packages = [];
  const reviews = det.user_ratings_total ?? 0;
  const website = Boolean(det.website?.trim());
  const hasHours = det.opening_hours != null;
  const photoCount = Array.isArray(det.photos) ? det.photos.length : 0;

  if (!hasHours) packages.push("gbp_management");
  if (photoCount < 3) packages.push("photo_management");
  if (reviews < WEAK_REVIEW_SOFT) packages.push("review_sms_funnel");
  if (!website) packages.push("website_build_or_fix");

  if (organic && !organic.skipped) {
    const siteN = organic.site_total_results;
    const thin = website && typeof siteN === "number" && siteN <= THIN_SITE_MAX;
    if (thin) packages.push("website_build_or_fix");
    if (thin || organic.branded_hit === false || organic.category_hit === false) {
      packages.push("local_seo_sem_geo_aeo");
    }
    if (organic.branded_hit === false && reviews < WEAK_REVIEW_SOFT) packages.push("social_presence");
  }

  if (website && reviews < WEAK_REVIEW_CRITICAL && (!hasHours || photoCount < 3)) {
    packages.push("paid_ads_after_foundation");
  }

  return [...new Set(packages)];
}

function scoreVisibility(det, organic) {
  let score = 82;
  const reviews = det.user_ratings_total ?? 0;
  const website = Boolean(det.website?.trim());
  const hasHours = det.opening_hours != null;
  const photoCount = Array.isArray(det.photos) ? det.photos.length : 0;

  if (!website) score -= 26;
  if (reviews < 5) score -= 28;
  else if (reviews < WEAK_REVIEW_CRITICAL) score -= 20;
  else if (reviews < WEAK_REVIEW_SOFT) score -= 14;
  else if (reviews < STRONG_REVIEW_HARD_SKIP) score -= 6;
  else score += 6;
  if (!hasHours) score -= 16;
  if (photoCount < 3) score -= 10;
  if (typeof det.rating === "number" && det.rating > 0 && det.rating < 4) score -= 10;

  if (organic && !organic.skipped) {
    const siteN = organic.site_total_results;
    if (typeof siteN === "number") {
      if (siteN <= 0) score -= 18;
      else if (siteN <= THIN_SITE_MAX) score -= 12;
      else if (siteN > 50) score += 6;
    }
    if (organic.branded_hit === false) score -= 14;
    else if (organic.branded_hit === true && (organic.branded_rank ?? 1) <= 3) score += 8;
  }

  return Math.max(0, Math.min(100, score));
}

function scoreOpportunity(det, organic) {
  const reasons = [];
  let maps = 0;
  const reviews = det.user_ratings_total ?? 0;
  const website = Boolean(det.website?.trim());
  const hasHours = det.opening_hours != null;
  const photoCount = Array.isArray(det.photos) ? det.photos.length : 0;

  if (!website) {
    maps += 35;
    reasons.push("no_website");
  }
  if (reviews < WEAK_REVIEW_CRITICAL) {
    maps += 32;
    reasons.push(`reviews_${reviews}`);
  } else if (reviews < WEAK_REVIEW_SOFT) {
    maps += 18;
    reasons.push(`reviews_mid_${reviews}`);
  } else if (reviews < STRONG_REVIEW_HARD_SKIP) {
    maps += 4;
  } else {
    maps -= 20;
    reasons.push(`reviews_strong_${reviews}`);
  }
  if (!hasHours) {
    maps += 18;
    reasons.push("no_hours");
  }
  if (photoCount < 3) {
    maps += 12;
    reasons.push(`thin_photos_${photoCount}`);
  }

  let org = 0;
  if (!organic || organic.skipped) {
    reasons.push(organic?.skipped ? "organic_skipped" : "organic_missing");
  } else {
    const siteN = organic.site_total_results;
    if (organic.hostname == null && siteN == null) {
      org += 12;
      reasons.push("no_domain");
    } else if (typeof siteN === "number") {
      if (siteN <= 0) {
        org += 25;
        reasons.push("site_zero");
      } else if (siteN <= THIN_SITE_MAX) {
        org += 18;
        reasons.push(`site_thin_${siteN}`);
      } else if (siteN <= 30) {
        org += 8;
      } else {
        org -= 12;
        reasons.push(`site_strong_${siteN}`);
      }
    }
    if (organic.branded_hit === false) {
      org += 20;
      reasons.push("branded_miss");
    } else if (organic.branded_hit === true) {
      org -= 15;
      reasons.push(`branded_top_${organic.branded_rank ?? 1}`);
    }
  }

  const critical =
    (!website && reviews < WEAK_REVIEW_SOFT) ||
    (reviews < WEAK_REVIEW_CRITICAL && (!hasHours || !website)) ||
    (!hasHours && photoCount < 3 && reviews < WEAK_REVIEW_SOFT);
  const total = Math.max(0, Math.min(100, Math.round(maps * 0.65 + org * 0.35)));
  const visibility = scoreVisibility(det, organic);
  const grade = gradeFromVisibility(visibility);
  const packages = listPackages(det, organic);
  return { total, reasons, critical, maps, org, grade, packages, visibility };
}

function hardSkip(det, organic) {
  const reviews = det.user_ratings_total ?? 0;
  const website = Boolean(det.website?.trim());
  const cseUnavailable = !organic || organic.skipped;

  if (website && reviews >= STRONG_REVIEW_HARD_SKIP) return true;
  if (cseUnavailable && website && reviews >= STRONG_REVIEW_HARD_SKIP_NO_CSE) return true;
  if (!cseUnavailable) {
    if (organic.branded_hit === true && organic.category_hit === true) return true;
    if (
      website &&
      reviews >= 8 &&
      organic.branded_hit === true &&
      (organic.branded_rank ?? 1) <= 3 &&
      organic.category_hit !== false
    ) {
      return true;
    }
  }
  return false;
}

function hasSerpFailure(det, organic) {
  if (!organic || organic.skipped) return false;
  if (!det.website?.trim()) return true;
  if (organic.category_hit === false) return true;
  if (organic.branded_hit === false) return true;
  if (typeof organic.site_total_results === "number" && organic.site_total_results <= THIN_SITE_MAX) {
    return true;
  }
  return false;
}

function shouldKeep(breakdown, det, organic) {
  if (!organic || organic.skipped) return false;
  if (!["C", "D", "F"].includes(breakdown.grade)) return false;
  if (!hasSerpFailure(det, organic)) return false;
  if ((breakdown.packages?.length || 0) < 1) return false;
  if (
    breakdown.total < MIN_OPPORTUNITY &&
    !breakdown.critical &&
    organic.category_hit !== false &&
    organic.branded_hit !== false
  ) {
    return false;
  }
  return true;
}

async function textSearch(query) {
  const u = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
  u.searchParams.set("query", query.trim());
  u.searchParams.set("key", KEY);
  const res = await fetch(u);
  const data = await res.json();
  if (data.status === "ZERO_RESULTS") return [];
  if (data.status !== "OK") {
    throw new Error(`Places Text Search: ${data.status} ${data.error_message || ""}`);
  }
  return data.results || [];
}

async function placeDetails(placeId) {
  const u = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  u.searchParams.set("place_id", placeId);
  u.searchParams.set("fields", DETAIL_FIELDS);
  u.searchParams.set("key", KEY);
  const res = await fetch(u);
  const data = await res.json();
  if (data.status !== "OK") return null;
  return data.result;
}

async function postLead(body) {
  const res = await fetch(WEBHOOK, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SECRET}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { ok: res.ok, status: res.status, json };
}

const poolCap = Math.min(120, MAX_LEADS * POOL_MULTIPLIER);
const staged = [];
const seenPlaceIds = new Set();

outer: for (const q of queries) {
  if (staged.length >= poolCap) break;
  let results;
  try {
    results = await textSearch(q);
  } catch (e) {
    console.error(`Query failed (${q.slice(0, 48)}…):`, e instanceof Error ? e.message : e);
    continue;
  }

  for (const hit of results.slice(0, 15)) {
    if (staged.length >= poolCap) break outer;
    const pid = hit.place_id;
    if (!pid || seenPlaceIds.has(pid)) continue;
    seenPlaceIds.add(pid);
    staged.push({ hit, query: q.trim() });
    await new Promise((r) => setTimeout(r, 120));
  }
}

/** @type {Array<{ hit: object; query: string; det: object; organic: object; score: number; reasons: string[] }>} */
const enriched = [];

for (const { hit, query } of staged) {
  const pid = hit.place_id;
  let det;
  try {
    det = await placeDetails(pid);
  } catch (e) {
    console.error(`Place details failed (${pid}):`, e instanceof Error ? e.message : e);
    continue;
  }
  if (!det) continue;
  if (det.business_status === "CLOSED_PERMANENTLY") continue;

  const phone = det.formatted_phone_number?.trim();
  if (!phone) continue;

  const name = (det.name || hit.name || "Unknown").trim();
  const city = cityHint(det.formatted_address, query);
  const organic = await fetchOrganic(name, det.website, city, query);
  await new Promise((r) => setTimeout(r, 180));

  if (hardSkip(det, organic)) continue;

  const breakdown = scoreOpportunity(det, organic);
  if (!shouldKeep(breakdown, det, organic)) continue;

  enriched.push({
    hit,
    query,
    det,
    organic,
    score: breakdown.total,
    reasons: breakdown.reasons,
    grade: breakdown.grade,
    packages: breakdown.packages,
  });
}

enriched.sort((a, b) => b.score - a.score);
const winners = enriched.slice(0, MAX_LEADS);

console.log(
  `SERP-first: ${enriched.length} keepers from ${staged.length} staged; posting top ${winners.length}.`,
);

const posted = [];

for (let i = 0; i < winners.length; i++) {
  const { hit, query, det, organic, score, reasons, grade, packages } = winners[i];
  const pid = det.place_id || hit.place_id;
  const name = (det.name || hit.name || "Unknown").trim();
  const phone = det.formatted_phone_number.trim();
  const external_id = `google_place:${pid}`;
  const types = Array.isArray(det.types) ? det.types.slice(0, 6) : [];
  const website = det.website?.trim() || null;
  const reviews = det.user_ratings_total ?? 0;
  const hasHours = det.opening_hours != null;
  const photoCount = Array.isArray(det.photos) ? det.photos.length : 0;

  const siteNote =
    organic.skipped
      ? `Organic: skipped (${organic.reason || "no SERP"})`
      : `Organic: site≈${organic.site_total_results ?? "n/a"} · branded: ${
          organic.branded_hit ? `hit#${organic.branded_rank}` : "miss"
        } · category: ${
          organic.category_hit == null
            ? "n/a"
            : organic.category_hit
              ? `hit#${organic.category_rank}`
              : "miss"
        }`;

  const profile = {
    place_id: pid,
    website,
    maps_url: det.url?.trim() || null,
    address: det.formatted_address?.trim() || null,
    rating: typeof det.rating === "number" ? det.rating : null,
    review_count: reviews,
    types,
    maps_query: query,
    has_hours: hasHours,
    hours_open_now: det.opening_hours?.open_now ?? null,
    photo_count: photoCount,
    business_status: det.business_status ?? null,
    fetched_at: new Date().toISOString(),
    organic,
    opportunity_score: score,
    estimated_grade: grade,
    service_packages: packages,
  };

  const notes = [
    `Grade: ${grade} (C-and-below ICP)`,
    `Opportunity: ${score}/100 (${reasons.slice(0, 6).join(", ")})`,
    `Packages: ${(packages || []).join(", ") || "none"}`,
    `Reviews: ${reviews} · Rating: ${det.rating ?? "n/a"}`,
    website ? `Website: ${website}` : "Website: no",
    siteNote,
    `Maps query: ${query}`,
    det.formatted_address ? `Address: ${det.formatted_address}` : null,
    "Pipeline: github-actions hunter-daily C-and-below",
  ]
    .filter(Boolean)
    .join(" · ");

  const body = {
    name,
    company: name,
    phone,
    source: "hunter_weak_presence_daily",
    notes,
    external_id,
    profile,
  };

  const { ok, status, json } = await postLead(body);
  if (!ok) {
    console.error(`POST failed ${external_id} HTTP ${status}`, json);
    continue;
  }
  console.log(
    `OK ${posted.length + 1}/${winners.length}`,
    external_id,
    `opp=${score}`,
    json?.id ? `id=${json.id}` : "",
  );
  posted.push(external_id);
  await new Promise((r) => setTimeout(r, 250));
}

console.log(`\nFinished: posted ${posted.length} C-and-below leads (cap ${MAX_LEADS}).`);
if (posted.length === 0) {
  console.error(
    "No leads posted — need grade C/D/F + ≥2 packages, or check Places/SERP + webhook secrets.",
  );
  process.exit(1);
}

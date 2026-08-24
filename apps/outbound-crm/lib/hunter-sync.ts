/**
 * In-deployment Hunter sync: SERP-first Places discovery (3–5 new keepers),
 * otherwise upsert fixtures. Posts through /api/webhooks/hunter.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  cityHintFromAddressOrQuery,
  isOrganicSearchConfigured,
  organicFootprint,
  probeOrganicSearch,
  type OrganicFootprint,
} from "@/lib/custom-search";
import type { LeadProfile } from "@/lib/lead-profile";
import { fetchPlaceDetails, placeDetailsToProfile, placesApiKey } from "@/lib/places";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  combineOpportunityScore,
  formatOrganicNotes,
  formatPackageNotes,
  mapsWorthSerpSpend,
  shouldHardSkipStrongPresence,
  shouldKeepWeakProspect,
  type ProspectGrade,
  type ServicePackageGap,
} from "@/lib/weak-presence";

export type HunterSyncResult =
  | { ok: true; mode: "places" | "fixtures"; posted: number; message: string }
  | { ok: false; error: string };

type LeadBody = {
  name: string;
  phone: string;
  source: string;
  company?: string;
  email?: string;
  notes?: string;
  external_id?: string;
  profile?: LeadProfile;
};

/** Diversified Wasatch Front trades — avoid re-hitting the same Map Pack every run. */
const DEFAULT_QUERIES = [
  "HVAC contractor Murray UT",
  "plumbing services Midvale UT",
  "electrician West Valley City UT",
  "roofing contractor Sandy UT",
  "concrete sealing West Jordan UT",
  "landscaping Taylorsville UT",
  "garage door repair Ogden UT",
  "painting contractor Lehi UT",
  "fence company South Jordan UT",
  "pest control Draper UT",
];

/**
 * Known test / seed businesses — never queue from Places Hunter.
 * Invictus + Monkey Wrench were LVS/fixture tests that kept reappearing.
 */
const BLOCKED_PLACE_IDS = new Set([
  "ChIJ-ZdmCxvzUocRtuwXZkDIqX4", // Invictus Coatings
]);

const BLOCKED_NAME_PATTERNS: RegExp[] = [
  /\binvictus\s+coatings?\b/i,
  /\bmonkey\s+wrench\s+plumbing\b/i,
];

const TARGET_MIN = 3;
const TARGET_MAX = 5;

function placesKey(): string {
  return placesApiKey();
}

function webhookSecret(): string {
  return process.env.HUNTER_WEBHOOK_SECRET?.trim() || "";
}

function publicBaseUrl(): string {
  const explicit = process.env.OUTBOUND_CRM_PUBLIC_URL?.trim().replace(/\/+$/, "");
  if (explicit) return explicit;
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (prod) return prod.startsWith("http") ? prod.replace(/\/+$/, "") : `https://${prod}`;
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/+$/, "")}`;
  return "http://localhost:3010";
}

function isBlockedTestBusiness(name: string, placeId?: string | null): boolean {
  if (placeId && BLOCKED_PLACE_IDS.has(placeId)) return true;
  return BLOCKED_NAME_PATTERNS.some((re) => re.test(name));
}

async function loadKnownGooglePlaceIds(): Promise<Set<string>> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("outbound_leads")
      .select("external_id")
      .like("external_id", "google_place:%")
      .limit(2000);
    if (error || !data) return new Set();
    const ids = new Set<string>();
    for (const row of data) {
      const ext = typeof row.external_id === "string" ? row.external_id : "";
      if (ext.startsWith("google_place:")) {
        ids.add(ext.slice("google_place:".length));
      }
    }
    return ids;
  } catch {
    return new Set();
  }
}

async function postLead(body: LeadBody): Promise<{ ok: boolean; status: number }> {
  const secret = webhookSecret();
  const url = `${publicBaseUrl()}/api/webhooks/hunter`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12_000),
  });
  return { ok: res.ok, status: res.status };
}

function loadFixtures(): LeadBody[] {
  const path = join(process.cwd(), "scripts/fixtures/test-leads.json");
  const parsed = JSON.parse(readFileSync(path, "utf8")) as LeadBody[];
  if (!Array.isArray(parsed)) throw new Error("fixtures must be an array");
  return parsed;
}

async function textSearch(key: string, query: string): Promise<Array<{ place_id?: string; name?: string }>> {
  const u = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
  u.searchParams.set("query", query);
  u.searchParams.set("key", key);
  const res = await fetch(u, { signal: AbortSignal.timeout(10_000) });
  const data = (await res.json()) as {
    status: string;
    results?: Array<{ place_id?: string; name?: string }>;
    error_message?: string;
  };
  if (data.status === "ZERO_RESULTS") return [];
  if (data.status !== "OK") {
    throw new Error(`Places Text Search: ${data.status} ${data.error_message || ""}`);
  }
  return data.results || [];
}

async function runPlacesSync(maxLeads: number): Promise<HunterSyncResult> {
  const key = placesKey();
  const secret = webhookSecret();
  if (!key) return { ok: false, error: "Missing GOOGLE_PLACES_API_KEY / GOOGLE_MAPS_API_KEY" };
  if (!secret) return { ok: false, error: "Missing HUNTER_WEBHOOK_SECRET" };

  const target = Math.min(TARGET_MAX, Math.max(TARGET_MIN, Math.floor(maxLeads) || TARGET_MAX));

  if (!isOrganicSearchConfigured()) {
    return {
      ok: false,
      error:
        "SERPER_API_KEY required — Hunter only keeps leads with SERP-proven category/brand/site misses.",
    };
  }

  const probe = await probeOrganicSearch();
  if (!probe.ok) {
    return {
      ok: false,
      error: `Serper not working (${probe.error || "probe failed"}). Fix SERPER_API_KEY, then re-run.`,
    };
  }

  const knownPlaceIds = await loadKnownGooglePlaceIds();

  const queries = DEFAULT_QUERIES;
  const seen = new Set<string>();
  const candidates: Array<{ placeId: string; query: string }> = [];
  // Wide pool — we skip known + blocked, then SERP-filter down to `target`.
  const poolCap = Math.max(target * 8, 40);

  for (const query of queries) {
    if (candidates.length >= poolCap) break;
    let results: Array<{ place_id?: string; name?: string }>;
    try {
      results = await textSearch(key, query);
    } catch (e) {
      return {
        ok: false,
        error: `Places search failed: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
    for (const hit of results.slice(0, 10)) {
      if (!hit.place_id || seen.has(hit.place_id)) continue;
      if (knownPlaceIds.has(hit.place_id)) continue;
      if (isBlockedTestBusiness(hit.name || "", hit.place_id)) continue;
      seen.add(hit.place_id);
      candidates.push({ placeId: hit.place_id, query });
      if (candidates.length >= poolCap) break;
    }
  }

  type Ranked = {
    name: string;
    phone: string;
    placeId: string;
    query: string;
    profile: LeadProfile;
    opportunity: number;
    reasons: string[];
    organic: OrganicFootprint;
    grade: ProspectGrade;
    packages: ServicePackageGap[];
  };

  const ranked: Ranked[] = [];
  const deferredOrganic: OrganicFootprint = {
    skipped: true,
    reason: "deferred",
  };
  /** Cap Serper spend so the run finishes inside Vercel maxDuration. */
  const maxSerpCandidates = Math.max(target * 4, 16);
  let serpAttempts = 0;

  for (const c of candidates) {
    if (ranked.length >= target) break;
    if (serpAttempts >= maxSerpCandidates) break;

    let det: Awaited<ReturnType<typeof fetchPlaceDetails>>;
    try {
      det = await fetchPlaceDetails(c.placeId);
    } catch {
      continue;
    }
    if (!det || det.business_status === "CLOSED_PERMANENTLY") continue;
    const phone = det.formatted_phone_number?.trim();
    if (!phone) continue;

    const name = (det.name || "Unknown").trim();
    const placeId = det.place_id || c.placeId;
    if (isBlockedTestBusiness(name, placeId)) continue;
    if (knownPlaceIds.has(placeId)) continue;

    let profile = placeDetailsToProfile(det, { maps_query: c.query });

    if (shouldHardSkipStrongPresence(profile, deferredOrganic)) continue;
    if (!mapsWorthSerpSpend(profile)) continue;

    serpAttempts++;
    const city = cityHintFromAddressOrQuery(profile.address, c.query);
    const organic = await organicFootprint({
      website: profile.website,
      businessName: name,
      city,
      categoryQuery: c.query,
    });

    if (organic.skipped) {
      return {
        ok: false,
        error: `SERP failed mid-run (${organic.reason || "unknown"}). Fix Serper, then re-run.`,
      };
    }

    profile = { ...profile, organic };

    if (shouldHardSkipStrongPresence(profile, organic)) continue;

    const breakdown = combineOpportunityScore(profile, organic);
    if (!shouldKeepWeakProspect(breakdown, organic, profile)) continue;

    profile = {
      ...profile,
      opportunity_score: breakdown.total,
      estimated_grade: breakdown.estimatedGrade,
      service_packages: breakdown.packages.map((p) => p.id),
    };

    ranked.push({
      name,
      phone,
      placeId,
      query: c.query,
      profile,
      opportunity: breakdown.total,
      reasons: breakdown.reasons,
      organic,
      grade: breakdown.estimatedGrade,
      packages: breakdown.packages,
    });
    // Mark so we don't post the same place twice in one run.
    knownPlaceIds.add(placeId);
  }

  ranked.sort((a, b) => b.opportunity - a.opportunity);
  const winners = ranked.slice(0, target);

  let posted = 0;
  for (const w of winners) {
    const website = w.profile.website;
    const mapsUrl = w.profile.maps_url;
    const rating = w.profile.rating;
    const reviews = w.profile.review_count ?? 0;

    const { ok, status } = await postLead({
      name: w.name,
      company: w.name,
      phone: w.phone,
      source: "hunter_weak_presence",
      external_id: `google_place:${w.placeId}`,
      notes: [
        `Grade: ${w.grade} (SERP-proven package ICP)`,
        `Opportunity: ${w.opportunity}/100 (${w.reasons.slice(0, 8).join(", ")})`,
        formatPackageNotes(w.packages),
        `Reviews: ${reviews} · Rating: ${rating ?? "n/a"}`,
        website ? `Website: ${website}` : "Website: no",
        formatOrganicNotes(w.organic),
        mapsUrl ? `Maps: ${mapsUrl}` : null,
        `Maps query: ${w.query}`,
        w.profile.address ? `Address: ${w.profile.address}` : null,
        "Pipeline: outbound-crm SERP-first package Leadfinder",
      ]
        .filter(Boolean)
        .join(" · "),
      profile: w.profile,
    });
    if (ok) posted++;
    else if (status === 401) {
      return { ok: false, error: "Hunter webhook unauthorized — HUNTER_WEBHOOK_SECRET mismatch." };
    }
  }

  if (posted === 0) {
    return {
      ok: false,
      error:
        "Found 0 new SERP-proven keepers (skipped known + test businesses). Widen trade/city queries or clear stale queue rows.",
    };
  }

  if (posted < TARGET_MIN) {
    return {
      ok: true,
      mode: "places",
      posted,
      message: `Posted ${posted} new lead(s) (target ${TARGET_MIN}–${TARGET_MAX}). Pool was thin after skipping known/test businesses — re-run or add cities. Refresh the queue.`,
    };
  }

  return {
    ok: true,
    mode: "places",
    posted,
    message: `Posted ${posted} new SERP-proven lead(s) (target ${TARGET_MIN}–${TARGET_MAX}). Refresh the queue.`,
  };
}

async function runFixtureSync(): Promise<HunterSyncResult> {
  const secret = webhookSecret();
  if (!secret) return { ok: false, error: "Missing HUNTER_WEBHOOK_SECRET" };

  let fixtures: LeadBody[];
  try {
    fixtures = loadFixtures();
  } catch (e) {
    return { ok: false, error: `Could not load fixtures: ${e instanceof Error ? e.message : String(e)}` };
  }

  let posted = 0;
  let unauthorized = false;
  for (const row of fixtures) {
    const { ok, status } = await postLead(row);
    if (ok) posted++;
    if (status === 401) unauthorized = true;
  }

  if (unauthorized) {
    return { ok: false, error: "Hunter webhook unauthorized — HUNTER_WEBHOOK_SECRET mismatch." };
  }
  if (posted === 0) {
    return { ok: false, error: "Fixture sync posted 0 leads." };
  }

  return {
    ok: true,
    mode: "fixtures",
    posted,
    message: `Synced ${posted} fixture lead(s) (no Places key on this deployment). Refresh the queue.`,
  };
}

/** Prefer live Places weak-presence Leadfinder; fall back to fixtures. */
export async function runHunterSyncInline(maxLeads = TARGET_MAX): Promise<HunterSyncResult> {
  if (placesKey()) {
    return runPlacesSync(maxLeads);
  }
  return runFixtureSync();
}

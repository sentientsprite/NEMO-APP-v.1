/**
 * In-deployment Hunter sync: weak-presence Places discovery (+ optional SERP organic),
 * otherwise upsert committed fixtures. Posts through /api/webhooks/hunter
 * so ingest + dedupe stay identical to GitHub Actions / OpenClaw.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  cityHintFromAddressOrQuery,
  isOrganicSearchConfigured,
  organicFootprint,
  type OrganicFootprint,
} from "@/lib/custom-search";
import type { LeadProfile } from "@/lib/lead-profile";
import { fetchPlaceDetails, placeDetailsToProfile, placesApiKey } from "@/lib/places";
import {
  combineOpportunityScore,
  formatOrganicNotes,
  shouldHardSkipStrongPresence,
  shouldKeepWeakProspect,
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

const DEFAULT_QUERIES = [
  "HVAC contractor Salt Lake City UT",
  "plumbing services West Jordan UT",
  "concrete sealing Salt Lake City UT",
  "electrician Draper UT",
  "roofing contractor South Jordan UT",
];

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

  const serpOn = isOrganicSearchConfigured();
  const queries = DEFAULT_QUERIES.slice(0, 5);
  const seen = new Set<string>();
  const candidates: Array<{ placeId: string; query: string }> = [];
  // Pull a wider pool — we keep weak ones, not Map Pack winners.
  const poolCap = Math.max(maxLeads * 5, 20);

  for (const query of queries) {
    if (candidates.length >= poolCap) break;
    let results: Array<{ place_id?: string }>;
    try {
      results = await textSearch(key, query);
    } catch (e) {
      return {
        ok: false,
        error: `Places search failed: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
    for (const hit of results.slice(0, 12)) {
      if (!hit.place_id || seen.has(hit.place_id)) continue;
      seen.add(hit.place_id);
      candidates.push({ placeId: hit.place_id, query });
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
  };

  const ranked: Ranked[] = [];
  let sawOrganicSkip = false;
  let organicBlockedReason: string | undefined;

  for (const c of candidates) {
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
    let profile = placeDetailsToProfile(det, { maps_query: c.query });
    const city = cityHintFromAddressOrQuery(profile.address, c.query);

    const organic = await organicFootprint({
      website: profile.website,
      businessName: name,
      city,
    });
    if (organic.skipped) {
      sawOrganicSkip = true;
      organicBlockedReason = organic.reason || organicBlockedReason;
    }
    profile = { ...profile, organic };

    if (shouldHardSkipStrongPresence(profile, organic)) continue;

    const breakdown = combineOpportunityScore(profile, organic);
    if (!shouldKeepWeakProspect(breakdown, organic)) continue;

    profile = { ...profile, opportunity_score: breakdown.total };

    ranked.push({
      name,
      phone,
      placeId: det.place_id || c.placeId,
      query: c.query,
      profile,
      opportunity: breakdown.total,
      reasons: breakdown.reasons,
      organic,
    });
  }

  ranked.sort((a, b) => b.opportunity - a.opportunity);
  const winners = ranked.slice(0, maxLeads);
  const organicSkipped = sawOrganicSkip;

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
        `Opportunity: ${w.opportunity}/100 (${w.reasons.slice(0, 6).join(", ")})`,
        `Reviews: ${reviews} · Rating: ${rating ?? "n/a"}`,
        website ? `Website: ${website}` : "Website: no",
        formatOrganicNotes(w.organic),
        mapsUrl ? `Maps: ${mapsUrl}` : null,
        `Maps query: ${w.query}`,
        w.profile.address ? `Address: ${w.profile.address}` : null,
        "Pipeline: outbound-crm weak-presence Leadfinder",
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
      error: serpOn
        ? "Weak-presence hunt found 0 keepers (pool may be Map Pack winners only, or phone/billing). Widen queries or check Places/SERP."
        : "Weak-presence hunt found 0 keepers. Set SERPER_API_KEY (or SERPAPI_API_KEY) for site:/branded organic, or widen trade/city queries.",
    };
  }

  return {
    ok: true,
    mode: "places",
    posted,
    message: serpOn && !organicSkipped
      ? `Weak-presence Leadfinder posted ${posted} lead(s) (Maps + SERP organic). Refresh the queue.`
      : serpOn && organicSkipped
        ? `Weak-presence posted ${posted} (Maps-only keepers). SERP blocked: ${organicBlockedReason || "check SERPER_API_KEY"}. Refresh the queue.`
        : `Weak-presence posted ${posted} (Maps-only; set SERPER_API_KEY for organic). Refresh the queue.`,
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
export async function runHunterSyncInline(maxLeads = 8): Promise<HunterSyncResult> {
  if (placesKey()) {
    return runPlacesSync(maxLeads);
  }
  return runFixtureSync();
}

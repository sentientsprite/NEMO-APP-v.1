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
  probeOrganicSearch,
  type OrganicFootprint,
} from "@/lib/custom-search";
import type { LeadProfile } from "@/lib/lead-profile";
import { fetchPlaceDetails, placeDetailsToProfile, placesApiKey } from "@/lib/places";
import {
  combineOpportunityScore,
  formatOrganicNotes,
  formatPackageNotes,
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
  let serpProbeError: string | undefined;
  if (serpOn) {
    const probe = await probeOrganicSearch();
    if (!probe.ok) {
      serpProbeError = probe.error || "SERP probe failed";
    }
  }

  // Smaller pool so Places + SERP finish inside Vercel maxDuration.
  const queries = DEFAULT_QUERIES.slice(0, 3);
  const seen = new Set<string>();
  const candidates: Array<{ placeId: string; query: string }> = [];
  const poolCap = Math.max(maxLeads * 3, 12);

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
    for (const hit of results.slice(0, 6)) {
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
    grade: ProspectGrade;
    packages: ServicePackageGap[];
  };

  const ranked: Ranked[] = [];
  let sawOrganicSkip = Boolean(serpProbeError);
  let organicBlockedReason: string | undefined = serpProbeError
    ? `SERP down: ${serpProbeError}`
    : undefined;
  /** Maps-only deferred stub — used to prefilter before spending SERP credits. */
  const deferredOrganic: OrganicFootprint = {
    skipped: true,
    reason: "deferred",
  };

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

    // Cheap Maps prefilter before Serper (2 calls/candidate).
    if (shouldHardSkipStrongPresence(profile, deferredOrganic)) continue;
    const mapsOnly = combineOpportunityScore(profile, deferredOrganic);
    if (!shouldKeepWeakProspect(mapsOnly, deferredOrganic)) continue;

    const city = cityHintFromAddressOrQuery(profile.address, c.query);
    const organic =
      serpOn && !serpProbeError
        ? await organicFootprint({
            website: profile.website,
            businessName: name,
            city,
          })
        : {
            ...deferredOrganic,
            reason: serpProbeError
              ? `SERP down: ${serpProbeError}`
              : serpOn
                ? "deferred"
                : "SERPER_API_KEY not set",
          };

    if (organic.skipped && organic.reason !== "deferred") {
      sawOrganicSkip = true;
      organicBlockedReason = organic.reason || organicBlockedReason || serpProbeError;
    }
    profile = { ...profile, organic };

    if (shouldHardSkipStrongPresence(profile, organic)) continue;

    const breakdown = combineOpportunityScore(profile, organic);
    if (!shouldKeepWeakProspect(breakdown, organic)) continue;

    profile = {
      ...profile,
      opportunity_score: breakdown.total,
      estimated_grade: breakdown.estimatedGrade,
      service_packages: breakdown.packages.map((p) => p.id),
    };

    ranked.push({
      name,
      phone,
      placeId: det.place_id || c.placeId,
      query: c.query,
      profile,
      opportunity: breakdown.total,
      reasons: breakdown.reasons,
      organic,
      grade: breakdown.estimatedGrade,
      packages: breakdown.packages,
    });

    // Stop early once we have enough keepers — avoid burning the request budget.
    if (ranked.length >= maxLeads * 2) break;
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
        `Grade: ${w.grade} (C-and-below ICP)`,
        `Opportunity: ${w.opportunity}/100 (${w.reasons.slice(0, 6).join(", ")})`,
        formatPackageNotes(w.packages),
        `Reviews: ${reviews} · Rating: ${rating ?? "n/a"}`,
        website ? `Website: ${website}` : "Website: no",
        formatOrganicNotes(w.organic),
        mapsUrl ? `Maps: ${mapsUrl}` : null,
        `Maps query: ${w.query}`,
        w.profile.address ? `Address: ${w.profile.address}` : null,
        "Pipeline: outbound-crm C-and-below package Leadfinder",
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
    const serpHint = serpProbeError
      ? ` Serper is failing (${serpProbeError}) — fix SERPER_API_KEY on Vercel Production and redeploy.`
      : organicSkipped
        ? ` SERP skipped: ${organicBlockedReason || "unknown"}.`
        : !serpOn
          ? " Set SERPER_API_KEY for organic package scoring."
          : "";
    return {
      ok: false,
      error: `C/low-C hunt found 0 keepers (need grade C/D/F + package gaps).${serpHint}`,
    };
  }

  return {
    ok: true,
    mode: "places",
    posted,
    message: serpOn && !organicSkipped && !serpProbeError
      ? `Posted ${posted} C/low-C lead(s) (Maps + SERP; package gaps). Refresh the queue.`
      : serpProbeError
        ? `Posted ${posted} (Maps-only — Serper broken: ${serpProbeError}). Fix SERPER_API_KEY, then re-run. Refresh the queue.`
        : serpOn && organicSkipped
          ? `Posted ${posted} C/low-C (Maps packages; some SERP skipped: ${organicBlockedReason || "check SERPER_API_KEY"}). Refresh the queue.`
          : `Posted ${posted} C/low-C (Maps packages; set SERPER_API_KEY for SEO/organic). Refresh the queue.`,
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
export async function runHunterSyncInline(maxLeads = 5): Promise<HunterSyncResult> {
  if (placesKey()) {
    return runPlacesSync(maxLeads);
  }
  return runFixtureSync();
}

/**
 * In-deployment Hunter sync: Places discovery when a Maps key is set,
 * otherwise upsert committed fixtures. Posts through /api/webhooks/hunter
 * so ingest + dedupe stay identical to GitHub Actions / OpenClaw.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { fetchPlaceDetails, placeDetailsToProfile, placesApiKey } from "@/lib/places";

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
  profile?: {
    place_id?: string;
    website?: string | null;
    maps_url?: string | null;
    address?: string | null;
    rating?: number | null;
    review_count?: number | null;
    types?: string[];
    maps_query?: string | null;
    hours_open_now?: boolean | null;
    has_hours?: boolean | null;
    photo_count?: number | null;
    business_status?: string | null;
    fetched_at?: string;
  };
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
  const data = (await res.json()) as { status: string; results?: Array<{ place_id?: string; name?: string }>; error_message?: string };
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

  const queries = DEFAULT_QUERIES.slice(0, 5);
  const seen = new Set<string>();
  const candidates: Array<{ placeId: string; query: string }> = [];

  for (const query of queries) {
    if (candidates.length >= maxLeads * 3) break;
    let results: Array<{ place_id?: string }>;
    try {
      results = await textSearch(key, query);
    } catch (e) {
      return {
        ok: false,
        error: `Places search failed: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
    for (const hit of results.slice(0, 8)) {
      if (!hit.place_id || seen.has(hit.place_id)) continue;
      seen.add(hit.place_id);
      candidates.push({ placeId: hit.place_id, query });
    }
  }

  let posted = 0;
  for (const c of candidates) {
    if (posted >= maxLeads) break;
    let det: Awaited<ReturnType<typeof fetchPlaceDetails>>;
    try {
      det = await fetchPlaceDetails(c.placeId);
    } catch {
      continue;
    }
    if (!det || det.business_status === "CLOSED_PERMANENTLY") continue;
    const phone = det.formatted_phone_number?.trim();
    if (!phone) continue;
    const reviews = det.user_ratings_total ?? 0;
    const ratingNum = typeof det.rating === "number" ? det.rating : 0;
    if (reviews < 8) continue;
    if (ratingNum > 0 && ratingNum < 3.5) continue;

    const name = (det.name || "Unknown").trim();
    const profile = placeDetailsToProfile(det, { maps_query: c.query });
    const website = profile.website;
    const mapsUrl = profile.maps_url;
    const rating = profile.rating;

    const { ok, status } = await postLead({
      name,
      company: name,
      phone,
      source: "hunter_leadfinder_button",
      external_id: `google_place:${det.place_id || c.placeId}`,
      notes: [
        `Reviews: ${reviews} · Rating: ${rating ?? "n/a"}`,
        website ? `Website: ${website}` : "Website: no",
        mapsUrl ? `Maps: ${mapsUrl}` : null,
        `Maps query: ${c.query}`,
        det.formatted_address ? `Address: ${det.formatted_address}` : null,
        "Pipeline: outbound-crm Run Hunter now (inline Places)",
      ]
        .filter(Boolean)
        .join(" · "),
      profile,
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
        "Places ran but no leads posted (filters/phone/billing). Check Places API on the key, then retry.",
    };
  }

  return {
    ok: true,
    mode: "places",
    posted,
    message: `Hunter Leadfinder posted ${posted} Places lead(s). Refresh the queue.`,
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

/** Prefer live Places Leadfinder; fall back to fixtures. */
export async function runHunterSyncInline(maxLeads = 8): Promise<HunterSyncResult> {
  if (placesKey()) {
    return runPlacesSync(maxLeads);
  }
  return runFixtureSync();
}

#!/usr/bin/env node
/**
 * Hunter-aligned outbound bridge for GitHub Actions.
 *
 * OpenClaw Hunter on your Mac Mini runs inside ~/.openclaw/ with Paperclip/cron;
 * that logic is not in public git. This script mirrors BUSINESS_PLAN § "Outreach
 * System (Autonomous)" + stack notes (Maps discovery, Golden Triangle scoring,
 * Beacon flags for heavy GBP/review profiles).
 *
 * Pipeline: Text Search (Maps-equivalent) → Place Details → score & rank → POST
 * top N to the CRM Hunter webhook (same JSON OpenClaw would emit).
 *
 * Env:
 *   GOOGLE_PLACES_API_KEY    — GCP key with Places API enabled
 *   OUTBOUND_CRM_WEBHOOK_URL — https://…/api/webhooks/hunter
 *   HUNTER_WEBHOOK_SECRET    — Bearer secret (match Vercel)
 *   MAX_LEADS                — optional, default 10
 *   MIN_USER_RATINGS_TOTAL   — optional, default 12
 *   MIN_RATING               — optional, default 3.7 (skip unrated if reviews low)
 *   POOL_MULTIPLIER          — optional, default 5 — fetch up to MAX_LEADS×this hits before scoring
 *   HUNTER_SEARCH_QUERIES_PATH — optional JSON array of query strings
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const KEY = process.env.GOOGLE_PLACES_API_KEY?.trim();
const WEBHOOK = process.env.OUTBOUND_CRM_WEBHOOK_URL?.trim().replace(/\/+$/, "");
const SECRET = process.env.HUNTER_WEBHOOK_SECRET?.trim();
const MAX_LEADS = Math.min(50, Math.max(1, parseInt(process.env.MAX_LEADS || "10", 10) || 10));
const MIN_USER_RATINGS_TOTAL = Math.max(0, parseInt(process.env.MIN_USER_RATINGS_TOTAL || "12", 10) || 12);
const MIN_RATING = Math.min(5, Math.max(0, parseFloat(process.env.MIN_RATING || "3.7") || 3.7));
const POOL_MULTIPLIER = Math.min(12, Math.max(2, parseInt(process.env.POOL_MULTIPLIER || "5", 10) || 5));

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
].join(",");

const queriesPath = process.env.HUNTER_SEARCH_QUERIES_PATH?.trim() || join(__dirname, "hunter-search-queries.json");

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

if (!KEY) fail("Missing GOOGLE_PLACES_API_KEY");
if (!WEBHOOK) fail("Missing OUTBOUND_CRM_WEBHOOK_URL");
if (!SECRET) fail("Missing HUNTER_WEBHOOK_SECRET");

let queries;
try {
  queries = JSON.parse(readFileSync(queriesPath, "utf8"));
} catch (e) {
  fail(`Could not read queries JSON (${queriesPath}): ${e instanceof Error ? e.message : e}`);
}
if (!Array.isArray(queries) || !queries.every((q) => typeof q === "string" && q.trim())) {
  fail("Queries file must be a JSON array of non-empty strings");
}

/**
 * Golden Triangle–style score (0–100): visibility + reputation + scale signals.
 * Tunable heuristic until Mac Mini Hunter exports real scores via webhook.
 */
function hunterStyleScore(det, query) {
  const rating = typeof det.rating === "number" ? det.rating : 0;
  const reviews = typeof det.user_ratings_total === "number" ? det.user_ratings_total : 0;
  const hasWebsite = Boolean(det.website?.trim());

  const ratingPart = Math.min(38, (rating / 5) * 38);
  const reviewPart = Math.min(
    42,
    (Math.log10(reviews + 1) / Math.log10(2001)) * 42,
  );
  const webPart = hasWebsite ? 12 : 0;

  let beaconBoost = 0;
  const mapsHeavy =
    reviews >= 180 ||
    /\b(locations|service area|areas we serve|salt lake|utah county|counties)\b/i.test(
      `${det.formatted_address ?? ""} ${det.name ?? ""}`,
    );
  if (mapsHeavy && rating >= 4.0) beaconBoost += 8;

  let echoBoost = 0;
  if (reviews >= 80 && rating >= 4.2) echoBoost += 5;

  const queryBoost = /\b(dental|hvac|plumb|roof|landscap|legal|restaurant)\b/i.test(query) ? 2 : 0;

  return Math.round(
    Math.min(100, ratingPart + reviewPart + webPart + beaconBoost + echoBoost + queryBoost),
  );
}

function beaconCandidate(det, score) {
  const reviews = det.user_ratings_total ?? 0;
  const rating = det.rating ?? 0;
  if (reviews >= 250 && rating >= 4.0) return true;
  if (reviews >= 120 && rating >= 4.3) return true;
  return score >= 78 && reviews >= 80;
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

/** @type {{ hit: object; query: string; det: object; score: number; beacon: boolean }[]} */
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

  const reviews = det.user_ratings_total ?? 0;
  const rating = typeof det.rating === "number" ? det.rating : 0;
  if (reviews < MIN_USER_RATINGS_TOTAL) continue;
  if (rating > 0 && rating < MIN_RATING) continue;
  if (rating === 0 && reviews < MIN_USER_RATINGS_TOTAL + 8) continue;

  const score = hunterStyleScore(det, query);
  const beacon = beaconCandidate(det, score);
  enriched.push({ hit, query, det, score, beacon });
  await new Promise((r) => setTimeout(r, 180));
}

enriched.sort((a, b) => b.score - a.score);
const winners = enriched.slice(0, MAX_LEADS);

console.log(
  `Ranked ${enriched.length} qualified prospects; posting top ${winners.length} (cap ${MAX_LEADS}).`,
);

const posted = [];

for (let i = 0; i < winners.length; i++) {
  const { hit, query, det, score, beacon } = winners[i];
  const pid = det.place_id || hit.place_id;
  const name = (det.name || hit.name || "Unknown").trim();
  const phone = det.formatted_phone_number.trim();
  const external_id = `google_place:${pid}`;
  const types = Array.isArray(det.types) ? det.types.slice(0, 6).join(", ") : "";

  const notes = [
    `HunterScore: ${score}/100 (OpenClaw-aligned heuristic; replace when Mini exports scores)`,
    beacon ? "Beacon_candidate: yes (heavy GBP / review profile)" : "Beacon_candidate: no",
    `Reviews: ${det.user_ratings_total ?? 0} · Rating: ${det.rating ?? "n/a"}`,
    det.website ? "Website: yes" : "Website: no",
    types ? `Types: ${types}` : null,
    `Maps query: ${query}`,
    det.formatted_address ? `Address: ${det.formatted_address}` : null,
    "Pipeline: github-actions hunter-daily-outbound-crm",
  ]
    .filter(Boolean)
    .join(" · ");

  const body = {
    name,
    company: name,
    phone,
    source: "hunter_openclaw_aligned_daily",
    notes,
    external_id,
  };

  const { ok, status, json } = await postLead(body);
  if (!ok) {
    console.error(`POST failed ${external_id} HTTP ${status}`, json);
    continue;
  }
  console.log(`OK ${posted.length + 1}/${winners.length}`, external_id, `score=${score}`, json?.id ? `id=${json.id}` : "");
  posted.push(external_id);
  await new Promise((r) => setTimeout(r, 250));
}

console.log(`\nFinished: posted ${posted.length} leads (cap ${MAX_LEADS}).`);
if (posted.length === 0) {
  console.error(
    "No leads posted — tighten MIN_* filters, widen queries, or verify Places billing + webhook secrets.",
  );
  process.exit(1);
}

#!/usr/bin/env node
/**
 * Daily “Hunter” bridge: discover local businesses (Google Places Text Search +
 * Place Details), POST each to the Outbound CRM Hunter webhook.
 *
 * Intended for GitHub Actions cron. OpenClaw Hunter on your Mac Mini can
 * replace this entirely by POSTing the same JSON payloads on its own schedule;
 * see apps/outbound-crm/docs/HUNTER_SCHEDULE.md
 *
 * Env:
 *   GOOGLE_PLACES_API_KEY   — GCP key with Places API enabled
 *   OUTBOUND_CRM_WEBHOOK_URL — https://…/api/webhooks/hunter
 *   HUNTER_WEBHOOK_SECRET    — Bearer secret (match Vercel)
 *   MAX_LEADS                — optional, default 10
 *   HUNTER_SEARCH_QUERIES_PATH — optional path to JSON array of query strings
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const KEY = process.env.GOOGLE_PLACES_API_KEY?.trim();
const WEBHOOK = process.env.OUTBOUND_CRM_WEBHOOK_URL?.trim().replace(/\/+$/, "");
const SECRET = process.env.HUNTER_WEBHOOK_SECRET?.trim();
const MAX_LEADS = Math.min(50, Math.max(1, parseInt(process.env.MAX_LEADS || "10", 10) || 10));

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
  u.searchParams.set("fields", "name,formatted_phone_number,formatted_address,business_status,place_id");
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

const seenPlaceIds = new Set();
const posted = [];

for (const q of queries) {
  if (posted.length >= MAX_LEADS) break;
  let results;
  try {
    results = await textSearch(q);
  } catch (e) {
    console.error(`Query failed (${q.slice(0, 40)}…):`, e instanceof Error ? e.message : e);
    continue;
  }

  for (const hit of results) {
    if (posted.length >= MAX_LEADS) break;
    const pid = hit.place_id;
    if (!pid || seenPlaceIds.has(pid)) continue;
    seenPlaceIds.add(pid);

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
    const external_id = `google_place:${pid}`;
    const body = {
      name,
      company: name,
      phone,
      source: "hunter_google_places_daily",
      notes: [
        `Query: ${q.trim()}`,
        det.formatted_address ? `Address: ${det.formatted_address}` : null,
        "Source: GitHub Actions hunter-daily-outbound-crm",
      ]
        .filter(Boolean)
        .join(" · "),
      external_id,
    };

    const { ok, status, json } = await postLead(body);
    if (!ok) {
      console.error(`POST failed ${external_id} HTTP ${status}`, json);
      continue;
    }
    console.log(`OK ${posted.length + 1}/${MAX_LEADS}`, external_id, json?.id ? `(id ${json.id})` : "");
    posted.push(external_id);

    await new Promise((r) => setTimeout(r, 250));
  }
}

console.log(`\nFinished: posted ${posted.length} leads (cap ${MAX_LEADS}).`);
if (posted.length === 0) {
  console.error("No leads posted — check API key, billing, Places API enabled, or queries returning phones.");
  process.exit(1);
}

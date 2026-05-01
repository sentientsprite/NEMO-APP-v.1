#!/usr/bin/env node
/**
 * POST fixture leads to the Hunter webhook (production or local).
 * Tests the full path: Vercel/Lambda → Supabase service role → outbound_leads.
 *
 * Usage (from apps/outbound-crm):
 *   WEBHOOK_URL=https://<your-outbound-crm>.vercel.app/api/webhooks/hunter \
 *   HUNTER_WEBHOOK_SECRET=<same as Vercel> \
 *   npm run seed:test-leads
 *
 * Optional custom fixture:
 *   npm run seed:test-leads -- ../path/to/leads.json
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const webhookUrl = process.env.WEBHOOK_URL?.trim().replace(/\/+$/, "");
const secret = process.env.HUNTER_WEBHOOK_SECRET?.trim();

const arg = process.argv[2];
const fixturePath = arg ? resolve(process.cwd(), arg) : join(__dirname, "fixtures", "test-leads.json");

if (!webhookUrl) {
  console.error("Missing WEBHOOK_URL (e.g. https://….vercel.app/api/webhooks/hunter)");
  process.exit(1);
}
if (!secret) {
  console.error("Missing HUNTER_WEBHOOK_SECRET (must match Vercel Production env)");
  process.exit(1);
}

let raw;
try {
  raw = readFileSync(fixturePath, "utf8");
} catch (e) {
  console.error("Could not read fixture:", fixturePath, e instanceof Error ? e.message : e);
  process.exit(1);
}

/** @type {unknown} */
const parsed = JSON.parse(raw);
if (!Array.isArray(parsed)) {
  console.error("Fixture must be a JSON array of lead objects");
  process.exit(1);
}

let ok = 0;
let fail = 0;

for (let i = 0; i < parsed.length; i++) {
  const row = parsed[i];
  if (!row || typeof row !== "object") {
    console.error(`Skip index ${i}: not an object`);
    fail++;
    continue;
  }

  const body = JSON.stringify(row);
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body,
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text.slice(0, 500) };
    }
    if (!res.ok) {
      console.error(`FAIL ${i + 1}/${parsed.length}`, row.external_id ?? row.name, res.status, json);
      fail++;
      continue;
    }
    console.log(`OK   ${i + 1}/${parsed.length}`, row.external_id ?? row.name, json);
    ok++;
  } catch (e) {
    console.error(`FAIL ${i + 1}/${parsed.length}`, row.external_id ?? row.name, e instanceof Error ? e.message : e);
    fail++;
  }
}

console.log(`\nDone: ${ok} ok, ${fail} failed (fixture: ${fixturePath})`);
process.exit(fail > 0 ? 1 : 0);

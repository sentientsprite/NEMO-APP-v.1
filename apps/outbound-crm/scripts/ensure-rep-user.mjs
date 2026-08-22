#!/usr/bin/env node
/**
 * Create or reset a Supabase Auth user for outbound CRM login.
 * Requires SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL in .env.local
 *
 * Usage:
 *   node scripts/ensure-rep-user.mjs you@example.com
 *   node scripts/ensure-rep-user.mjs you@example.com 'YourNewPassword123'
 *
 * If password omitted, a random 20-char password is printed once (share out-of-band).
 */
import { readFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function parseEnvFile(filename) {
  const env = {};
  const path = resolve(root, filename);
  if (!existsSync(path)) return env;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

const fileEnv = { ...parseEnvFile(".env"), ...parseEnvFile(".env.local") };
function env(key) {
  return (process.env[key] ?? fileEnv[key] ?? "").trim();
}

const email = (process.argv[2] ?? "").trim().toLowerCase();
const passwordArg = process.argv[3];
if (!email || !email.includes("@")) {
  console.error("Usage: node scripts/ensure-rep-user.mjs <email> [password]");
  process.exit(1);
}

const url = env("NEXT_PUBLIC_SUPABASE_URL");
const service = env("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !service) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const password =
  passwordArg && passwordArg.length >= 8
    ? passwordArg
    : randomBytes(15).toString("base64url").slice(0, 20);

const admin = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: listed, error: listErr } = await admin.auth.admin.listUsers({ perPage: 200 });
if (listErr) {
  console.error("listUsers failed:", listErr.message);
  process.exit(1);
}

const existing = (listed?.users ?? []).find((u) => (u.email ?? "").toLowerCase() === email);

if (existing) {
  const { data, error } = await admin.auth.admin.updateUserById(existing.id, {
    password,
    email_confirm: true,
  });
  if (error) {
    console.error("updateUser failed:", error.message);
    process.exit(1);
  }
  console.log(JSON.stringify({ ok: true, action: "password_reset", id: data.user.id, email }, null, 2));
} else {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) {
    console.error("createUser failed:", error.message);
    process.exit(1);
  }
  console.log(JSON.stringify({ ok: true, action: "created", id: data.user.id, email }, null, 2));
}

if (!passwordArg) {
  console.log("\nOne-time password (share privately, then ask partner to change):");
  console.log(password);
}

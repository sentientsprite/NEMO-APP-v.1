/**
 * Run Hunter inline with production env (Places + Serper + webhook).
 * Usage from apps/outbound-crm:
 *   vercel env pull .env.hunter.run --environment=production --yes
 *   node path/to/tsx/cli.mjs scripts/run-hunter-now.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { runHunterSyncInline } from "../lib/hunter-sync";

function loadEnvFile(name: string) {
  try {
    const text = readFileSync(join(process.cwd(), name), "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    /* optional */
  }
}

loadEnvFile(".env.hunter.run");
loadEnvFile(".env.local");

const maxLeads = Math.min(5, Math.max(3, parseInt(process.env.HUNTER_MAX_LEADS || "5", 10) || 5));

async function main() {
  const result = await runHunterSyncInline(maxLeads);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

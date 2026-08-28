/**
 * Run Hunter inline with production env (Places + Serper + webhook).
 * Usage from apps/outbound-crm:
 *   vercel env pull .env.hunter.run --environment=production --yes
 *   node --env-file=.env.hunter.run --import tsx scripts/run-hunter-now.ts
 */
import { runHunterSyncInline } from "../lib/hunter-sync";

const maxLeads = Math.min(5, Math.max(3, parseInt(process.env.HUNTER_MAX_LEADS || "5", 10) || 5));

const result = await runHunterSyncInline(maxLeads);
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exit(1);

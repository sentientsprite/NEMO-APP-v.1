import type { NemoTier, PlanInfo } from "@/lib/plan";
import { getAdminClient } from "@/lib/supabase/admin";

type PlanRow = {
  tier: NemoTier;
  label: string;
  tagline: string;
  config: {
    liveAi?: boolean;
    strictAi?: boolean;
    allowDemoOutput?: boolean;
    paywallUrl?: string;
    upgradeLabel?: string;
  };
};

const PAYWALL_DEFAULT = "https://vercel.com/docs/ai-gateway/pricing";

export async function loadPlanFromPostgres(tier: NemoTier): Promise<PlanInfo | null> {
  const db = getAdminClient();
  if (!db) return null;

  const { data, error } = await db.from("nemo_plans").select("*").eq("tier", tier).maybeSingle();
  if (error || !data) return null;

  const row = data as PlanRow;
  const cfg = row.config ?? {};

  return {
    tier: row.tier,
    label: row.label,
    tagline: row.tagline,
    liveAi: Boolean(cfg.liveAi),
    strictAi: Boolean(cfg.strictAi),
    allowDemoOutput: Boolean(cfg.allowDemoOutput),
    paywallUrl:
      cfg.paywallUrl ??
      process.env.NEMO_PAYWALL_URL ??
      (tier === "paywall" ? PAYWALL_DEFAULT : tier === "demo" ? "/pricing" : ""),
    upgradeLabel:
      cfg.upgradeLabel ??
      (tier === "demo" ? "Upgrade to Pro" : tier === "paywall" ? "Add AI credits" : ""),
  };
}

export async function listPlansFromPostgres(): Promise<PlanInfo[]> {
  const db = getAdminClient();
  if (!db) return [];

  const { data, error } = await db.from("nemo_plans").select("*").order("tier");
  if (error || !data) return [];

  const plans: PlanInfo[] = [];
  for (const row of data as PlanRow[]) {
    const plan = await loadPlanFromPostgres(row.tier);
    if (plan) plans.push(plan);
  }
  return plans;
}

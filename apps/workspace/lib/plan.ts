export type NemoTier = "demo" | "paywall" | "production";

export interface PlanInfo {
  tier: NemoTier;
  label: string;
  tagline: string;
  /** Attempt Vercel AI Gateway for agent stages. */
  liveAi: boolean;
  /** Throw on AI failure instead of fallback. */
  strictAi: boolean;
  /** Allow grounded or fixture demo when live AI is off or blocked. */
  allowDemoOutput: boolean;
  paywallUrl: string;
  upgradeLabel: string;
}

const TIER_META: Record<NemoTier, Omit<PlanInfo, "tier">> = {
  demo: {
    label: "Live Demo",
    tagline: "Real URL fetch · sample summaries · no account required",
    liveAi: false,
    strictAi: false,
    allowDemoOutput: true,
    paywallUrl: "https://nemo-workspace.vercel.app/pricing",
    upgradeLabel: "Upgrade to Pro",
  },
  paywall: {
    label: "Pro",
    tagline: "Live AI agents · requires AI Gateway credits",
    liveAi: true,
    strictAi: false,
    allowDemoOutput: false,
    paywallUrl:
      process.env.NEMO_PAYWALL_URL ??
      "https://vercel.com/docs/ai-gateway/pricing",
    upgradeLabel: "Add AI credits",
  },
  production: {
    label: "Production",
    tagline: "Full live AI · strict mode · no silent fallbacks",
    liveAi: true,
    strictAi: true,
    allowDemoOutput: false,
    paywallUrl: process.env.NEMO_PAYWALL_URL ?? "",
    upgradeLabel: "",
  },
};

function parseTier(raw: string | undefined): NemoTier | null {
  if (raw === "demo" || raw === "paywall" || raw === "production") return raw;
  return null;
}

/** Resolve deployment tier from NEMO_TIER, with legacy NEMO_AI_MODE hints. */
export function getPlan(): PlanInfo {
  const explicit = parseTier(process.env.NEMO_TIER?.trim());
  if (explicit) {
    return { tier: explicit, ...TIER_META[explicit] };
  }

  if (process.env.NEMO_AI_MODE === "live" && process.env.NEMO_AI_STRICT === "1") {
    return { tier: "production", ...TIER_META.production };
  }
  if (process.env.NEMO_AI_MODE === "live") {
    return { tier: "paywall", ...TIER_META.paywall };
  }

  return { tier: "demo", ...TIER_META.demo };
}

/** Prefer Postgres plan row when Supabase is configured. */
export async function getPlanAsync(): Promise<PlanInfo> {
  const tier = getPlan().tier;
  try {
    const { loadPlanFromPostgres } = await import("@/lib/db/plans-postgres");
    const fromDb = await loadPlanFromPostgres(tier);
    if (fromDb) return fromDb;
  } catch {
    // Fall back to env-defined plan metadata.
  }
  return getPlan();
}

export function planForClient(plan: PlanInfo) {
  return {
    tier: plan.tier,
    label: plan.label,
    tagline: plan.tagline,
    liveAi: plan.liveAi,
    paywallUrl: plan.paywallUrl,
    upgradeLabel: plan.upgradeLabel,
  };
}

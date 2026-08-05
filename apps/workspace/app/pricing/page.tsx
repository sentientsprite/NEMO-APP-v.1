import Link from "next/link";

import { Header, PlanBanner } from "@/components/Shell";
import { getPlan } from "@/lib/plan";

export default function PricingPage() {
  const current = getPlan();

  const tiers = [
    {
      id: "demo" as const,
      name: "Live Demo",
      price: "Free",
      blurb: "Public demo — real URL fetch, extractive summaries, no API key.",
      features: [
        "Fetch & index URLs automatically",
        "Grounded excerpts from page content",
        "Full workflow UI with approval gates",
        "Clearly labeled demo output",
      ],
      deploy: "NEMO_TIER=demo",
      href: "https://nemo-workspace.vercel.app",
    },
    {
      id: "paywall" as const,
      name: "Pro",
      price: "Usage-based",
      blurb: "Live AI agents via Vercel AI Gateway — requires credits on file.",
      features: [
        "Everything in Live Demo",
        "Routed models: Kimi K2.7 (bulk) + Opus 4.8 (critical)",
        "Honest paywall when credits unavailable",
        "No silent demo fallback",
      ],
      deploy: "NEMO_TIER=paywall",
      href: process.env.NEMO_PRO_URL ?? "https://nemo-workspace-pro.vercel.app",
    },
    {
      id: "production" as const,
      name: "Production",
      price: "Your infra",
      blurb: "Strict live AI for your team or customers — no fallbacks.",
      features: [
        "Live AI only (strict mode)",
        "Private Blob storage",
        "Custom domain & env isolation",
        "Fails loudly if AI unavailable",
      ],
      deploy: "NEMO_TIER=production",
      href: process.env.NEMO_PRODUCTION_URL ?? "#",
    },
  ];

  return (
    <div className="min-h-screen">
      <Header plan={current} />
      <main className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="text-3xl font-semibold">Plans</h1>
        <p className="mt-2 max-w-2xl text-nemo-muted">
          Three deployment tiers: a free live demo anyone can try, a Pro instance gated on AI
          Gateway credits, and a strict production instance for real workloads.
        </p>

        <p className="mt-4 text-sm text-nemo-muted">
          Current deployment: <strong className="text-nemo-text">{current.label}</strong>
        </p>

        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {tiers.map((tier) => (
            <div
              key={tier.id}
              className={`rounded-lg border p-6 ${
                current.tier === tier.id
                  ? "border-nemo-accent bg-[#21262d]"
                  : "border-nemo-border bg-nemo-surface"
              }`}
            >
              <h2 className="text-xl font-semibold">{tier.name}</h2>
              <p className="mt-1 text-2xl font-medium text-nemo-accent">{tier.price}</p>
              <p className="mt-3 text-sm text-nemo-muted">{tier.blurb}</p>
              <ul className="mt-4 space-y-2 text-sm text-nemo-muted">
                {tier.features.map((f) => (
                  <li key={f}>• {f}</li>
                ))}
              </ul>
              <p className="mt-4 font-mono text-xs text-nemo-muted">{tier.deploy}</p>
              {tier.href !== "#" && (
                <Link
                  href={tier.href}
                  className="mt-4 inline-block text-sm text-nemo-accent underline"
                >
                  Open {tier.name} →
                </Link>
              )}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

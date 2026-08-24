/**
 * PageSpeed Insights (Lighthouse) — best-effort enrichment for workflow sourceContext.
 * Requires GOOGLE_PAGESPEED_API_KEY or GOOGLE_MAPS_API_KEY with PageSpeed API enabled.
 */

export function isPageSpeedConfigured(): boolean {
  return Boolean(pagespeedApiKey());
}

function pagespeedApiKey(): string {
  return (
    process.env.GOOGLE_PAGESPEED_API_KEY?.trim() ||
    process.env.PAGESPEED_API_KEY?.trim() ||
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    ""
  );
}

export type PageSpeedStrategy = "mobile" | "desktop";

export interface PageSpeedStrategyResult {
  strategy: PageSpeedStrategy;
  performance?: number;
  accessibility?: number;
  bestPractices?: number;
  seo?: number;
  fcp?: string;
  lcp?: string;
  cls?: string;
  tbt?: string;
  speedIndex?: string;
  error?: string;
}

export interface PageSpeedReport {
  url: string;
  strategies: PageSpeedStrategyResult[];
  skipped?: string;
}

function score100(raw: number | undefined): number | undefined {
  if (typeof raw !== "number" || Number.isNaN(raw)) return undefined;
  return Math.round(raw * 100);
}

function auditDisplay(
  audits: Record<string, { displayValue?: string } | undefined> | undefined,
  id: string,
): string | undefined {
  return audits?.[id]?.displayValue;
}

async function runStrategy(
  pageUrl: string,
  strategy: PageSpeedStrategy,
  key: string,
  timeoutMs: number,
): Promise<PageSpeedStrategyResult> {
  const params = new URLSearchParams({
    url: pageUrl,
    strategy,
    key,
    category: "performance",
  });
  // Multiple category params
  const qs = `${params.toString()}&category=seo&category=accessibility&category=best-practices`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${qs}`, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    const json = (await res.json()) as {
      error?: { message?: string };
      lighthouseResult?: {
        categories?: Record<string, { score?: number }>;
        audits?: Record<string, { displayValue?: string }>;
      };
    };

    if (!res.ok || json.error) {
      return {
        strategy,
        error: json.error?.message || `PageSpeed HTTP ${res.status}`,
      };
    }

    const cats = json.lighthouseResult?.categories ?? {};
    const audits = json.lighthouseResult?.audits;

    return {
      strategy,
      performance: score100(cats.performance?.score),
      accessibility: score100(cats.accessibility?.score),
      bestPractices: score100(cats["best-practices"]?.score),
      seo: score100(cats.seo?.score),
      fcp: auditDisplay(audits, "first-contentful-paint"),
      lcp: auditDisplay(audits, "largest-contentful-paint"),
      cls: auditDisplay(audits, "cumulative-layout-shift"),
      tbt: auditDisplay(audits, "total-blocking-time"),
      speedIndex: auditDisplay(audits, "speed-index"),
    };
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "PageSpeed timed out"
        : error instanceof Error
          ? error.message
          : "PageSpeed failed";
    return { strategy, error: message };
  } finally {
    clearTimeout(timer);
  }
}

/** Run mobile + desktop PSI. No-ops with skipped note when API key missing. */
export async function fetchPageSpeedReport(
  pageUrl: string,
  options: { timeoutMs?: number } = {},
): Promise<PageSpeedReport> {
  const key = pagespeedApiKey();
  if (!key) {
    return {
      url: pageUrl,
      strategies: [],
      skipped: "GOOGLE_PAGESPEED_API_KEY (or GOOGLE_MAPS_API_KEY) not set — PageSpeed skipped",
    };
  }

  const timeoutMs = options.timeoutMs ?? 55_000;
  const strategies = await Promise.all([
    runStrategy(pageUrl, "mobile", key, timeoutMs),
    runStrategy(pageUrl, "desktop", key, timeoutMs),
  ]);

  return { url: pageUrl, strategies };
}

export function formatPageSpeedReport(report: PageSpeedReport): string {
  if (report.skipped) {
    return `### PageSpeed Insights\n- ${report.skipped}`;
  }

  const lines = [`### PageSpeed Insights — ${report.url}`];
  for (const s of report.strategies) {
    lines.push(`#### ${s.strategy}`);
    if (s.error) {
      lines.push(`- Error: ${s.error}`);
      continue;
    }
    lines.push(
      `- Performance: ${s.performance ?? "n/a"}`,
      `- Accessibility: ${s.accessibility ?? "n/a"}`,
      `- Best Practices: ${s.bestPractices ?? "n/a"}`,
      `- SEO (Lighthouse): ${s.seo ?? "n/a"}`,
      `- FCP: ${s.fcp ?? "n/a"} · LCP: ${s.lcp ?? "n/a"} · TBT: ${s.tbt ?? "n/a"} · CLS: ${s.cls ?? "n/a"} · SI: ${s.speedIndex ?? "n/a"}`,
    );
  }
  return lines.join("\n");
}

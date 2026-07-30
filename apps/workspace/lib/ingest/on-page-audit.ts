/**
 * Deterministic on-page SEO / technical signals extracted from HTML.
 * Kept free of imports from ./url to avoid circular deps with gatherUrlContext.
 */

export interface OnPageSignals {
  title?: string;
  metaDescription?: string;
  hasMetaDescription: boolean;
  h1s: string[];
  hasJsonLd: boolean;
  hasViewport: boolean;
  hasOgTitle: boolean;
  canonical?: string;
  issues: string[];
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      try {
        return String.fromCodePoint(parseInt(hex, 16));
      } catch {
        return "";
      }
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      try {
        return String.fromCodePoint(parseInt(dec, 10));
      } catch {
        return "";
      }
    })
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ");
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function extractMetaDescription(html: string): string | undefined {
  const patterns = [
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i,
  ];
  for (const re of patterns) {
    const match = html.match(re);
    const value = match?.[1]?.trim();
    if (value) return decodeEntities(value);
  }
  return undefined;
}

export function extractOnPageSignals(html: string): OnPageSignals {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch?.[1] ? stripTags(titleMatch[1]) : undefined;
  const metaDescription = extractMetaDescription(html);
  const h1s = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)]
    .map((m) => stripTags(m[1] ?? ""))
    .filter(Boolean)
    .slice(0, 10);
  const hasJsonLd = /application\/ld\+json/i.test(html);
  const hasViewport = /name=["']viewport["']/i.test(html);
  const hasOgTitle = /property=["']og:title["']/i.test(html);
  const canonicalMatch = html.match(
    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i,
  );
  const canonical = canonicalMatch?.[1];

  const issues: string[] = [];
  if (!metaDescription) issues.push("Missing meta description");
  if (!title) issues.push("Missing <title>");
  if (h1s.length === 0) issues.push("No H1 found");
  if (h1s.length > 1) {
    issues.push(`Multiple H1s (${h1s.length}) — usually one primary H1 is better`);
  }
  if (!hasJsonLd) issues.push("No JSON-LD schema detected");
  if (!hasViewport) issues.push("Missing viewport meta (mobile)");
  if (!hasOgTitle) issues.push("Missing og:title (weak social/share previews)");
  if (!canonical) issues.push("No canonical link tag detected");

  return {
    title,
    metaDescription,
    hasMetaDescription: Boolean(metaDescription),
    h1s,
    hasJsonLd,
    hasViewport,
    hasOgTitle,
    canonical,
    issues,
  };
}

export function formatOnPageAudit(url: string, signals: OnPageSignals): string {
  const lines = [
    `### On-page audit (deterministic) — ${url}`,
    `- Title: ${signals.title ?? "(none)"}`,
    `- Meta description: ${signals.metaDescription ?? "MISSING"}`,
    `- H1s (${signals.h1s.length}): ${
      signals.h1s.length ? signals.h1s.map((h) => `"${h}"`).join("; ") : "(none)"
    }`,
    `- JSON-LD schema: ${signals.hasJsonLd ? "yes" : "no"}`,
    `- Viewport: ${signals.hasViewport ? "yes" : "no"}`,
    `- og:title: ${signals.hasOgTitle ? "yes" : "no"}`,
    `- Canonical: ${signals.canonical ?? "(none)"}`,
  ];
  if (signals.issues.length) {
    lines.push("- Issues:");
    for (const issue of signals.issues) lines.push(`  - ${issue}`);
  }
  return lines.join("\n");
}

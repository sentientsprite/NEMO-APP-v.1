export const MAX_IMPORT_CHARS = 80_000;
export const MAX_URL_BYTES = 2_000_000;
export const FETCH_TIMEOUT_MS = 15_000;
export const MAX_REDIRECTS = 3;

export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local")) return true;
  if (host === "::1" || host.startsWith("127.")) return true;
  if (host.startsWith("10.") || host.startsWith("192.168.")) return true;

  const match = host.match(/^172\.(\d+)\./);
  if (match) {
    const second = Number(match[1]);
    if (second >= 16 && second <= 31) return true;
  }

  // Block link-local and metadata endpoints
  if (host === "169.254.169.254") return true;
  if (host.endsWith(".internal")) return true;

  return false;
}

export function assertPublicUrl(url: URL): void {
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only http and https URLs are supported");
  }
  if (isPrivateHost(url.hostname)) {
    throw new Error("Private or local URLs are blocked for safety");
  }
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  copy: "©",
  reg: "®",
  trade: "™",
};

export function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      safeFromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec) => safeFromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (match, name) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

function safeFromCodePoint(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return "";
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

/**
 * Converts HTML to readable plain text. Removes non-content regions (script,
 * style, svg, head, nav, footer, comments), preserves block boundaries as
 * newlines so sentences don't run together, then decodes entities.
 */
export function htmlToText(html: string): string {
  const withoutNoise = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<head[\s\S]*?<\/head>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ");

  const withBreaks = withoutNoise
    .replace(/<\/(p|div|section|article|li|h[1-6]|tr|header)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ");

  const stripped = withBreaks.replace(/<[^>]+>/g, " ");

  return decodeEntities(stripped)
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Extracts the best available short page description from raw HTML. */
export function extractMetaDescription(html: string): string | undefined {
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

export interface ImportedUrl {
  url: string;
  title: string;
  content: string;
  description?: string;
  fetchedAt: string;
  contentType?: string;
  /** Deterministic on-page SEO signals when HTML was fetched. */
  onPageAudit?: string;
}

async function readResponseText(res: Response, maxBytes: number): Promise<string> {
  const lengthHeader = res.headers.get("content-length");
  if (lengthHeader) {
    const len = Number(lengthHeader);
    if (!Number.isNaN(len) && len > maxBytes) {
      throw new Error(`Response too large (${len} bytes)`);
    }
  }

  const reader = res.body?.getReader();
  if (!reader) {
    const text = await res.text();
    if (text.length > maxBytes) throw new Error("Response too large");
    return text;
  }

  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("Response too large");
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder("utf-8", { fatal: false }).decode(merged);
}

/** Fetch with timeout, redirect cap, and SSRF checks on every hop. */
export async function safeFetchUrl(
  startUrl: string,
  options: { timeoutMs?: number; maxRedirects?: number } = {},
): Promise<{ response: Response; finalUrl: URL }> {
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;
  const maxRedirects = options.maxRedirects ?? MAX_REDIRECTS;

  let current = new URL(startUrl);
  assertPublicUrl(current);

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "user-agent": "NEMO-Workspace/0.1 (+https://github.com/sentientsprite/NEMO-APP-v.1)",
          accept: "text/html,application/xhtml+xml,text/plain,text/csv,application/json;q=0.9,*/*;q=0.8",
        },
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) throw new Error(`Redirect ${res.status} without Location header`);
        if (hop >= maxRedirects) throw new Error("Too many redirects");
        current = new URL(location, current);
        assertPublicUrl(current);
        continue;
      }

      if (!res.ok) throw new Error(`URL returned ${res.status}`);
      return { response: res, finalUrl: current };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("URL fetch timed out");
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error("Too many redirects");
}

export async function importUrl(sourceUrl: string): Promise<ImportedUrl> {
  const { response: res, finalUrl } = await safeFetchUrl(sourceUrl);

  const raw = (await readResponseText(res, MAX_URL_BYTES)).slice(0, MAX_IMPORT_CHARS);
  const contentType = res.headers.get("content-type") ?? "";
  const isHtml = contentType.includes("html");
  const bodyText = isHtml ? htmlToText(raw) : raw.trim();
  const description = isHtml ? extractMetaDescription(raw) : undefined;
  const titleMatch = raw.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = (titleMatch?.[1] ? decodeEntities(titleMatch[1]).trim() : "") || finalUrl.hostname;

  const { extractOnPageSignals, formatOnPageAudit } = await import("./on-page-audit");
  const onPageAudit = isHtml
    ? formatOnPageAudit(finalUrl.toString(), extractOnPageSignals(raw))
    : undefined;

  // SPA / JS-rendered pages often expose little server-side text. Fall back to
  // the meta description so demo summaries have real, citable content instead
  // of leftover markup fragments.
  const MIN_BODY_CHARS = 120;
  let content = bodyText;
  if (bodyText.length < MIN_BODY_CHARS && description) {
    content = [description, bodyText].filter(Boolean).join("\n\n").trim();
  }

  if (!content.trim()) {
    throw new Error("No readable text extracted from URL");
  }

  return {
    url: finalUrl.toString(),
    title,
    content,
    description,
    fetchedAt: new Date().toISOString(),
    contentType: contentType.split(";")[0]?.trim(),
    onPageAudit,
  };
}

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"')]+/gi;

/** Extracts unique, de-duplicated http(s) URLs from free text. */
export function extractUrls(text: string): string[] {
  const matches = text.match(URL_PATTERN) ?? [];
  const cleaned = matches.map((m) => m.replace(/[.,;:]+$/, ""));
  return Array.from(new Set(cleaned));
}

export interface GatheredContext {
  imported: ImportedUrl[];
  failed: Array<{ url: string; error: string }>;
  context: string;
}

/**
 * Fetches every public URL found in the given text and returns a combined
 * context block plus per-URL success/failure detail. Best-effort: a failed
 * fetch is reported, not thrown, so one bad link never blocks a workflow.
 */
export async function gatherUrlContext(
  text: string,
  options: { maxUrls?: number; perUrlChars?: number } = {},
): Promise<GatheredContext> {
  const maxUrls = options.maxUrls ?? 3;
  const perUrlChars = options.perUrlChars ?? 12_000;
  const urls = extractUrls(text).slice(0, maxUrls);

  const imported: ImportedUrl[] = [];
  const failed: Array<{ url: string; error: string }> = [];

  for (const url of urls) {
    try {
      const result = await importUrl(url);
      imported.push({ ...result, content: result.content.slice(0, perUrlChars) });
    } catch (error) {
      failed.push({ url, error: error instanceof Error ? error.message : "fetch failed" });
    }
  }

  const context = imported
    .map((doc) => {
      const summary = doc.description ? `_Summary:_ ${doc.description}\n` : "";
      const audit = doc.onPageAudit ? `\n${doc.onPageAudit}\n` : "";
      return `### Source: ${doc.title} (${doc.url})\n_fetched ${doc.fetchedAt}_\n${summary}${audit}${doc.content}`;
    })
    .join("\n\n");

  return { imported, failed, context };
}

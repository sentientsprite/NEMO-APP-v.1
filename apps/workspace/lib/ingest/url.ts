export const MAX_IMPORT_CHARS = 80_000;

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

  return false;
}

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface ImportedUrl {
  url: string;
  title: string;
  content: string;
}

export async function importUrl(sourceUrl: string): Promise<ImportedUrl> {
  const url = new URL(sourceUrl);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only http and https URLs are supported");
  }
  if (isPrivateHost(url.hostname)) {
    throw new Error("Private or local URLs are blocked for safety");
  }

  const res = await fetch(url, {
    headers: {
      "user-agent": "NEMO-Workspace/0.1 (+https://github.com/sentientsprite/NEMO-APP-v.1)",
    },
  });
  if (!res.ok) throw new Error(`URL returned ${res.status}`);

  const raw = (await res.text()).slice(0, MAX_IMPORT_CHARS);
  const contentType = res.headers.get("content-type") ?? "";
  const content = contentType.includes("html") ? htmlToText(raw) : raw;
  const titleMatch = raw.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch?.[1]?.trim() || url.hostname;

  return { url: url.toString(), title, content };
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
    .map((doc) => `### Source: ${doc.title} (${doc.url})\n${doc.content}`)
    .join("\n\n");

  return { imported, failed, context };
}

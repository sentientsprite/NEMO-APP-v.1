/**
 * Google Custom Search JSON API — site: footprint + branded organic checks.
 * Requires GOOGLE_CSE_CX (Programmable Search Engine ID, entire-web mode).
 * Key: GOOGLE_CSE_API_KEY, else Places / Maps key.
 */
import { placesApiKey } from "@/lib/places";

export type CseHit = { link: string; title: string; displayLink?: string };

export type CseSearchResult = {
  totalResults: number;
  items: CseHit[];
};

export type OrganicFootprint = {
  skipped: boolean;
  reason?: string;
  hostname?: string | null;
  site_query?: string;
  site_total_results?: number | null;
  branded_query?: string;
  branded_hit?: boolean | null;
  branded_rank?: number | null;
  branded_top_links?: string[];
  fetched_at?: string;
};

function cseKey(): string {
  return (
    process.env.GOOGLE_CSE_API_KEY?.trim() ||
    placesApiKey() ||
    ""
  );
}

export function cseCx(): string {
  return process.env.GOOGLE_CSE_CX?.trim() || "";
}

export function isCustomSearchConfigured(): boolean {
  return Boolean(cseCx() && cseKey());
}

export function hostnameFromUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

/** Pull a city-ish token from "123 Main St, West Jordan, UT 84081" or a Maps query. */
export function cityHintFromAddressOrQuery(
  address: string | null | undefined,
  mapsQuery: string | null | undefined,
): string {
  if (address?.trim()) {
    const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
    // "street, City, ST ZIP" → City
    if (parts.length >= 2) {
      const city = parts[parts.length - 2]!;
      if (!/^\d{5}/.test(city) && city.length > 1) return city.replace(/\s+[A-Z]{2}$/, "").trim();
    }
  }
  if (mapsQuery?.trim()) {
    const m = mapsQuery.match(
      /\b(?:in\s+)?([A-Za-z][A-Za-z\s]+?)\s+(?:UT|Utah|CA|TX|AZ|NV|CO|ID)\b/i,
    );
    if (m?.[1]) return m[1].trim();
    const tokens = mapsQuery.trim().split(/\s+/);
    if (tokens.length >= 2) return tokens.slice(-3, -1).join(" ") || tokens[tokens.length - 2]!;
  }
  return "Salt Lake City";
}

export async function cseSearch(query: string, num = 5): Promise<CseSearchResult> {
  const key = cseKey();
  const cx = cseCx();
  if (!key || !cx) {
    throw new Error("Custom Search not configured (need GOOGLE_CSE_CX + API key)");
  }

  const u = new URL("https://www.googleapis.com/customsearch/v1");
  u.searchParams.set("key", key);
  u.searchParams.set("cx", cx);
  u.searchParams.set("q", query);
  u.searchParams.set("num", String(Math.min(10, Math.max(1, num))));

  const res = await fetch(u, { signal: AbortSignal.timeout(12_000) });
  const data = (await res.json()) as {
    error?: { message?: string };
    searchInformation?: { totalResults?: string };
    items?: Array<{ link?: string; title?: string; displayLink?: string }>;
  };

  if (!res.ok || data.error) {
    throw new Error(`CSE: ${data.error?.message || res.status}`);
  }

  const totalRaw = data.searchInformation?.totalResults;
  const totalResults = totalRaw != null ? parseInt(totalRaw, 10) || 0 : 0;
  const items: CseHit[] = (data.items ?? [])
    .filter((i) => i.link)
    .map((i) => ({
      link: i.link!,
      title: i.title || "",
      displayLink: i.displayLink,
    }));

  return { totalResults, items };
}

export async function organicFootprint(input: {
  website?: string | null;
  businessName: string;
  city: string;
}): Promise<OrganicFootprint> {
  const fetched_at = new Date().toISOString();

  if (!isCustomSearchConfigured()) {
    return { skipped: true, reason: "GOOGLE_CSE_CX not set", fetched_at };
  }

  const hostname = hostnameFromUrl(input.website);
  const out: OrganicFootprint = {
    skipped: false,
    hostname,
    fetched_at,
  };

  try {
    if (hostname) {
      out.site_query = `site:${hostname}`;
      const site = await cseSearch(out.site_query, 3);
      out.site_total_results = site.totalResults;
    } else {
      out.site_total_results = null;
      out.site_query = undefined;
    }

    const safeName = input.businessName.replace(/"/g, "").trim();
    out.branded_query = `"${safeName}" ${input.city}`.trim();
    const branded = await cseSearch(out.branded_query, 5);
    out.branded_top_links = branded.items.map((i) => i.link);

    let rank: number | null = null;
    if (hostname) {
      for (let i = 0; i < branded.items.length; i++) {
        const host = hostnameFromUrl(branded.items[i]!.link);
        if (host && (host === hostname || host.endsWith(`.${hostname}`) || hostname.endsWith(`.${host}`))) {
          rank = i + 1;
          break;
        }
      }
    }
    if (rank == null) {
      const nameTokens = safeName.toLowerCase().split(/\s+/).filter((t) => t.length > 2).slice(0, 3);
      for (let i = 0; i < branded.items.length; i++) {
        const title = (branded.items[i]!.title || "").toLowerCase();
        if (nameTokens.length && nameTokens.every((t) => title.includes(t))) {
          rank = i + 1;
          break;
        }
      }
    }

    out.branded_rank = rank;
    out.branded_hit = rank != null;
  } catch (e) {
    return {
      skipped: true,
      reason: e instanceof Error ? e.message : String(e),
      hostname,
      fetched_at,
    };
  }

  return out;
}

/**
 * Organic SERP footprint for Hunter weak-presence scoring.
 * Primary: Serper (SERPER_API_KEY). Fallback: SerpAPI (SERPAPI_API_KEY).
 * Google Custom Search JSON API is abandoned (closed to new customers).
 */
export type SerpHit = { link: string; title: string; displayLink?: string };

export type SerpSearchResult = {
  totalResults: number;
  items: SerpHit[];
  provider: "serper" | "serpapi";
};

export type OrganicFootprint = {
  skipped: boolean;
  reason?: string;
  provider?: "serper" | "serpapi";
  hostname?: string | null;
  site_query?: string;
  site_total_results?: number | null;
  branded_query?: string;
  branded_hit?: boolean | null;
  branded_rank?: number | null;
  branded_top_links?: string[];
  fetched_at?: string;
};

function serperKey(): string {
  return process.env.SERPER_API_KEY?.trim() || "";
}

function serpApiKey(): string {
  return process.env.SERPAPI_API_KEY?.trim() || "";
}

export function isOrganicSearchConfigured(): boolean {
  return Boolean(serperKey() || serpApiKey());
}

/** @deprecated use isOrganicSearchConfigured — kept for call-site compatibility */
export function isCustomSearchConfigured(): boolean {
  return isOrganicSearchConfigured();
}

/**
 * One cheap Serper/SerpAPI call to verify the key works.
 * Call once per Hunter run — do not call per candidate.
 */
export async function probeOrganicSearch(): Promise<{
  ok: boolean;
  configured: boolean;
  provider: "serper" | "serpapi" | null;
  error?: string;
}> {
  if (!isOrganicSearchConfigured()) {
    return { ok: false, configured: false, provider: null, error: "SERPER_API_KEY (or SERPAPI_API_KEY) not set" };
  }
  const provider: "serper" | "serpapi" = serperKey() ? "serper" : "serpapi";
  try {
    const r = await serpSearch("site:example.com", 1);
    return { ok: true, configured: true, provider: r.provider };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, configured: true, provider, error: msg };
  }
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

async function serperSearch(query: string, num = 5): Promise<SerpSearchResult> {
  const key = serperKey();
  if (!key) throw new Error("SERPER_API_KEY not set");

  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query, num: Math.min(10, Math.max(1, num)) }),
    signal: AbortSignal.timeout(15_000),
  });

  const data = (await res.json()) as {
    message?: string;
    organic?: Array<{ link?: string; title?: string; position?: number }>;
    searchInformation?: { totalResults?: string | number };
  };

  if (!res.ok) {
    throw new Error(`Serper: ${data.message || res.status}`);
  }

  const items: SerpHit[] = (data.organic ?? [])
    .filter((i) => i.link)
    .map((i) => ({
      link: i.link!,
      title: i.title || "",
      displayLink: hostnameFromUrl(i.link) || undefined,
    }));

  const raw = data.searchInformation?.totalResults;
  let totalResults =
    typeof raw === "number"
      ? raw
      : raw != null
        ? parseInt(String(raw).replace(/,/g, ""), 10) || 0
        : 0;
  // site: queries sometimes omit totalResults — use organic hit count as a floor.
  if (totalResults <= 0 && items.length > 0) totalResults = items.length;

  return { totalResults, items, provider: "serper" };
}

async function serpApiSearch(query: string, num = 5): Promise<SerpSearchResult> {
  const key = serpApiKey();
  if (!key) throw new Error("SERPAPI_API_KEY not set");

  const u = new URL("https://serpapi.com/search.json");
  u.searchParams.set("engine", "google");
  u.searchParams.set("q", query);
  u.searchParams.set("num", String(Math.min(10, Math.max(1, num))));
  u.searchParams.set("api_key", key);

  const res = await fetch(u, { signal: AbortSignal.timeout(20_000) });
  const data = (await res.json()) as {
    error?: string;
    organic_results?: Array<{ link?: string; title?: string; position?: number }>;
    search_information?: { total_results?: number | string };
  };

  if (!res.ok || data.error) {
    throw new Error(`SerpAPI: ${data.error || res.status}`);
  }

  const items: SerpHit[] = (data.organic_results ?? [])
    .filter((i) => i.link)
    .map((i) => ({
      link: i.link!,
      title: i.title || "",
      displayLink: hostnameFromUrl(i.link) || undefined,
    }));

  const raw = data.search_information?.total_results;
  let totalResults =
    typeof raw === "number"
      ? raw
      : raw != null
        ? parseInt(String(raw).replace(/,/g, ""), 10) || 0
        : 0;
  if (totalResults <= 0 && items.length > 0) totalResults = items.length;

  return { totalResults, items, provider: "serpapi" };
}

export async function serpSearch(query: string, num = 5): Promise<SerpSearchResult> {
  if (serperKey()) return serperSearch(query, num);
  if (serpApiKey()) return serpApiSearch(query, num);
  throw new Error("No SERP key (set SERPER_API_KEY or SERPAPI_API_KEY)");
}

export async function organicFootprint(input: {
  website?: string | null;
  businessName: string;
  city: string;
}): Promise<OrganicFootprint> {
  const fetched_at = new Date().toISOString();

  if (!isOrganicSearchConfigured()) {
    return {
      skipped: true,
      reason: "SERPER_API_KEY (or SERPAPI_API_KEY) not set",
      fetched_at,
    };
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
      const site = await serpSearch(out.site_query, 5);
      out.site_total_results = site.totalResults;
      out.provider = site.provider;
    } else {
      out.site_total_results = null;
      out.site_query = undefined;
    }

    const safeName = input.businessName.replace(/"/g, "").trim();
    out.branded_query = `"${safeName}" ${input.city}`.trim();
    const branded = await serpSearch(out.branded_query, 8);
    out.provider = branded.provider;
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
      const nameTokens = safeName
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 2)
        .slice(0, 3);
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

/**
 * Supabase env helpers — trim + strip CR so pasted Vercel secrets don’t break URLs / JWTs.
 */

function clean(v: string | undefined): string {
  if (!v) return "";
  return v.replace(/\r/g, "").trim().replace(/^["']|["']$/g, "");
}

/**
 * Auth + REST expect the project origin only (https://xxx.supabase.co).
 * Pasting `/rest/v1` or a Vercel URL yields HTML responses → "Unexpected token '<' … JSON".
 */
function normalizeSupabaseProjectUrl(urlCleaned: string): string {
  if (!urlCleaned) return "";
  let u = urlCleaned;
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  try {
    return new URL(u).origin;
  } catch {
    return urlCleaned.replace(/\/+$/, "");
  }
}

/** Exported for admin client / middleware (same paste hygiene). */
export function sanitizeEnv(v: string | undefined): string {
  return clean(v);
}

export function getPublicSupabaseEnv(): { url: string; anon: string } {
  return {
    url: normalizeSupabaseProjectUrl(clean(process.env.NEXT_PUBLIC_SUPABASE_URL)),
    anon: clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  };
}

export function isSupabaseConfigured(): boolean {
  const { url, anon } = getPublicSupabaseEnv();
  return Boolean(url && anon);
}

/** Admin client (webhook): URL + service role. */
export function isSupabaseServiceConfigured(): boolean {
  const url = normalizeSupabaseProjectUrl(clean(process.env.NEXT_PUBLIC_SUPABASE_URL));
  const service = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  return Boolean(url && service);
}

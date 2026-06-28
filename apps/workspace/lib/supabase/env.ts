function clean(v: string | undefined): string {
  if (!v) return "";
  return v.replace(/\r/g, "").trim().replace(/^["']|["']$/g, "");
}

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

export function sanitizeEnv(v: string | undefined): string {
  return clean(v);
}

export function getPublicSupabaseEnv(): { url: string; anon: string } {
  return {
    url: normalizeSupabaseProjectUrl(clean(process.env.NEXT_PUBLIC_SUPABASE_URL)),
    anon: clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  };
}

export function isSupabaseServiceConfigured(): boolean {
  const url = normalizeSupabaseProjectUrl(clean(process.env.NEXT_PUBLIC_SUPABASE_URL));
  const service = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  return Boolean(url && service);
}

import { createClient } from "@supabase/supabase-js";

import { getPublicSupabaseEnv, isSupabaseServiceConfigured, sanitizeEnv } from "@/lib/supabase/env";

export function createAdminClient() {
  const { url } = getPublicSupabaseEnv();
  const service = sanitizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!isSupabaseServiceConfigured() || !url || !service) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

import { createBrowserClient } from "@supabase/ssr";

import { getPublicSupabaseEnv, isSupabaseConfigured } from "@/lib/supabase/env";

export function createClient() {
  const { url, anon } = getPublicSupabaseEnv();
  if (!isSupabaseConfigured() || !url || !anon) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  return createBrowserClient(url, anon);
}

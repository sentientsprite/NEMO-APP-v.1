import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getPublicSupabaseEnv, isSupabaseConfigured } from "@/lib/supabase/env";

export async function createClient() {
  const cookieStore = await cookies();
  const { url, anon } = getPublicSupabaseEnv();
  if (!isSupabaseConfigured() || !url || !anon) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          /* ignore in Server Components */
        }
      },
    },
  });
}

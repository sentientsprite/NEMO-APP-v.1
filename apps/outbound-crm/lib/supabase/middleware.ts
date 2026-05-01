import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getPublicSupabaseEnv } from "@/lib/supabase/env";

/**
 * Refresh Supabase Auth session in middleware.
 * IMPORTANT: On Edge (Vercel), `request.cookies` is read-only — never call
 * `request.cookies.set`. Only mutate `NextResponse.cookies` (see Supabase SSR docs).
 */
export async function updateSession(request: NextRequest) {
  const { url, anon } = getPublicSupabaseEnv();

  if (!url || !anon) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  await supabase.auth.getUser();

  return supabaseResponse;
}

import { NextResponse } from "next/server";

import { isOrganicSearchConfigured, probeOrganicSearch } from "@/lib/custom-search";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 15;

/**
 * GET /api/hunter/serp-health
 * Auth required. Verifies SERPER_API_KEY / SERPAPI_API_KEY with one live query.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
  }

  if (!isOrganicSearchConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        configured: false,
        error: "SERPER_API_KEY (or SERPAPI_API_KEY) is not set on this deployment.",
      },
      { status: 503 },
    );
  }

  const probe = await probeOrganicSearch();
  if (!probe.ok) {
    return NextResponse.json(
      {
        ok: false,
        configured: true,
        provider: probe.provider,
        error: probe.error,
        hint: "Serper returned unauthorized/invalid — create a new key at serper.dev, set SERPER_API_KEY on Vercel Production, redeploy.",
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    configured: true,
    provider: probe.provider,
    message: "SERP key works.",
  });
}

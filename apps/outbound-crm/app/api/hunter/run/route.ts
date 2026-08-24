import { NextResponse } from "next/server";

import { runHunterSyncInline } from "@/lib/hunter-sync";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
/** Places + SERP can take a while; Hobby allows up to 60s. */
export const maxDuration = 60;

/**
 * POST /api/hunter/run
 * Auth required. Runs weak-presence Leadfinder inline (same as former server action).
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
  }

  let maxLeads = 5;
  try {
    const body = (await req.json().catch(() => ({}))) as { maxLeads?: number };
    if (typeof body.maxLeads === "number" && Number.isFinite(body.maxLeads)) {
      maxLeads = Math.min(10, Math.max(1, Math.floor(body.maxLeads)));
    }
  } catch {
    /* empty body ok */
  }

  try {
    const result = await runHunterSyncInline(maxLeads);
    const status = result.ok ? 200 : 500;
    return NextResponse.json(result, { status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: `Hunter sync failed: ${msg}` }, { status: 500 });
  }
}

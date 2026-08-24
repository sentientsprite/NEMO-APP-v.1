import { NextResponse } from "next/server";

import { resolveLeadProfile } from "@/lib/lead-profile";
import {
  buildAuditPayload,
  lvsAppBase,
  reportUrlFromNotes,
  type LvsAuditResponse,
} from "@/lib/run-audit";
import { createClient } from "@/lib/supabase/server";
import type { OutboundLead } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/leads/audit
 * Body: { leadId: string, zip?: string }
 * Runs LVS on the lead (server → nemo /api/lvs), logs activity + Report URL, returns PDF URL.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: { leadId?: string; zip?: string };
  try {
    body = (await req.json()) as { leadId?: string; zip?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const leadId = String(body.leadId ?? "").trim();
  if (!leadId) {
    return NextResponse.json({ ok: false, error: "leadId required" }, { status: 400 });
  }

  const { data: lead, error: fetchErr } = await supabase
    .from("outbound_leads")
    .select("id, name, email, notes, profile, external_id, phone")
    .eq("id", leadId)
    .single();

  if (fetchErr || !lead) {
    return NextResponse.json({ ok: false, error: "Lead not found" }, { status: 404 });
  }

  const row = lead as OutboundLead;
  const payload = buildAuditPayload(row, body.zip);
  if (!payload.ok) {
    return NextResponse.json({ ok: false, error: payload.error }, { status: 400 });
  }

  const lvsUrl = `${lvsAppBase()}/api/lvs`;
  let lvsJson: LvsAuditResponse;
  try {
    const res = await fetch(lvsUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload.body),
      signal: AbortSignal.timeout(55_000),
    });
    lvsJson = (await res.json()) as LvsAuditResponse;
    if (!res.ok || !lvsJson.ok || !lvsJson.reportUrl) {
      return NextResponse.json(
        {
          ok: false,
          error:
            lvsJson.detail ||
            lvsJson.error ||
            lvsJson.hint ||
            `LVS returned ${res.status}`,
        },
        { status: 502 },
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "LVS request failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }

  const grade = lvsJson.grade ?? "?";
  const score = lvsJson.score ?? null;
  const reportUrl = lvsJson.reportUrl;

  const summary = [
    `LVS audit: ${grade}${score != null ? ` / ${score}` : ""}`,
    `Report: ${reportUrl}`,
    `ZIP: ${payload.body.zip}`,
  ].join("\n");

  await supabase.from("outbound_activities").insert({
    lead_id: leadId,
    type: "note",
    note: summary,
    meta: {
      lvs_audit: true,
      grade,
      score,
      reportUrl,
      zip: payload.body.zip,
    },
    created_by: user.id,
  });

  // Keep Report: URL on the lead notes so Open PDF stays available after refresh.
  const existing = (row.notes ?? "").trim();
  const withoutOldReport = existing
    .split(/\n+/)
    .filter((line) => !/^Report:\s*https?:\/\//i.test(line.trim()))
    .join("\n")
    .trim();
  const nextNotes = [withoutOldReport, `Report: ${reportUrl}`, `LVS: ${grade}/${score ?? "—"}`]
    .filter(Boolean)
    .join("\n");

  await supabase.from("outbound_leads").update({ notes: nextNotes }).eq("id", leadId);

  return NextResponse.json({
    ok: true,
    grade,
    score,
    reportUrl,
    hadPriorReport: Boolean(reportUrlFromNotes(row.notes)),
    placeId: resolveLeadProfile(row)?.place_id ?? null,
  });
}

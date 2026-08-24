import { NextResponse } from "next/server";

import {
  buildCallTrackFromAudit,
  formatAuditCallTrackMarkdown,
} from "@/lib/call-track-from-audit";
import { resolveLeadProfile } from "@/lib/lead-profile";
import {
  buildAuditPayload,
  fetchLiveLvs,
  mergeLvsIntoProfile,
  notesWithLvsLine,
  reportUrlFromNotes,
  snapshotFromLvs,
} from "@/lib/run-audit";
import { createClient } from "@/lib/supabase/server";
import type { OutboundLead } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/leads/audit
 * Body: { leadId: string, zip?: string }
 * Runs LVS, returns PDF URL, and writes call track from audit top fixes.
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

  const fetched = await fetchLiveLvs(payload.body);
  if (!fetched.ok) {
    return NextResponse.json({ ok: false, error: fetched.error }, { status: 502 });
  }
  const lvsJson = fetched.json;

  const grade = lvsJson.grade ?? "?";
  const score = lvsJson.score ?? null;
  const reportUrl = lvsJson.reportUrl as string;
  const gaps = buildCallTrackFromAudit(lvsJson);
  const callTrackMd = formatAuditCallTrackMarkdown({
    businessName: row.name,
    grade,
    score,
    reportUrl,
    headline: lvsJson.headline,
    gaps,
  });

  const summary = [
    `LVS audit: ${grade}${score != null ? ` / ${score}` : ""}`,
    `Report: ${reportUrl}`,
    `ZIP: ${payload.body.zip}`,
    lvsJson.topFix?.title ? `Top fix: ${lvsJson.topFix.title}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  await supabase.from("outbound_activities").insert([
    {
      lead_id: leadId,
      type: "note",
      note: summary,
      meta: {
        lvs_audit: true,
        grade,
        score,
        reportUrl,
        zip: payload.body.zip,
        topFix: lvsJson.topFix ?? null,
        headline: lvsJson.headline ?? null,
      },
      created_by: user.id,
    },
    {
      lead_id: leadId,
      type: "pre_call_report",
      note: callTrackMd,
      meta: {
        from_audit: true,
        grade,
        score,
        reportUrl,
        gap_ids: gaps.map((g) => g.id),
        gaps,
        top_fix_title: lvsJson.topFix?.title ?? null,
      },
      created_by: user.id,
    },
  ]);

  const snap = snapshotFromLvs(lvsJson, payload.body.zip);
  const nextNotes = snap ? notesWithLvsLine(row.notes, snap) : row.notes;
  const nextProfile = snap
    ? mergeLvsIntoProfile((row.profile as Record<string, unknown> | null) ?? null, snap)
    : row.profile;

  await supabase
    .from("outbound_leads")
    .update({ notes: nextNotes, profile: nextProfile })
    .eq("id", leadId);

  return NextResponse.json({
    ok: true,
    grade,
    score,
    reportUrl,
    headline: lvsJson.headline ?? null,
    topFix: lvsJson.topFix ?? null,
    gaps,
    callTrackMarkdown: callTrackMd,
    hadPriorReport: Boolean(reportUrlFromNotes(row.notes)),
    placeId: resolveLeadProfile(row)?.place_id ?? null,
  });
}

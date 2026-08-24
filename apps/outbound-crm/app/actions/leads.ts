"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  resolveLeadProfile,
  type LeadProfile,
} from "@/lib/lead-profile";
import { fetchPlaceDetails, placeDetailsToProfile } from "@/lib/places";
import {
  buildAuditPayload,
  fetchLiveLvs,
  mergeLvsIntoProfile,
  notesWithLvsLine,
  snapshotFromLvs,
} from "@/lib/run-audit";
import {
  buildCallTrackFromAudit,
  formatAuditCallTrackMarkdown,
} from "@/lib/call-track-from-audit";
import { createClient } from "@/lib/supabase/server";
import type { LadderEventType, LeadStatus, OutboundLead } from "@/lib/types";
import { isLadderEventType, isLeadStatus } from "@/lib/types";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Unauthorized");
  return { supabase, user };
}

export async function updateLeadStatus(leadId: string, status: string) {
  if (!isLeadStatus(status)) throw new Error("Invalid status");
  const { supabase, user } = await requireUser();

  const { data: lead, error: fetchErr } = await supabase
    .from("outbound_leads")
    .select("status")
    .eq("id", leadId)
    .single();

  if (fetchErr || !lead) throw new Error("Lead not found");

  const from = lead.status as LeadStatus;

  const { error: upErr } = await supabase
    .from("outbound_leads")
    .update({ status, assigned_to: user.id })
    .eq("id", leadId);

  if (upErr) throw new Error(upErr.message);

  await supabase.from("outbound_activities").insert({
    lead_id: leadId,
    type: "status_change",
    note: null,
    meta: { from, to: status },
    created_by: user.id,
  });

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/queue");
}

export async function logCallAttempt(leadId: string, note?: string) {
  const { supabase, user } = await requireUser();
  await supabase.from("outbound_activities").insert({
    lead_id: leadId,
    type: "call_attempt",
    note: note ?? "Call attempt",
    meta: {},
    created_by: user.id,
  });
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/queue");
}

export async function addNote(leadId: string, note: string) {
  await addLeadNote(leadId, note);
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function updateLeadStatusForm(formData: FormData) {
  const leadId = String(formData.get("leadId") ?? "");
  const status = String(formData.get("status") ?? "");
  await updateLeadStatus(leadId, status);
}

export async function logCallAttemptForm(formData: FormData) {
  const leadId = String(formData.get("leadId") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  await logCallAttempt(leadId, note || "Left voicemail");
}

export async function addNoteForm(formData: FormData) {
  const leadId = String(formData.get("leadId") ?? "");
  const note = String(formData.get("note") ?? "");
  await addLeadNote(leadId, note);
}

async function addLeadNote(leadId: string, note: string) {
  const trimmed = note.trim();
  if (!trimmed) throw new Error("Note required");
  const { supabase, user } = await requireUser();
  await supabase.from("outbound_activities").insert({
    lead_id: leadId,
    type: "note",
    note: trimmed,
    meta: {},
    created_by: user.id,
  });
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/queue");
}

/**
 * Refresh Maps/GBP fields when possible, then always check live LVS.
 * The Local Visibility Score is the CRM audit score (Hunter grade is an estimate).
 */
export async function generatePreCallReport(leadId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase, user } = await requireUser();

  const { data: lead, error: fetchErr } = await supabase
    .from("outbound_leads")
    .select("id, name, email, phone, notes, profile, external_id")
    .eq("id", leadId)
    .single();

  if (fetchErr || !lead) return { ok: false, error: "Lead not found" };

  let profile: LeadProfile | null = resolveLeadProfile(lead);
  let refreshed = false;

  const placeId =
    profile?.place_id ||
    (lead.external_id?.startsWith("google_place:")
      ? lead.external_id.slice("google_place:".length)
      : null);

  if (placeId) {
    try {
      const det = await fetchPlaceDetails(placeId);
      if (det) {
        const fresh = placeDetailsToProfile(det, { maps_query: profile?.maps_query ?? null });
        profile = { ...(profile ?? {}), ...fresh };
        refreshed = true;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Places refresh failed";
      if (!profile) return { ok: false, error: msg };
    }
  }

  const payload = buildAuditPayload(
    {
      name: lead.name,
      email: lead.email,
      notes: lead.notes,
      profile: (profile ?? lead.profile) as OutboundLead["profile"],
    },
    null,
  );
  if (!payload.ok) {
    return {
      ok: false,
      error: `${payload.error} Live LVS is the CRM audit score.`,
    };
  }

  const fetched = await fetchLiveLvs(payload.body);
  if (!fetched.ok) return { ok: false, error: fetched.error };

  const snap = snapshotFromLvs(fetched.json, payload.body.zip);
  if (!snap) return { ok: false, error: "LVS returned no report URL" };

  const nextProfile = mergeLvsIntoProfile(profile, snap) as LeadProfile;
  const nextNotes = notesWithLvsLine(lead.notes, snap);
  const { error: upErr } = await supabase
    .from("outbound_leads")
    .update({ profile: nextProfile, notes: nextNotes })
    .eq("id", leadId);
  if (upErr) return { ok: false, error: upErr.message };

  const gaps = buildCallTrackFromAudit(fetched.json);
  const markdown = formatAuditCallTrackMarkdown({
    businessName: lead.name,
    grade: snap.grade,
    score: snap.score,
    reportUrl: snap.reportUrl,
    headline: fetched.json.headline,
    gaps,
  });

  const { error: actErr } = await supabase.from("outbound_activities").insert({
    lead_id: leadId,
    type: "pre_call_report",
    note: markdown,
    meta: {
      from_audit: true,
      lvs_audit: true,
      grade: snap.grade,
      score: snap.score,
      reportUrl: snap.reportUrl,
      gap_ids: gaps.map((g) => g.id),
      gaps,
      refreshed_from_places: refreshed,
      place_id: nextProfile.place_id ?? null,
      top_fix_title: snap.topFixTitle ?? null,
    },
    created_by: user.id,
  });

  if (actErr) return { ok: false, error: actErr.message };

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/queue");
  return { ok: true };
}

export async function generatePreCallReportForm(formData: FormData) {
  const leadId = String(formData.get("leadId") ?? "");
  const result = await generatePreCallReport(leadId);
  if (!result.ok) throw new Error(result.error);
}

const LADDER_NOTES: Record<LadderEventType, string> = {
  audit_purchased: "Conversion ladder: paid LVS audit purchased",
  call_booked: "Conversion ladder: discovery call booked",
  retainer_signed: "Conversion ladder: monthly retainer signed",
};

const LADDER_STATUS: Partial<Record<LadderEventType, LeadStatus>> = {
  call_booked: "meeting_booked",
  retainer_signed: "closed_won",
};

/** Append ladder milestone; optionally advance status for booked/won. */
export async function logLadderEvent(leadId: string, type: LadderEventType) {
  const { supabase, user } = await requireUser();

  const { error: actErr } = await supabase.from("outbound_activities").insert({
    lead_id: leadId,
    type,
    note: LADDER_NOTES[type],
    meta: { ladder: true },
    created_by: user.id,
  });
  if (actErr) throw new Error(actErr.message);

  const nextStatus = LADDER_STATUS[type];
  if (nextStatus) {
    const { data: lead } = await supabase.from("outbound_leads").select("status").eq("id", leadId).single();
    const from = (lead?.status as LeadStatus) || "new";
    if (from !== nextStatus) {
      await supabase.from("outbound_leads").update({ status: nextStatus, assigned_to: user.id }).eq("id", leadId);
      await supabase.from("outbound_activities").insert({
        lead_id: leadId,
        type: "status_change",
        note: null,
        meta: { from, to: nextStatus, via: type },
        created_by: user.id,
      });
    }
  }

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/queue");
}

export async function logLadderEventForm(formData: FormData) {
  const leadId = String(formData.get("leadId") ?? "");
  const type = String(formData.get("type") ?? "");
  if (!isLadderEventType(type)) throw new Error("Invalid ladder event");
  await logLadderEvent(leadId, type);
}

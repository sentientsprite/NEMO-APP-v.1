"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  buildPreCallGaps,
  formatPreCallReportMarkdown,
  resolveLeadProfile,
  type LeadProfile,
} from "@/lib/lead-profile";
import { fetchPlaceDetails, placeDetailsToProfile } from "@/lib/places";
import { createClient } from "@/lib/supabase/server";
import type { LeadStatus } from "@/lib/types";
import { isLeadStatus } from "@/lib/types";

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
 * Refresh Maps/GBP fields when possible, then write a pre-call gap checklist
 * as an activity the rep can read before dialing.
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
        profile = placeDetailsToProfile(det, { maps_query: profile?.maps_query ?? null });
        refreshed = true;
        const { error: upErr } = await supabase
          .from("outbound_leads")
          .update({ profile })
          .eq("id", leadId);
        if (upErr) return { ok: false, error: upErr.message };
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Places refresh failed";
      if (!profile) return { ok: false, error: msg };
      // Keep stale profile and still produce a checklist.
    }
  }

  if (!profile) {
    return {
      ok: false,
      error:
        "No Google Place ID on this lead. Hunter Places leads (google_place:…) can refresh; others need a Maps snapshot first.",
    };
  }

  const gaps = buildPreCallGaps(profile, { email: lead.email, phone: lead.phone });
  const markdown = formatPreCallReportMarkdown({
    businessName: lead.name,
    profile,
    gaps,
  });

  const { error: actErr } = await supabase.from("outbound_activities").insert({
    lead_id: leadId,
    type: "pre_call_report",
    note: markdown,
    meta: {
      gap_ids: gaps.map((g) => g.id),
      gap_count: gaps.length,
      refreshed_from_places: refreshed,
      place_id: profile.place_id ?? null,
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

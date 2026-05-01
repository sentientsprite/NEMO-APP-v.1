"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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

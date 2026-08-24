import { resolveLeadProfile } from "@/lib/lead-profile";
import type { OutboundLead } from "@/lib/types";

export function extractZip(
  notes: string | null | undefined,
  address: string | null | undefined,
): string | null {
  const fromNotes =
    notes?.match(/\bZIP:\s*(\d{5})\b/i)?.[1] ||
    notes?.match(/\b(\d{5})(?:-\d{4})?\b/)?.[1];
  if (fromNotes) return fromNotes;
  const fromAddr = address?.match(/\b(\d{5})(?:-\d{4})?\b/)?.[1];
  return fromAddr ?? null;
}

export function reportUrlFromNotes(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const m = notes.match(/Report:\s*(https?:\/\/\S+)/i);
  return m?.[1]?.replace(/[.,;)]+$/, "") ?? null;
}

export function lvsAppBase(): string {
  return (
    process.env.LVS_APP_URL?.replace(/\/+$/, "") ||
    process.env.NEXT_PUBLIC_LVS_APP_URL?.replace(/\/+$/, "") ||
    "https://nemo-app-v-1.vercel.app"
  );
}

/** Email used for CRM-initiated audits (avoids cold-emailing the prospect). */
export function auditCallbackEmail(leadEmail: string | null | undefined): string | null {
  const configured =
    process.env.LVS_AUDIT_EMAIL?.trim() ||
    process.env.CRM_AUDIT_EMAIL?.trim() ||
    "";
  if (configured && configured.includes("@")) return configured;
  if (leadEmail?.includes("@") && !leadEmail.includes("example.com")) return leadEmail;
  return null;
}

export function buildAuditPayload(
  lead: Pick<OutboundLead, "name" | "email" | "notes" | "profile">,
  zipOverride?: string | null,
):
  | { ok: true; body: { email: string; businessName: string; zip: string; websiteUrl?: string } }
  | { ok: false; error: string } {
  const profile = resolveLeadProfile(lead);
  const zip = (zipOverride?.trim() || extractZip(lead.notes, profile?.address ?? null) || "").trim();
  if (!/^\d{5}(-\d{4})?$/.test(zip)) {
    return {
      ok: false,
      error: "ZIP required (5 digits). Add it below or put ZIP in the lead address/notes.",
    };
  }

  const email = auditCallbackEmail(lead.email);
  if (!email) {
    return {
      ok: false,
      error: "Set LVS_AUDIT_EMAIL on outbound-crm (or add a real email on the lead).",
    };
  }

  const website = (profile?.website ?? "").trim();
  const websiteUrl =
    website && website.startsWith("http") && !website.startsWith("(listed") ? website : undefined;

  return {
    ok: true,
    body: {
      email,
      businessName: lead.name,
      zip,
      ...(websiteUrl ? { websiteUrl } : {}),
    },
  };
}

export type LvsAuditResponse = {
  ok?: boolean;
  grade?: string;
  score?: number;
  reportUrl?: string;
  error?: string;
  detail?: string;
  hint?: string;
};

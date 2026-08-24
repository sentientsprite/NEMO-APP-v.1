import { resolveLeadProfile } from "@/lib/lead-profile";
import type { OutboundActivity, OutboundLead } from "@/lib/types";
import { isEmailOnlyLead } from "@/lib/phone";
import { reportUrlFromNotes } from "@/lib/run-audit";

export type LeadChannel = "call" | "email";

export function leadChannel(lead: Pick<OutboundLead, "phone_normalized">): LeadChannel {
  return isEmailOnlyLead(lead.phone_normalized) ? "email" : "call";
}

export function canGenerateCallTrack(lead: OutboundLead): boolean {
  const profile = resolveLeadProfile(lead);
  return Boolean(profile || lead.external_id?.startsWith("google_place:"));
}

export type AuditStatus = {
  done: boolean;
  grade: string | null;
  score: number | null;
  reportUrl: string | null;
  at: string | null;
};

/** Resolve audit status from notes + activity log (no extra DB columns). */
export function resolveAuditStatus(
  lead: Pick<OutboundLead, "notes">,
  activities: OutboundActivity[],
): AuditStatus {
  const fromMeta = activities.find(
    (a) => a.meta && typeof a.meta === "object" && a.meta !== null && "lvs_audit" in a.meta && a.meta.lvs_audit,
  );
  if (fromMeta?.meta && typeof fromMeta.meta === "object") {
    const m = fromMeta.meta as Record<string, unknown>;
    return {
      done: true,
      grade: typeof m.grade === "string" ? m.grade : null,
      score: typeof m.score === "number" ? m.score : null,
      reportUrl: typeof m.reportUrl === "string" ? m.reportUrl : reportUrlFromNotes(fromMeta.note) || reportUrlFromNotes(lead.notes),
      at: fromMeta.created_at,
    };
  }

  const reportUrl = reportUrlFromNotes(lead.notes);
  const gradeScore = lead.notes?.match(/\bLVS:\s*([A-F][+-]?)\/(\d+|—|-)/i);
  const gradeLine = lead.notes?.match(/LVS audit:\s*([A-F][+-]?)(?:\s*\/\s*(\d+))?/i);

  if (reportUrl || gradeScore || gradeLine) {
    return {
      done: true,
      grade: gradeScore?.[1] ?? gradeLine?.[1] ?? null,
      score: gradeScore?.[2] && /^\d+$/.test(gradeScore[2])
        ? parseInt(gradeScore[2], 10)
        : gradeLine?.[2]
          ? parseInt(gradeLine[2], 10)
          : null,
      reportUrl,
      at: null,
    };
  }

  return { done: false, grade: null, score: null, reportUrl: null, at: null };
}

/** Lightweight audit hint for queue cards (notes only). */
export function auditHintFromNotes(notes: string | null | undefined): {
  done: boolean;
  label: string;
} {
  const report = reportUrlFromNotes(notes);
  const m = notes?.match(/\bLVS:\s*([A-F][+-]?)\/(\d+|—)/i);
  if (m) return { done: true, label: `Audit ${m[1]}/${m[2]}` };
  if (report) return { done: true, label: "Audit done" };
  return { done: false, label: "No audit yet" };
}

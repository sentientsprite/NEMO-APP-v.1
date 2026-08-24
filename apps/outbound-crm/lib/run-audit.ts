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
  const zip = (
    zipOverride?.trim() ||
    extractZip(lead.notes, profile?.address ?? null) ||
    profile?.lvs?.zip ||
    ""
  ).trim();
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
  headline?: string | null;
  findingCount?: number;
  criticalCount?: number;
  warningCount?: number;
  winCount?: number;
  topFix?: { title: string; do_this: string } | null;
  actionItems?: Array<{
    id?: string;
    priority?: string;
    severity?: string;
    title?: string;
    why?: string;
    outcome?: string;
  }>;
  error?: string;
  detail?: string;
  hint?: string;
};

export type LvsSnapshot = {
  grade: string;
  score: number | null;
  reportUrl: string;
  checked_at: string;
  zip?: string;
  topFixTitle?: string | null;
  headline?: string | null;
};

export function snapshotFromLvs(lvs: LvsAuditResponse, zip?: string): LvsSnapshot | null {
  if (!lvs.ok || !lvs.reportUrl) return null;
  return {
    grade: lvs.grade ?? "?",
    score: typeof lvs.score === "number" ? lvs.score : null,
    reportUrl: lvs.reportUrl,
    checked_at: new Date().toISOString(),
    zip,
    topFixTitle: lvs.topFix?.title ?? null,
    headline: lvs.headline ?? null,
  };
}

export function mergeLvsIntoProfile(
  profile: unknown,
  snap: LvsSnapshot,
): Record<string, unknown> {
  const base =
    profile && typeof profile === "object" && !Array.isArray(profile)
      ? { ...(profile as Record<string, unknown>) }
      : {};
  base.lvs = snap;
  return base;
}

/** Parse a live LVS snapshot from notes. Ignores Hunter `Grade: C (SERP-proven…)`. */
export function lvsSnapshotFromNotes(notes: string | null | undefined): LvsSnapshot | null {
  if (!notes?.trim()) return null;
  const reportUrl = reportUrlFromNotes(notes);
  const lvsLine = notes.match(/\bLVS:\s*([A-F][+-]?)\/(\d+|—|-)/i);
  const wedgeMatch = /LVS wedge/i.test(notes)
    ? notes.match(/Grade:\s*([A-F][+-]?)\s*\((\d+)\s*\/\s*100\)/i)
    : null;
  const zip = notes.match(/\bZIP:\s*(\d{5})\b/i)?.[1];
  const topFixTitle = notes.match(/Top fix:\s*(.+)/i)?.[1]?.trim() ?? null;

  const grade = lvsLine?.[1] ?? wedgeMatch?.[1] ?? null;
  const rawScore = lvsLine?.[2] ?? wedgeMatch?.[2] ?? null;
  const score = rawScore && /^\d+$/.test(rawScore) ? parseInt(rawScore, 10) : null;

  if (!lvsLine && !wedgeMatch && !reportUrl) return null;

  return {
    grade: grade ?? "?",
    score,
    reportUrl: reportUrl ?? "",
    checked_at: "",
    zip,
    topFixTitle,
    headline: null,
  };
}

export function notesWithLvsLine(notes: string | null | undefined, snap: LvsSnapshot): string {
  const existing = (notes ?? "").trim();
  const withoutOld = existing
    .split(/\n+/)
    .filter((line) => !/^Report:\s*https?:\/\//i.test(line.trim()) && !/^LVS:\s*/i.test(line.trim()))
    .join("\n")
    .trim();
  return [withoutOld, `Report: ${snap.reportUrl}`, `LVS: ${snap.grade}/${snap.score ?? "—"}`]
    .filter(Boolean)
    .join("\n");
}

export function attachLvsToInboundProfile(
  source: string,
  notes: string | null | undefined,
  profile: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  const existing = profile?.lvs;
  if (existing && typeof existing === "object" && existing !== null) {
    return profile;
  }
  if (source !== "lvs_wedge" && source !== "spryte_audit") return profile;
  const snap = lvsSnapshotFromNotes(notes);
  if (!snap) return profile;
  return mergeLvsIntoProfile(profile, snap);
}

export async function fetchLiveLvs(
  body: { email: string; businessName: string; zip: string; websiteUrl?: string },
): Promise<{ ok: true; json: LvsAuditResponse } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${lvsAppBase()}/api/lvs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(55_000),
    });
    const json = (await res.json()) as LvsAuditResponse;
    if (!res.ok || !json.ok || !json.reportUrl) {
      return {
        ok: false,
        error: json.detail || json.error || json.hint || `LVS returned ${res.status}`,
      };
    }
    return { ok: true, json };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "LVS request failed" };
  }
}

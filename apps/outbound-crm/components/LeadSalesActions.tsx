import { PreCallReportButton } from "@/components/PreCallReportButton";
import type { OutboundLead } from "@/lib/types";
import { resolveLeadProfile } from "@/lib/lead-profile";

const LVS_BASE =
  process.env.NEXT_PUBLIC_LVS_APP_URL?.replace(/\/+$/, "") || "https://nemo-app-v-1.vercel.app";

function zipFromNotes(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const m = notes.match(/\bZIP:\s*(\d{5})\b/i) || notes.match(/\b(\d{5})(?:-\d{4})?\b/);
  return m?.[1] ?? null;
}

function reportUrlFromNotes(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const m = notes.match(/Report:\s*(https?:\/\/\S+)/i);
  return m?.[1]?.replace(/[.,;)]+$/, "") ?? null;
}

function cityFromAddress(address: string | null | undefined): string | null {
  if (!address?.trim()) return null;
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 2]!.replace(/\s+[A-Z]{2}$/, "").trim();
  return null;
}

export function canGenerateCallTrack(lead: OutboundLead): boolean {
  const profile = resolveLeadProfile(lead);
  return Boolean(profile || lead.external_id?.startsWith("google_place:"));
}

export function lvsAuditHref(lead: OutboundLead): string {
  const u = new URL(LVS_BASE + "/");
  u.searchParams.set("businessName", lead.name);
  const zip = zipFromNotes(lead.notes);
  if (zip) u.searchParams.set("zip", zip);
  if (lead.email && !lead.email.includes("example.com")) {
    u.searchParams.set("email", lead.email);
  }
  const profile = resolveLeadProfile(lead);
  if (profile?.website && !profile.website.startsWith("(listed")) {
    u.searchParams.set("websiteUrl", profile.website);
  }
  const city = cityFromAddress(profile?.address ?? null);
  if (city) u.searchParams.set("city", city);
  u.searchParams.set("utm_source", "outbound_crm");
  u.searchParams.set("utm_medium", "lead_detail");
  u.searchParams.set("utm_campaign", "run_lvs_audit");
  return u.toString();
}

/** Call track (pre-call gaps) + Run LVS audit — always in the lead hero. */
export function LeadSalesActions({ lead }: { lead: OutboundLead }) {
  const showCallTrack = canGenerateCallTrack(lead);
  const pdf = reportUrlFromNotes(lead.notes);

  return (
    <div className="flex flex-col gap-2 sm:items-end">
      {showCallTrack ? (
        <PreCallReportButton leadId={lead.id} label="Generate call track" />
      ) : (
        <p className="max-w-xs text-right text-xs text-slate-500">
          Call track needs a Maps snapshot (Hunter Places). Run LVS audit for wedge leads.
        </p>
      )}
      <a
        href={lvsAuditHref(lead)}
        target="_blank"
        rel="noreferrer"
        className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
      >
        Run LVS audit
      </a>
      {pdf ? (
        <a
          href={pdf}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-900"
        >
          Open LVS PDF
        </a>
      ) : null}
    </div>
  );
}

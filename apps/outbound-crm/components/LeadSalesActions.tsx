import { PreCallReportButton } from "@/components/PreCallReportButton";
import { RunAuditButton } from "@/components/RunAuditButton";
import type { OutboundLead } from "@/lib/types";
import { resolveLeadProfile } from "@/lib/lead-profile";
import { reportUrlFromNotes } from "@/lib/run-audit";

export function canGenerateCallTrack(lead: OutboundLead): boolean {
  const profile = resolveLeadProfile(lead);
  return Boolean(profile || lead.external_id?.startsWith("google_place:"));
}

/** Call track + Run Audit (in-place LVS → PDF) — always in the lead hero. */
export function LeadSalesActions({ lead }: { lead: OutboundLead }) {
  const showCallTrack = canGenerateCallTrack(lead);
  const pdf = reportUrlFromNotes(lead.notes);

  return (
    <div className="flex flex-col gap-2 sm:items-end">
      {showCallTrack ? (
        <PreCallReportButton leadId={lead.id} label="Generate call track" />
      ) : (
        <p className="max-w-xs text-right text-xs text-slate-500">
          Call track needs a Maps snapshot (Hunter Places). Use Run Audit for a full scorecard.
        </p>
      )}
      <RunAuditButton lead={lead} />
      {pdf ? (
        <a
          href={pdf}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-900"
        >
          Open PDF
        </a>
      ) : null}
    </div>
  );
}

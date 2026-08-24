"use client";

import { useState, useTransition } from "react";

import { extractZip } from "@/lib/run-audit";
import { resolveLeadProfile } from "@/lib/lead-profile";
import type { OutboundLead } from "@/lib/types";

type Props = {
  lead: Pick<OutboundLead, "id" | "notes" | "profile" | "email" | "name">;
  /** Compact = Maps panel; default = hero. */
  variant?: "hero" | "panel";
};

export function RunAuditButton({ lead, variant = "hero" }: Props) {
  const profile = resolveLeadProfile(lead);
  const suggestedZip = extractZip(lead.notes, profile?.address ?? null) ?? "";
  const [zip, setZip] = useState(suggestedZip);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ grade: string; score: number | null; reportUrl: string } | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

  const btnClass =
    variant === "panel"
      ? "inline-flex min-h-[40px] items-center justify-center rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-900 disabled:opacity-60"
      : "inline-flex min-h-[44px] items-center justify-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60";

  function runAudit() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/leads/audit", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ leadId: lead.id, zip: zip.trim() || undefined }),
        });
        const json = (await res.json()) as {
          ok?: boolean;
          error?: string;
          grade?: string;
          score?: number | null;
          reportUrl?: string;
        };
        if (!res.ok || !json.ok || !json.reportUrl) {
          setError(json.error || `Audit failed (${res.status})`);
          return;
        }
        setResult({
          grade: json.grade ?? "?",
          score: json.score ?? null,
          reportUrl: json.reportUrl,
        });
        // Open PDF without navigating away from the lead page.
        const opened = window.open(json.reportUrl, "_blank", "noopener,noreferrer");
        if (!opened) {
          setError("PDF ready — popup blocked; use Open PDF below.");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Audit request failed");
      }
    });
  }

  return (
    <div className={`flex flex-col gap-2 ${variant === "hero" ? "sm:items-end" : "sm:items-end"}`}>
      {!suggestedZip ? (
        <label className="flex w-full max-w-[11rem] flex-col gap-1 text-left text-xs text-slate-600 sm:text-right">
          ZIP for audit
          <input
            value={zip}
            onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
            inputMode="numeric"
            pattern="\d{5}"
            placeholder="84101"
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
            disabled={pending}
          />
        </label>
      ) : null}
      <button type="button" onClick={runAudit} disabled={pending} className={btnClass}>
        {pending ? "Running audit…" : "Run Audit"}
      </button>
      {result ? (
        <p className="max-w-xs text-right text-xs text-slate-600">
          {result.grade}
          {result.score != null ? ` / ${result.score}` : ""} —{" "}
          <a href={result.reportUrl} target="_blank" rel="noreferrer" className="font-semibold text-indigo-700 underline">
            Open PDF
          </a>
        </p>
      ) : null}
      {error ? <p className="max-w-xs text-right text-xs text-rose-700">{error}</p> : null}
    </div>
  );
}

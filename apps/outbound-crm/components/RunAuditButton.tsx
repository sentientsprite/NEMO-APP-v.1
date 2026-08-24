"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { extractZip } from "@/lib/run-audit";
import { resolveLeadProfile } from "@/lib/lead-profile";
import type { OutboundLead } from "@/lib/types";

type Props = {
  lead: Pick<OutboundLead, "id" | "notes" | "profile" | "email" | "name">;
  align?: "start" | "end";
  rerunLabel?: string;
};

export function RunAuditButton({
  lead,
  align = "end",
  rerunLabel = "Run Audit",
}: Props) {
  const router = useRouter();
  const profile = resolveLeadProfile(lead);
  const suggestedZip = extractZip(lead.notes, profile?.address ?? null) ?? "";
  const [zip, setZip] = useState(suggestedZip);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ grade: string; score: number | null; reportUrl: string } | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

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
        const opened = window.open(json.reportUrl, "_blank", "noopener,noreferrer");
        if (!opened) {
          setError("PDF ready — popup blocked; use Open PDF below.");
        }
        // Refresh so call track (written from this audit) appears in step 2.
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Audit request failed");
      }
    });
  }

  return (
    <div className={`flex flex-col gap-2 ${align === "end" ? "sm:items-end" : "items-start"}`}>
      {!suggestedZip ? (
        <label className="flex w-full max-w-[11rem] flex-col gap-1 text-left text-xs text-slate-600">
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
      <button
        type="button"
        onClick={runAudit}
        disabled={pending}
        className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Running audit…" : rerunLabel}
      </button>
      {result ? (
        <p className="max-w-xs text-xs text-slate-600">
          {result.grade}
          {result.score != null ? ` / ${result.score}` : ""} — call track updated —{" "}
          <a
            href={result.reportUrl}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-indigo-700 underline"
          >
            Open PDF
          </a>
        </p>
      ) : null}
      {error ? <p className="max-w-xs text-xs text-rose-700">{error}</p> : null}
    </div>
  );
}

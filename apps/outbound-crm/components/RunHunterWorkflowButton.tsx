"use client";

import { useState, useTransition } from "react";

export function RunHunterWorkflowButton() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onClick() {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/hunter/run", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ maxLeads: 5 }),
          signal: AbortSignal.timeout(55_000),
        });
        const json = (await res.json()) as { ok?: boolean; message?: string; error?: string };
        if (!res.ok || !json.ok) {
          setError(json.error || `Hunter failed (${res.status})`);
          return;
        }
        setMessage(json.message || "Hunter finished. Refresh the queue.");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(
          /aborted|timeout/i.test(msg)
            ? "Hunter timed out — try again, or run the GitHub daily workflow for a longer job."
            : msg,
        );
      }
    });
  }

  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50/80 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-indigo-950">Hunter lead sync</p>
          <p className="mt-0.5 text-xs text-indigo-900/80">
            Targets estimated grade <span className="font-medium">C / D / F</span> with{" "}
            <span className="font-medium">≥2 sellable gaps</span> (GBP, photos, SMS review funnel,
            website, SEO/GEO/AEO — not B / C+ Map Pack shops). Needs Places; organic packages need{" "}
            <span className="font-medium">SERPER_API_KEY</span>.
          </p>
        </div>
        <button
          type="button"
          onClick={onClick}
          disabled={pending}
          className="shrink-0 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Running… (up to ~50s)" : "Run Hunter now"}
        </button>
      </div>
      {message ? (
        <p className="mt-3 rounded-lg bg-white/80 px-3 py-2 text-sm text-emerald-800 ring-1 ring-emerald-200/80">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 rounded-lg bg-white/80 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200/80">{error}</p>
      ) : null}
    </div>
  );
}

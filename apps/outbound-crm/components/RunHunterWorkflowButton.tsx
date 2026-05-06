"use client";

import { useState, useTransition } from "react";

import { dispatchHunterLeadWorkflowAction } from "@/app/actions/hunter";

export function RunHunterWorkflowButton() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onClick() {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await dispatchHunterLeadWorkflowAction();
      if (result.ok) {
        setMessage(result.message);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50/80 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-indigo-950">Hunter lead sync</p>
          <p className="mt-0.5 text-xs text-indigo-900/80">
            Runs your server-side automation (GitHub Action or custom webhook). New leads land via the Hunter ingest
            route, then appear here as <span className="font-medium">new</span>.
          </p>
        </div>
        <button
          type="button"
          onClick={onClick}
          disabled={pending}
          className="shrink-0 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Starting…" : "Run Hunter now"}
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

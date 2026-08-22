"use client";

import { useFormStatus } from "react-dom";

import { generatePreCallReportForm } from "@/app/actions/leads";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
    >
      {pending ? "Generating…" : "Generate pre-call report"}
    </button>
  );
}

export function PreCallReportButton({ leadId }: { leadId: string }) {
  return (
    <form action={generatePreCallReportForm}>
      <input type="hidden" name="leadId" value={leadId} />
      <SubmitButton />
    </form>
  );
}

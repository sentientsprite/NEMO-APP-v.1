import Link from "next/link";

import { RunHunterWorkflowButton } from "@/components/RunHunterWorkflowButton";
import { auditHintFromLead, leadChannel } from "@/lib/lead-ux";
import { createClient } from "@/lib/supabase/server";
import type { OutboundLead } from "@/lib/types";
import { isLeadStatus, LEAD_STATUSES } from "@/lib/types";
import { telHref } from "@/lib/phone";

interface PageProps {
  searchParams: Promise<{ status?: string; source?: string; q?: string; limit?: string }>;
}

function sanitizeIlike(q: string): string {
  return q.replace(/[%_]/g, "").slice(0, 80);
}

export default async function QueuePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const status = sp.status && isLeadStatus(sp.status) ? sp.status : "new";
  const source = sp.source?.trim() || "";
  const qRaw = sp.q?.trim() || "";
  const q = sanitizeIlike(qRaw);
  const limitNum = Math.min(100, Math.max(1, parseInt(sp.limit ?? "10", 10) || 10));

  const supabase = await createClient();

  let query = supabase
    .from("outbound_leads")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limitNum);

  query = query.eq("status", status);

  if (source) {
    query = query.ilike("source", `%${source}%`);
  }

  if (q) {
    query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%,company.ilike.%${q}%,email.ilike.%${q}%`);
  }

  const { data: leads, error } = await query;

  if (error) {
    return <p className="text-red-600">Could not load leads: {error.message}</p>;
  }

  const rows = (leads ?? []) as OutboundLead[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Outbound queue</h1>
        <p className="text-sm text-slate-600">
          Call leads show a green dial button; email leads show violet email. Open a card for the
          step-by-step playbook.
        </p>
      </div>

      <RunHunterWorkflowButton />

      <form className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2" method="get">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Status</span>
          <select name="status" defaultValue={status} className="w-full rounded-lg border border-slate-300 px-3 py-2">
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Limit</span>
          <select name="limit" defaultValue={String(limitNum)} className="w-full rounded-lg border border-slate-300 px-3 py-2">
            {[10, 25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block font-medium text-slate-700">Source contains</span>
          <input
            name="source"
            defaultValue={source}
            placeholder="e.g. hunter_weak_presence"
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block font-medium text-slate-700">Search name / phone / company / email</span>
          <input name="q" defaultValue={qRaw} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </label>
        <div className="sm:col-span-2">
          <button type="submit" className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white">
            Apply filters
          </button>
        </div>
      </form>

      <ul className="space-y-3">
        {rows.length === 0 ? (
          <li className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
            No leads match. Run Hunter or wait for the webhook.
          </li>
        ) : (
          rows.map((lead) => {
            const channel = leadChannel(lead);
            const audit = auditHintFromLead(lead);
            const mailto = lead.email
              ? `mailto:${encodeURIComponent(lead.email)}?subject=${encodeURIComponent(`Prana — ${lead.name}`)}`
              : null;

            return (
              <li
                key={lead.id}
                className={`rounded-xl border bg-white p-4 shadow-sm ${
                  channel === "email" ? "border-l-4 border-l-violet-500 border-slate-200" : "border-l-4 border-l-emerald-500 border-slate-200"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                          channel === "email"
                            ? "bg-violet-100 text-violet-900"
                            : "bg-emerald-100 text-emerald-900"
                        }`}
                      >
                        {channel === "email" ? "Email" : "Call"}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          audit.done ? "bg-teal-50 text-teal-800" : "bg-amber-50 text-amber-900"
                        }`}
                      >
                        {audit.label}
                      </span>
                    </div>
                    <Link href={`/leads/${lead.id}`} className="text-lg font-semibold text-indigo-700">
                      {lead.name}
                    </Link>
                    {lead.company && lead.company !== lead.name ? (
                      <p className="text-sm text-slate-600">{lead.company}</p>
                    ) : null}
                    <p className="text-xs uppercase tracking-wide text-slate-500">
                      {lead.status} · {lead.source ?? "—"}
                    </p>
                    {channel === "call" ? (
                      <p className="mt-2 font-mono text-sm text-slate-800">{lead.phone}</p>
                    ) : (
                      <p className="mt-2 text-sm font-medium text-violet-900">{lead.email || "(no email)"}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col gap-2">
                    {channel === "call" ? (
                      <a
                        href={telHref(lead.phone_normalized)}
                        className="min-h-[44px] min-w-[44px] rounded-xl bg-emerald-600 px-4 py-3 text-center text-sm font-bold text-white"
                      >
                        Call
                      </a>
                    ) : mailto ? (
                      <a
                        href={mailto}
                        className="min-h-[44px] min-w-[44px] rounded-xl bg-violet-700 px-4 py-3 text-center text-sm font-bold text-white"
                      >
                        Email
                      </a>
                    ) : (
                      <span className="rounded-xl bg-violet-100 px-4 py-3 text-center text-sm font-semibold text-violet-800">
                        Email lead
                      </span>
                    )}
                    <Link
                      href={`/leads/${lead.id}`}
                      className="rounded-xl border border-slate-300 px-3 py-2 text-center text-xs font-semibold text-slate-700"
                    >
                      Open playbook
                    </Link>
                  </div>
                </div>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}

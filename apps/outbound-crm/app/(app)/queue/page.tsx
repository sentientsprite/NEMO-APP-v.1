import Link from "next/link";

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
    query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%,company.ilike.%${q}%`);
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
          Default: next {limitNum} <span className="font-medium">new</span> leads (Hunter webhook). Use filters for
          other stages or sources.
        </p>
      </div>

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
            placeholder="e.g. hunter_monday"
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block font-medium text-slate-700">Search name / phone / company</span>
          <input
            name="q"
            defaultValue={qRaw}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
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
            No leads match. POST one via the Hunter webhook (see README).
          </li>
        ) : (
          rows.map((lead) => (
            <li key={lead.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link href={`/leads/${lead.id}`} className="text-lg font-semibold text-indigo-700">
                    {lead.name}
                  </Link>
                  {lead.company ? <p className="text-sm text-slate-600">{lead.company}</p> : null}
                  <p className="text-xs uppercase tracking-wide text-slate-500">
                    {lead.status} · {lead.source ?? "—"}
                  </p>
                </div>
                <a
                  href={telHref(lead.phone_normalized)}
                  className="min-h-[44px] min-w-[44px] shrink-0 rounded-xl bg-emerald-600 px-4 py-3 text-center text-sm font-bold text-white"
                >
                  Call
                </a>
              </div>
              <p className="mt-2 font-mono text-sm text-slate-800">{lead.phone}</p>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

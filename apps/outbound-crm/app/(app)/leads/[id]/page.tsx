import Link from "next/link";
import { notFound } from "next/navigation";

import {
  addNoteForm,
  logCallAttemptForm,
  updateLeadStatusForm,
} from "@/app/actions/leads";
import { createClient } from "@/lib/supabase/server";
import type { OutboundActivity, OutboundLead } from "@/lib/types";
import { LEAD_STATUSES } from "@/lib/types";
import { telHref } from "@/lib/phone";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function LeadDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: lead, error } = await supabase.from("outbound_leads").select("*").eq("id", id).single();

  if (error || !lead) notFound();

  const row = lead as OutboundLead;

  const { data: activities } = await supabase
    .from("outbound_activities")
    .select("*")
    .eq("lead_id", id)
    .order("created_at", { ascending: false });

  const log = (activities ?? []) as OutboundActivity[];

  const mailto = row.email
    ? `mailto:${encodeURIComponent(row.email)}?subject=${encodeURIComponent(`Prana — ${row.name}`)}`
    : null;

  return (
    <div className="space-y-6">
      <p className="text-sm">
        <Link href="/queue" className="text-indigo-600">
          ← Queue
        </Link>
      </p>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{row.name}</h1>
            {row.company ? <p className="text-slate-600">{row.company}</p> : null}
            <p className="mt-2 text-sm text-slate-500">
              <span className="font-semibold text-slate-700">{row.status}</span>
              {row.source ? ` · ${row.source}` : null}
            </p>
            <p className="mt-1 font-mono text-lg text-slate-800">{row.phone}</p>
            {row.notes ? <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{row.notes}</p> : null}
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <a
              href={telHref(row.phone_normalized)}
              className="inline-flex min-h-[48px] min-w-[48px] items-center justify-center rounded-xl bg-emerald-600 px-6 py-3 text-center text-base font-bold text-white"
            >
              Call now
            </a>
            {mailto ? (
              <a
                href={mailto}
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800"
              >
                Email (mailto)
              </a>
            ) : null}
          </div>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Log call</h2>
        <form action={logCallAttemptForm} className="flex flex-wrap gap-2">
          <input type="hidden" name="leadId" value={row.id} />
          <input type="hidden" name="note" value="Left voicemail" />
          <button
            type="submit"
            className="rounded-lg bg-slate-800 px-4 py-3 text-sm font-semibold text-white"
          >
            Left voicemail
          </button>
        </form>
        <form action={logCallAttemptForm} className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input type="hidden" name="leadId" value={row.id} />
          <input
            name="note"
            placeholder="Custom call note (optional)"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button type="submit" className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-900">
            Log call
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Change status</h2>
        <div className="flex flex-wrap gap-2">
          {LEAD_STATUSES.map((s) => (
            <form key={s} action={updateLeadStatusForm}>
              <input type="hidden" name="leadId" value={row.id} />
              <input type="hidden" name="status" value={s} />
              <button
                type="submit"
                className={`rounded-lg px-3 py-2 text-xs font-semibold capitalize ${
                  s === row.status ? "bg-indigo-100 text-indigo-900 ring-2 ring-indigo-400" : "bg-slate-100 text-slate-800"
                }`}
              >
                {s.replace(/_/g, " ")}
              </button>
            </form>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Add note</h2>
        <form action={addNoteForm} className="space-y-2">
          <input type="hidden" name="leadId" value={row.id} />
          <textarea
            name="note"
            required
            rows={3}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="What happened?"
          />
          <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">
            Save note
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Activity</h2>
        <ul className="space-y-2">
          {log.length === 0 ? (
            <li className="text-sm text-slate-500">No activity yet.</li>
          ) : (
            log.map((a) => (
              <li key={a.id} className="rounded-lg border border-slate-100 bg-white px-3 py-2 text-sm">
                <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-500">
                  <span className="font-mono">{a.type}</span>
                  <span>{new Date(a.created_at).toLocaleString()}</span>
                </div>
                {a.note ? <p className="mt-1 text-slate-800">{a.note}</p> : null}
                {a.type === "status_change" && a.meta && "from" in a.meta && "to" in a.meta ? (
                  <p className="mt-1 text-slate-600">
                    {String(a.meta.from)} → {String(a.meta.to)}
                  </p>
                ) : null}
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}

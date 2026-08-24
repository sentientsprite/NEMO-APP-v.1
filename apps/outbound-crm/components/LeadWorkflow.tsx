import {
  addNoteForm,
  logCallAttemptForm,
  logLadderEventForm,
  updateLeadStatusForm,
} from "@/app/actions/leads";
import { LeadGbpPanel } from "@/components/LeadGbpPanel";
import { RunAuditButton } from "@/components/RunAuditButton";
import { resolveLeadProfile, type PreCallGap } from "@/lib/lead-profile";
import { leadChannel, resolveAuditStatus, type AuditStatus } from "@/lib/lead-ux";
import { telHref } from "@/lib/phone";
import type { OutboundActivity, OutboundLead } from "@/lib/types";
import { LADDER_EVENT_TYPES, LEAD_STATUSES } from "@/lib/types";

function StepShell({
  n,
  title,
  hint,
  children,
  accent = "slate",
}: {
  n: number;
  title: string;
  hint?: string;
  children: React.ReactNode;
  accent?: "emerald" | "violet" | "amber" | "indigo" | "slate";
}) {
  const ring =
    accent === "emerald"
      ? "border-emerald-200 bg-emerald-50/40"
      : accent === "violet"
        ? "border-violet-200 bg-violet-50/40"
        : accent === "amber"
          ? "border-amber-200 bg-amber-50/40"
          : accent === "indigo"
            ? "border-indigo-200 bg-indigo-50/40"
            : "border-slate-200 bg-white";

  return (
    <section className={`rounded-2xl border p-4 shadow-sm sm:p-5 ${ring}`}>
      <div className="mb-3 flex items-baseline gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
          {n}
        </span>
        <div>
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          {hint ? <p className="text-sm text-slate-600">{hint}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function GapList({ gaps }: { gaps: PreCallGap[] }) {
  return (
    <ul className="mt-3 space-y-2">
      {gaps.map((g, i) => (
        <li
          key={g.id}
          className={`rounded-lg border px-3 py-2 text-sm ${
            i === 0
              ? "border-rose-300 bg-rose-50 ring-1 ring-rose-200"
              : g.severity === "critical"
                ? "border-rose-200 bg-rose-50"
                : g.severity === "warning"
                  ? "border-amber-200 bg-amber-50"
                  : "border-slate-200 bg-slate-50"
          }`}
        >
          <p className="font-semibold text-slate-900">
            {i === 0 ? (
              <span className="mr-2 text-xs font-bold uppercase tracking-wide text-rose-700">
                Open with this
              </span>
            ) : (
              <span className="mr-2 text-xs uppercase tracking-wide text-slate-500">{g.severity}</span>
            )}
            {g.title}
          </p>
          <p className="mt-1 text-slate-700">{g.talk_track}</p>
        </li>
      ))}
    </ul>
  );
}

function AuditBadge({ audit }: { audit: AuditStatus }) {
  if (!audit.done) {
    return (
      <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
        Audit not run
      </span>
    );
  }
  const score =
    audit.grade != null
      ? `${audit.grade}${audit.score != null ? ` / ${audit.score}` : ""}`
      : "done";
  return (
    <span className="inline-flex items-center rounded-full border border-teal-300 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-900">
      Audit {score}
    </span>
  );
}

function ChannelBadge({ channel }: { channel: "call" | "email" }) {
  if (channel === "email") {
    return (
      <span className="inline-flex items-center rounded-full border border-violet-300 bg-violet-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-violet-900">
        Email lead
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-emerald-900">
      Call lead
    </span>
  );
}

function gapsFromCallTrackActivity(activity: OutboundActivity | undefined): PreCallGap[] {
  if (!activity?.meta || typeof activity.meta !== "object") return [];
  const raw = (activity.meta as { gaps?: unknown }).gaps;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (g): g is PreCallGap =>
      Boolean(g) &&
      typeof g === "object" &&
      typeof (g as PreCallGap).title === "string" &&
      typeof (g as PreCallGap).talk_track === "string",
  );
}

export function LeadWorkflow({
  lead,
  activities,
}: {
  lead: OutboundLead;
  activities: OutboundActivity[];
}) {
  const channel = leadChannel(lead);
  const audit = resolveAuditStatus(lead, activities);
  const profile = resolveLeadProfile(lead);
  const mailto = lead.email
    ? `mailto:${encodeURIComponent(lead.email)}?subject=${encodeURIComponent(`Prana — ${lead.name}`)}`
    : null;
  const latestReport = activities.find((a) => a.type === "pre_call_report");
  const gaps = gapsFromCallTrackActivity(latestReport);

  let step = 1;

  return (
    <div className="space-y-4">
      <header
        className={`rounded-2xl border p-5 shadow-sm ${
          channel === "email" ? "border-violet-200 bg-violet-50/50" : "border-emerald-200 bg-emerald-50/40"
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <ChannelBadge channel={channel} />
          <AuditBadge audit={audit} />
          <span className="rounded-full bg-white/80 px-2.5 py-1 text-xs font-medium capitalize text-slate-700">
            {lead.status.replace(/_/g, " ")}
          </span>
          {lead.source ? (
            <span className="rounded-full bg-white/80 px-2.5 py-1 font-mono text-xs text-slate-500">
              {lead.source}
            </span>
          ) : null}
        </div>
        <h1 className="mt-3 text-2xl font-bold text-slate-900">{lead.name}</h1>
        {lead.company && lead.company !== lead.name ? (
          <p className="text-slate-600">{lead.company}</p>
        ) : null}
        <div className="mt-3 space-y-1">
          {channel === "call" ? (
            <p className="font-mono text-xl font-semibold text-slate-900">{lead.phone}</p>
          ) : (
            <p className="text-lg font-semibold text-violet-900">{lead.email || "No email on file"}</p>
          )}
          {channel === "call" && lead.email ? (
            <p className="text-sm text-slate-700">{lead.email}</p>
          ) : null}
          {channel === "email" && !isPlaceholderPhone(lead.phone) ? (
            <p className="font-mono text-sm text-slate-600">{lead.phone}</p>
          ) : null}
        </div>
        {profile ? (
          <p className="mt-3 text-sm text-slate-700">
            {profile.rating != null || profile.review_count != null
              ? `${profile.rating ?? "—"}★ · ${profile.review_count ?? "—"} reviews`
              : "Maps snapshot on file"}
            {profile.website && !String(profile.website).startsWith("(listed")
              ? ` · ${profile.website}`
              : " · No website on Maps"}
          </p>
        ) : null}
      </header>

      <StepShell
        n={step++}
        title="Run Audit"
        hint={
          audit.done
            ? "Already run — opens PDF and refreshes the call track from the latest scorecard."
            : "First: run the Local Visibility Score. This writes your call track automatically."
        }
        accent="indigo"
      >
        {audit.done && audit.reportUrl ? (
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <a
              href={audit.reportUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-indigo-300 bg-white px-4 py-2 text-sm font-semibold text-indigo-900"
            >
              Open PDF
              {audit.grade ? ` (${audit.grade}${audit.score != null ? `/${audit.score}` : ""})` : ""}
            </a>
            <span className="text-xs text-teal-800">Audit on file</span>
          </div>
        ) : (
          <p className="mb-3 text-sm font-medium text-amber-900">
            No audit yet — run it before you dial so the call track has a real opener.
          </p>
        )}
        <RunAuditButton lead={lead} align="start" rerunLabel={audit.done ? "Re-run Audit" : "Run Audit"} />
      </StepShell>

      <StepShell
        n={step++}
        title="Call track"
        hint="Built from the audit. Point #1 is the top fix — lead the call with it."
        accent="amber"
      >
        {gaps.length > 0 ? (
          <GapList gaps={gaps} />
        ) : (
          <p className="text-sm text-slate-600">
            Run Audit above first. Talking points appear here from the scorecard (top fix first).
          </p>
        )}
        {latestReport?.note ? (
          <details className="mt-3 rounded-lg border border-amber-200 bg-white p-3">
            <summary className="cursor-pointer text-sm font-semibold text-amber-900">
              Full call track notes
            </summary>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap font-sans text-xs text-slate-800">
              {latestReport.note}
            </pre>
          </details>
        ) : null}
      </StepShell>

      {channel === "call" ? (
        <StepShell n={step++} title="Call" hint="Dial with talking point #1 ready." accent="emerald">
          <a
            href={telHref(lead.phone_normalized)}
            className="inline-flex min-h-[52px] w-full items-center justify-center rounded-xl bg-emerald-600 px-6 py-3 text-lg font-bold text-white sm:w-auto"
          >
            Call now — {lead.phone}
          </a>
          <div className="mt-4 flex flex-wrap gap-2">
            <form action={logCallAttemptForm}>
              <input type="hidden" name="leadId" value={lead.id} />
              <input type="hidden" name="note" value="Left voicemail" />
              <button
                type="submit"
                className="rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white"
              >
                Left voicemail
              </button>
            </form>
            <form action={logCallAttemptForm} className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
              <input type="hidden" name="leadId" value={lead.id} />
              <input
                name="note"
                placeholder="Call note (optional)"
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <button
                type="submit"
                className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900 ring-1 ring-slate-300"
              >
                Log call
              </button>
            </form>
          </div>
        </StepShell>
      ) : null}

      <StepShell
        n={step++}
        title={channel === "email" ? "Email" : "Email if no answer"}
        hint={
          channel === "email"
            ? "This is an email-first lead — no dialable phone."
            : "If they don’t pick up, send a short follow-up."
        }
        accent="violet"
      >
        {mailto ? (
          <a
            href={mailto}
            className="inline-flex min-h-[48px] w-full items-center justify-center rounded-xl bg-violet-700 px-6 py-3 text-base font-bold text-white sm:w-auto"
          >
            Email {lead.email}
          </a>
        ) : (
          <p className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm text-violet-900">
            No email on this lead — ask for decision-maker email on the call, then add a note.
          </p>
        )}
      </StepShell>

      <StepShell n={step++} title="Log outcome" hint="Mark progress after the conversation.">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Conversion ladder
        </p>
        <div className="mb-4 flex flex-wrap gap-2">
          {LADDER_EVENT_TYPES.map((t) => (
            <form key={t} action={logLadderEventForm}>
              <input type="hidden" name="leadId" value={lead.id} />
              <input type="hidden" name="type" value={t} />
              <button
                type="submit"
                className="rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold capitalize text-white"
              >
                {t.replace(/_/g, " ")}
              </button>
            </form>
          ))}
        </div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Status</p>
        <div className="mb-4 flex flex-wrap gap-2">
          {LEAD_STATUSES.map((s) => (
            <form key={s} action={updateLeadStatusForm}>
              <input type="hidden" name="leadId" value={lead.id} />
              <input type="hidden" name="status" value={s} />
              <button
                type="submit"
                className={`rounded-lg px-3 py-2 text-xs font-semibold capitalize ${
                  s === lead.status
                    ? "bg-indigo-100 text-indigo-900 ring-2 ring-indigo-400"
                    : "bg-slate-100 text-slate-800"
                }`}
              >
                {s.replace(/_/g, " ")}
              </button>
            </form>
          ))}
        </div>
        <form action={addNoteForm} className="space-y-2">
          <input type="hidden" name="leadId" value={lead.id} />
          <textarea
            name="note"
            required
            rows={2}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="What happened?"
          />
          <button
            type="submit"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Save note
          </button>
        </form>
      </StepShell>

      <LeadGbpPanel lead={lead} mode="reference" />

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Activity</h2>
        <ul className="space-y-2">
          {activities.length === 0 ? (
            <li className="text-sm text-slate-500">No activity yet.</li>
          ) : (
            activities.map((a) => (
              <li key={a.id} className="rounded-lg border border-slate-100 bg-white px-3 py-2 text-sm">
                <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-500">
                  <span className="font-mono">{a.type}</span>
                  <span>{new Date(a.created_at).toLocaleString()}</span>
                </div>
                {a.note ? (
                  <pre
                    className={`mt-1 whitespace-pre-wrap font-sans text-slate-800 ${
                      a.type === "pre_call_report" ? "max-h-40 overflow-auto text-xs" : ""
                    }`}
                  >
                    {a.note}
                  </pre>
                ) : null}
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

function isPlaceholderPhone(phone: string): boolean {
  return !phone || phone.includes("email lead") || phone.startsWith("lvs:");
}

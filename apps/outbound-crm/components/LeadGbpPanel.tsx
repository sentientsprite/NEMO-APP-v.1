import {
  buildPreCallGaps,
  resolveLeadProfile,
  type LeadProfile,
  type PreCallGap,
} from "@/lib/lead-profile";
import type { OutboundLead } from "@/lib/types";
import { canGenerateCallTrack } from "@/components/LeadSalesActions";
import { PreCallReportButton } from "@/components/PreCallReportButton";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-slate-900">{children}</dd>
    </div>
  );
}

function GapList({ gaps }: { gaps: PreCallGap[] }) {
  return (
    <ul className="mt-3 space-y-2">
      {gaps.map((g) => (
        <li
          key={g.id}
          className={`rounded-lg border px-3 py-2 text-sm ${
            g.severity === "critical"
              ? "border-rose-200 bg-rose-50"
              : g.severity === "warning"
                ? "border-amber-200 bg-amber-50"
                : "border-slate-200 bg-slate-50"
          }`}
        >
          <p className="font-semibold text-slate-900">
            <span className="mr-2 text-xs uppercase tracking-wide text-slate-500">{g.severity}</span>
            {g.title}
          </p>
          <p className="mt-1 text-slate-700">{g.talk_track}</p>
        </li>
      ))}
    </ul>
  );
}

function ProfileGrid({ profile }: { profile: LeadProfile }) {
  const website = (profile.website ?? "").trim();
  const hasRealWebsite = Boolean(website) && !website.startsWith("(listed");
  const hoursLabel =
    profile.has_hours == null
      ? "—"
      : profile.has_hours
        ? profile.hours_open_now == null
          ? "Listed"
          : profile.hours_open_now
            ? "Listed · open now"
            : "Listed · closed now"
        : "Missing";

  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      <Field label="Website">
        {hasRealWebsite ? (
          <a href={website} target="_blank" rel="noreferrer" className="text-indigo-600 underline">
            {website}
          </a>
        ) : website ? (
          <span className="text-amber-800">{website}</span>
        ) : (
          <span className="font-medium text-rose-700">None on Maps listing</span>
        )}
      </Field>
      <Field label="Google Maps">
        {profile.maps_url ? (
          <a href={profile.maps_url} target="_blank" rel="noreferrer" className="text-indigo-600 underline">
            Open listing
          </a>
        ) : (
          "—"
        )}
      </Field>
      <Field label="Address">{profile.address || "—"}</Field>
      <Field label="Rating / reviews">
        {profile.rating != null || profile.review_count != null
          ? `${profile.rating ?? "—"} ★ · ${profile.review_count ?? "—"} reviews`
          : "—"}
      </Field>
      <Field label="Hours">{hoursLabel}</Field>
      <Field label="Photos on file">{profile.photo_count != null ? String(profile.photo_count) : "—"}</Field>
      <Field label="Business status">{profile.business_status || "—"}</Field>
      <Field label="Maps query">{profile.maps_query || "—"}</Field>
      <Field label="Place ID">
        <span className="font-mono text-xs">{profile.place_id || "—"}</span>
      </Field>
      <Field label="Categories">
        {(profile.types ?? []).length ? (profile.types ?? []).join(", ") : "—"}
      </Field>
      {profile.fetched_at ? (
        <Field label="Snapshot">
          {new Date(profile.fetched_at).toLocaleString()}
        </Field>
      ) : null}
      {profile.opportunity_score != null ? (
        <Field label="Opportunity score">{profile.opportunity_score}/100 (higher = weaker presence)</Field>
      ) : null}
      <Field label="Organic site: index">
        {profile.organic?.skipped
          ? `Skipped (${profile.organic.reason || "no CSE"})`
          : profile.organic?.site_total_results != null
            ? `≈ ${profile.organic.site_total_results}${profile.organic.hostname ? ` (${profile.organic.hostname})` : ""}`
            : "—"}
      </Field>
      <Field label="Branded organic">
        {profile.organic?.skipped
          ? "Skipped"
          : profile.organic?.branded_hit == null
            ? "—"
            : profile.organic.branded_hit
              ? `Hit #${profile.organic.branded_rank ?? "?"}`
              : "Miss (weak brand SERP)"}
      </Field>
      {profile.organic?.fetched_at ? (
        <Field label="Organic checked">
          {new Date(profile.organic.fetched_at).toLocaleString()}
        </Field>
      ) : null}
    </dl>
  );
}

export function LeadGbpPanel({ lead }: { lead: OutboundLead }) {
  const profile = resolveLeadProfile(lead);
  const gaps = profile ? buildPreCallGaps(profile, { email: lead.email, phone: lead.phone }) : [];
  const showCallTrack = canGenerateCallTrack(lead);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Google / Maps + organic
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {profile
              ? "Weak-presence snapshot: GBP fields plus site:/branded organic when CSE is configured."
              : "No Maps snapshot yet — generate call track if this lead has a Place ID, or run Audit."}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          {showCallTrack ? <PreCallReportButton leadId={lead.id} /> : null}
        </div>
      </div>

      {profile ? (
        <>
          <ProfileGrid profile={profile} />
          <div className="mt-5 border-t border-slate-100 pt-4">
            <h3 className="text-sm font-semibold text-slate-800">Call track</h3>
            <p className="mt-1 text-xs text-slate-500">
              Gap checklist for the dial — generate to refresh Places and rewrite this list.
            </p>
            <GapList gaps={gaps} />
          </div>
        </>
      ) : (
        <p className="text-sm text-slate-600">
          Notes may still have a free-text blob. Run Hunter again for new leads, or use{" "}
          <strong className="font-semibold text-slate-800">Run Audit</strong> for a full scorecard.
        </p>
      )}
    </section>
  );
}

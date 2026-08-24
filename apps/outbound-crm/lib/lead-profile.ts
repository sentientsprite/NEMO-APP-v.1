/** Organic / CSE snapshot nested on outbound_leads.profile */
export interface LeadOrganicProfile {
  skipped?: boolean;
  reason?: string;
  hostname?: string | null;
  site_query?: string;
  site_total_results?: number | null;
  branded_query?: string;
  branded_hit?: boolean | null;
  branded_rank?: number | null;
  branded_top_links?: string[];
  fetched_at?: string;
}

/** Structured Maps / GBP snapshot stored on outbound_leads.profile */
export interface LeadProfile {
  place_id?: string;
  website?: string | null;
  maps_url?: string | null;
  address?: string | null;
  rating?: number | null;
  review_count?: number | null;
  types?: string[];
  maps_query?: string | null;
  hours_open_now?: boolean | null;
  has_hours?: boolean | null;
  photo_count?: number | null;
  business_status?: string | null;
  fetched_at?: string;
  organic?: LeadOrganicProfile | null;
  opportunity_score?: number | null;
  /** Hunter estimate — LVS-style A–F from Maps/organic surface (keep C/D/F). */
  estimated_grade?: "A" | "B" | "C" | "D" | "F" | null;
  /** Sellable Nemo package ids inferred at hunt time. */
  service_packages?: string[] | null;
}

export interface PreCallGap {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  talk_track: string;
}

export function isLeadProfile(v: unknown): v is LeadProfile {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Parse legacy Hunter notes blob into a partial profile when profile jsonb is empty. */
export function profileFromNotes(notes: string | null | undefined): LeadProfile | null {
  if (!notes?.trim()) return null;
  const out: LeadProfile = {};

  const reviews = notes.match(/Reviews:\s*(\d+)/i);
  if (reviews) out.review_count = parseInt(reviews[1]!, 10);

  const rating = notes.match(/Rating:\s*([\d.]+|n\/a)/i);
  if (rating && rating[1] && rating[1].toLowerCase() !== "n/a") {
    out.rating = parseFloat(rating[1]);
  }

  const websiteUrl = notes.match(/Website:\s*(https?:\/\/[^\s·]+)/i);
  const websiteYes = /Website:\s*yes\b/i.test(notes);
  const websiteNo = /Website:\s*no\b/i.test(notes);
  if (websiteUrl) out.website = websiteUrl[1]!.trim();
  else if (websiteYes) out.website = "(listed on Maps — URL not stored; generate report to refresh)";
  else if (websiteNo) out.website = null;

  const mapsUrl = notes.match(/Maps:\s*(https?:\/\/[^\s·]+)/i);
  if (mapsUrl) out.maps_url = mapsUrl[1]!.trim();

  const addr = notes.match(/Address:\s*([^·]+)/i);
  if (addr) out.address = addr[1]!.trim();

  const query = notes.match(/Maps query:\s*([^·]+)/i);
  if (query) out.maps_query = query[1]!.trim();

  return Object.keys(out).length ? out : null;
}

export function resolveLeadProfile(lead: {
  profile?: unknown;
  notes?: string | null;
  external_id?: string | null;
}): LeadProfile | null {
  const fromCol = isLeadProfile(lead.profile) ? (lead.profile as LeadProfile) : null;
  const fromNotes = profileFromNotes(lead.notes);
  const placeFromExt =
    lead.external_id?.startsWith("google_place:")
      ? lead.external_id.slice("google_place:".length)
      : undefined;

  if (!fromCol && !fromNotes && !placeFromExt) return null;

  return {
    ...fromNotes,
    ...fromCol,
    place_id: fromCol?.place_id || fromNotes?.place_id || placeFromExt,
  };
}

/** Sales-ready gap checklist from a Places/GBP snapshot (not a full LVS score). */
export function buildPreCallGaps(profile: LeadProfile, lead: { email?: string | null; phone?: string }): PreCallGap[] {
  const gaps: PreCallGap[] = [];
  const reviews = profile.review_count ?? 0;
  const rating = profile.rating ?? 0;
  const website = (profile.website ?? "").trim();
  const hasRealWebsite = Boolean(website) && !website.startsWith("(listed");

  if (!hasRealWebsite) {
    gaps.push({
      id: "no_website",
      severity: "critical",
      title: "No usable website on the Maps listing",
      talk_track:
        "Package: website build / plugin + UX fixes. Ask what URL customers should hit; GBP often points at a dead homepage.",
    });
  }

  if (profile.has_hours === false) {
    gaps.push({
      id: "no_hours",
      severity: "critical",
      title: "Hours missing on Google",
      talk_track:
        "Package: GBP management — emergency / same-day queries hide incomplete listings. Easy first win.",
    });
  }

  if ((profile.photo_count ?? 0) < 3) {
    gaps.push({
      id: "thin_photos",
      severity: "warning",
      title: `Thin photo set (${profile.photo_count ?? 0} on file)`,
      talk_track:
        "Package: photo management — 2–3 real jobsite photos this week; Maps trusts fresh work photos.",
    });
  }

  if (reviews < 12) {
    gaps.push({
      id: "low_reviews",
      severity: "critical",
      title: `Low review count (${reviews})`,
      talk_track:
        "Package: SMS review funnel — post-job text prompt + tracking before ads. Velocity wins the pack.",
    });
  } else if (reviews < 25) {
    gaps.push({
      id: "mid_reviews",
      severity: "warning",
      title: `Review count is middling (${reviews})`,
      talk_track:
        "Package: SMS review funnel + reply cadence — still closable; not a Map Pack winner yet.",
    });
  }

  if (rating > 0 && rating < 4.0) {
    gaps.push({
      id: "low_rating",
      severity: "critical",
      title: `Rating under 4.0 (${rating})`,
      talk_track: "Address open negative themes before boosting visibility — more traffic into a weak rating burns trust.",
    });
  } else if (rating > 0 && rating < 4.3) {
    gaps.push({
      id: "ok_rating",
      severity: "info",
      title: `Rating is OK but not elite (${rating})`,
      talk_track: "Owner replies that name the service performed help AI summaries and local trust.",
    });
  }

  if (!lead.email) {
    gaps.push({
      id: "no_email",
      severity: "info",
      title: "No email on the CRM row",
      talk_track: "Confirm decision-maker email on the call for the PDF / LVS follow-up.",
    });
  }

  const types = (profile.types ?? []).join(" ");
  if (/\bestablishment\b/i.test(types) && !/\b(plomb|hvac|electr|roof|contractor|seal|landscap|dental)\b/i.test(types)) {
    gaps.push({
      id: "generic_types",
      severity: "warning",
      title: "Maps types look generic",
      talk_track: "Confirm primary GBP category matches how customers search (trade-specific, not vague contractor).",
    });
  }

  const organic = profile.organic;
  if (organic && !organic.skipped) {
    const siteN = organic.site_total_results;
    if (typeof siteN === "number" && siteN <= 5) {
      gaps.push({
        id: "thin_site_index",
        severity: siteN === 0 ? "critical" : "warning",
        title: `Thin organic index (site: ≈ ${siteN})`,
        talk_track:
          "Package: SEO / SEM / GEO / AEO — domain barely indexed; service pages + GBP website fix before ads.",
      });
    }
    if (organic.branded_hit === false) {
      gaps.push({
        id: "weak_branded_organic",
        severity: "critical",
        title: "Weak branded organic (name + city miss)",
        talk_track:
          "Package: SEO + citations / social presence — name+city miss; NAP + on-page brand before paid.",
      });
    }
  }

  if (gaps.length === 0) {
    gaps.push({
      id: "strong_surface",
      severity: "info",
      title: "Surface signals look relatively strong",
      talk_track:
        "Lead with a full Local Visibility Score anyway — ranked checklist + PDF beats guessing on the call.",
    });
  }

  return gaps;
}

export function formatPreCallReportMarkdown(input: {
  businessName: string;
  profile: LeadProfile;
  gaps: PreCallGap[];
}): string {
  const { businessName, profile, gaps } = input;
  const lines: string[] = [
    `# Pre-call report — ${businessName}`,
    "",
    "## Google / Maps snapshot",
    `- Place ID: ${profile.place_id ?? "—"}`,
    `- Rating: ${profile.rating ?? "—"} · Reviews: ${profile.review_count ?? "—"}`,
    `- Website: ${profile.website ?? "—"}`,
    `- Maps: ${profile.maps_url ?? "—"}`,
    `- Address: ${profile.address ?? "—"}`,
    `- Hours on file: ${profile.has_hours == null ? "—" : profile.has_hours ? "yes" : "no"}`,
    `- Photos on file: ${profile.photo_count ?? "—"}`,
    `- Types: ${(profile.types ?? []).slice(0, 8).join(", ") || "—"}`,
    `- Maps query: ${profile.maps_query ?? "—"}`,
    "",
    "## Organic (Custom Search)",
    `- site: results: ${profile.organic?.skipped ? `skipped (${profile.organic.reason || "—"})` : (profile.organic?.site_total_results ?? "—")}`,
    `- Branded: ${
      profile.organic?.skipped
        ? "skipped"
        : profile.organic?.branded_hit == null
          ? "—"
          : profile.organic.branded_hit
            ? `hit #${profile.organic.branded_rank ?? "?"}`
            : "miss"
    }`,
    `- Opportunity score: ${profile.opportunity_score ?? "—"}`,
    "",
    "## Talk-track checklist (gaps)",
  ];

  for (const g of gaps) {
    lines.push(`### [${g.severity}] ${g.title}`);
    lines.push(g.talk_track);
    lines.push("");
  }

  lines.push("---");
  lines.push("Offer: run Local Visibility Score (name + ZIP) → scorecard + PDF before pitching retainers.");
  return lines.join("\n");
}

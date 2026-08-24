/**
 * Weak-presence / opportunity scoring for Hunter Leadfinder.
 *
 * ICP: estimated local-visibility grade **C or below** (C / D / F) with
 * multiple sellable Nemo package gaps — not Map Pack / B / C+ shops.
 *
 * Higher opportunity = weaker presence = better dial target.
 */
import type { OrganicFootprint } from "@/lib/custom-search";
import type { LeadProfile } from "@/lib/lead-profile";

/** Soft prefer under this review count when scoring. */
export const WEAK_REVIEW_SOFT_MAX = 25;
/** Critical review gap (SMS review-funnel package). */
export const WEAK_REVIEW_CRITICAL = 12;
/**
 * Website + this many reviews → hard skip (B / C+ surface).
 * With SERP, branded miss can still keep slightly above only if other packages fire.
 */
export const STRONG_REVIEW_HARD_SKIP = 40;
/** Without organic proof, website + this many reviews → hard skip. */
export const STRONG_REVIEW_HARD_SKIP_NO_CSE = 25;
/** @deprecated alias */
export const STRONG_REVIEW_HARD_SKIP_NO_ORGANIC = STRONG_REVIEW_HARD_SKIP_NO_CSE;
/** site: totalResults at or below this = thin index (SEO / site package). */
export const THIN_SITE_INDEX_MAX = 5;
/** Min opportunity when SERP path has no critical Maps gap (legacy path; prefer grade gate). */
export const MIN_OPPORTUNITY_KEEP = 50;
/** Need at least this many sellable packages to queue. */
export const MIN_PACKAGE_GAPS = 2;

/** LVS-aligned letter grades (visibility score, not opportunity). */
export type ProspectGrade = "A" | "B" | "C" | "D" | "F";

/** Sellable Nemo packages inferred from Maps / organic gaps. */
export type ServicePackageId =
  | "gbp_management"
  | "photo_management"
  | "review_sms_funnel"
  | "website_build_or_fix"
  | "local_seo_sem_geo_aeo"
  | "social_presence"
  | "paid_ads_after_foundation";

export type ServicePackageGap = {
  id: ServicePackageId;
  label: string;
  severity: "critical" | "warning";
};

export type OpportunityBreakdown = {
  maps: number;
  organic: number;
  total: number;
  reasons: string[];
  criticalMapsGap: boolean;
  /** Estimated LVS-style grade from surface signals (A–F). */
  estimatedGrade: ProspectGrade;
  /** Rough visibility 0–100 (higher = healthier; A/B when high). */
  visibilityScore: number;
  packages: ServicePackageGap[];
};

function hasRealWebsite(website: string | null | undefined): boolean {
  const w = (website ?? "").trim();
  return Boolean(w) && !w.startsWith("(listed");
}

/** Same bands as LVS `gradeFromScore` (visibility, not opportunity). */
export function gradeFromVisibilityScore(score: number): ProspectGrade {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 65) return "C";
  if (score >= 50) return "D";
  return "F";
}

export function isCOrBelow(grade: ProspectGrade): boolean {
  return grade === "C" || grade === "D" || grade === "F";
}

/**
 * Infer sellable packages from Maps + organic gaps.
 * These drive keep/skip — one weak signal is not enough.
 */
export function listServicePackageGaps(
  profile: Pick<
    LeadProfile,
    "website" | "review_count" | "has_hours" | "photo_count" | "rating"
  >,
  organic: OrganicFootprint | null | undefined,
): ServicePackageGap[] {
  const packages: ServicePackageGap[] = [];
  const reviews = profile.review_count ?? 0;
  const website = hasRealWebsite(profile.website);
  const photos = profile.photo_count ?? 0;

  if (profile.has_hours === false) {
    packages.push({
      id: "gbp_management",
      label: "GBP / hours & listing completeness",
      severity: "critical",
    });
  }

  if (photos < 3) {
    packages.push({
      id: "photo_management",
      label: "Photo / listing media management",
      severity: photos === 0 ? "critical" : "warning",
    });
  }

  if (reviews < WEAK_REVIEW_CRITICAL) {
    packages.push({
      id: "review_sms_funnel",
      label: "SMS review funnel / review velocity",
      severity: "critical",
    });
  } else if (reviews < WEAK_REVIEW_SOFT_MAX) {
    packages.push({
      id: "review_sms_funnel",
      label: "SMS review funnel / review velocity",
      severity: "warning",
    });
  }

  if (!website) {
    packages.push({
      id: "website_build_or_fix",
      label: "Website build / plugin & UX fixes",
      severity: "critical",
    });
  }

  if (organic && !organic.skipped) {
    const siteN = organic.site_total_results;
    const thinSite =
      website && typeof siteN === "number" && siteN <= THIN_SITE_INDEX_MAX;
    const brandedMiss = organic.branded_hit === false;

    if (thinSite || brandedMiss || (website && siteN === 0)) {
      packages.push({
        id: "local_seo_sem_geo_aeo",
        label: "SEO / SEM / GEO / AEO + site authority",
        severity: brandedMiss || siteN === 0 ? "critical" : "warning",
      });
    }

    // Name+city miss with almost no social/citation footprint → soft social package.
    if (brandedMiss && reviews < WEAK_REVIEW_SOFT_MAX) {
      packages.push({
        id: "social_presence",
        label: "Social / citation presence",
        severity: "warning",
      });
    }
  }

  // Ads only after foundation: weak GBP/reviews but they already have a site.
  if (
    website &&
    reviews < WEAK_REVIEW_CRITICAL &&
    (profile.has_hours === false || photos < 3)
  ) {
    packages.push({
      id: "paid_ads_after_foundation",
      label: "Paid ads (after GBP + reviews foundation)",
      severity: "warning",
    });
  }

  // Dedupe by id (keep strongest severity).
  const byId = new Map<ServicePackageId, ServicePackageGap>();
  for (const p of packages) {
    const prev = byId.get(p.id);
    if (!prev || (prev.severity === "warning" && p.severity === "critical")) {
      byId.set(p.id, p);
    }
  }
  return [...byId.values()];
}

/**
 * Visibility proxy (higher = healthier). Mirrors LVS intuition so we can
 * keep only C / D / F before a full audit runs.
 */
export function scoreVisibilityProxy(
  profile: Pick<
    LeadProfile,
    "website" | "review_count" | "has_hours" | "photo_count" | "rating"
  >,
  organic: OrganicFootprint | null | undefined,
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 88; // start near B; gaps pull into C/D/F
  const reviews = profile.review_count ?? 0;
  const website = hasRealWebsite(profile.website);

  if (!website) {
    score -= 28;
    reasons.push("no_website");
  }

  if (reviews < 5) {
    score -= 30;
    reasons.push(`reviews_${reviews}`);
  } else if (reviews < WEAK_REVIEW_CRITICAL) {
    score -= 22;
    reasons.push(`reviews_${reviews}`);
  } else if (reviews < WEAK_REVIEW_SOFT_MAX) {
    score -= 12;
    reasons.push(`reviews_mid_${reviews}`);
  } else if (reviews < STRONG_REVIEW_HARD_SKIP) {
    score -= 4;
    reasons.push(`reviews_ok_${reviews}`);
  } else {
    score += 6;
    reasons.push(`reviews_strong_${reviews}`);
  }

  if (profile.has_hours === false) {
    score -= 16;
    reasons.push("no_hours");
  }

  if ((profile.photo_count ?? 0) < 3) {
    score -= 10;
    reasons.push(`thin_photos_${profile.photo_count ?? 0}`);
  }

  const rating = profile.rating ?? 0;
  if (rating > 0 && rating < 4.0) {
    score -= 10;
    reasons.push(`rating_${rating}`);
  }

  if (organic && !organic.skipped) {
    const siteN = organic.site_total_results;
    if (typeof siteN === "number") {
      if (siteN <= 0) {
        score -= 18;
        reasons.push("site_zero");
      } else if (siteN <= THIN_SITE_INDEX_MAX) {
        score -= 12;
        reasons.push(`site_thin_${siteN}`);
      } else if (siteN > 50) {
        score += 6;
        reasons.push(`site_strong_${siteN}`);
      }
    }
    if (organic.branded_hit === false) {
      score -= 14;
      reasons.push("branded_miss");
    } else if (organic.branded_hit === true) {
      const rank = organic.branded_rank ?? 1;
      if (rank <= 3) {
        score += 8;
        reasons.push(`branded_top_${rank}`);
      }
    }
  }

  return { score: Math.max(0, Math.min(100, score)), reasons };
}

export function scoreMapsWeakness(profile: Pick<
  LeadProfile,
  "website" | "review_count" | "has_hours" | "photo_count" | "rating"
>): { score: number; reasons: string[]; criticalMapsGap: boolean } {
  const reasons: string[] = [];
  let score = 0;
  const reviews = profile.review_count ?? 0;
  const website = hasRealWebsite(profile.website);

  if (!website) {
    score += 35;
    reasons.push("no_website");
  }

  if (reviews < WEAK_REVIEW_CRITICAL) {
    score += 32;
    reasons.push(`reviews_${reviews}`);
  } else if (reviews < WEAK_REVIEW_SOFT_MAX) {
    score += 18;
    reasons.push(`reviews_mid_${reviews}`);
  } else if (reviews < STRONG_REVIEW_HARD_SKIP) {
    score += 4;
    reasons.push(`reviews_ok_${reviews}`);
  } else {
    score -= 20;
    reasons.push(`reviews_strong_${reviews}`);
  }

  if (profile.has_hours === false) {
    score += 18;
    reasons.push("no_hours");
  }

  if ((profile.photo_count ?? 0) < 3) {
    score += 12;
    reasons.push(`thin_photos_${profile.photo_count ?? 0}`);
  }

  const rating = profile.rating ?? 0;
  if (rating > 0 && rating < 4.0) {
    score += 8;
    reasons.push(`rating_${rating}`);
  }

  // Single soft gap is not "critical" anymore — need stacked package gaps.
  const criticalMapsGap =
    (!website && reviews < WEAK_REVIEW_SOFT_MAX) ||
    (reviews < WEAK_REVIEW_CRITICAL && (profile.has_hours === false || !website)) ||
    (profile.has_hours === false && (profile.photo_count ?? 0) < 3 && reviews < WEAK_REVIEW_SOFT_MAX);

  return { score: Math.max(0, Math.min(100, score)), reasons, criticalMapsGap };
}

export function scoreOrganicWeakness(organic: OrganicFootprint | null | undefined): {
  score: number;
  reasons: string[];
} {
  if (!organic || organic.skipped) {
    return { score: 0, reasons: organic?.skipped ? ["organic_skipped"] : ["organic_missing"] };
  }

  const reasons: string[] = [];
  let score = 0;
  const siteN = organic.site_total_results;

  if (organic.hostname == null && siteN == null) {
    score += 12;
    reasons.push("no_domain");
  } else if (typeof siteN === "number") {
    if (siteN <= 0) {
      score += 25;
      reasons.push("site_zero");
    } else if (siteN <= THIN_SITE_INDEX_MAX) {
      score += 18;
      reasons.push(`site_thin_${siteN}`);
    } else if (siteN <= 30) {
      score += 8;
      reasons.push(`site_modest_${siteN}`);
    } else {
      score -= 12;
      reasons.push(`site_strong_${siteN}`);
    }
  }

  if (organic.branded_hit === false) {
    score += 20;
    reasons.push("branded_miss");
  } else if (organic.branded_hit === true) {
    const rank = organic.branded_rank ?? 1;
    if (rank > 3) {
      score += 6;
      reasons.push(`branded_rank_${rank}`);
    } else {
      score -= 15;
      reasons.push(`branded_top_${rank}`);
    }
  }

  return { score: Math.max(0, Math.min(100, score)), reasons };
}

export function combineOpportunityScore(
  profile: LeadProfile,
  organic: OrganicFootprint | null | undefined,
): OpportunityBreakdown {
  const maps = scoreMapsWeakness(profile);
  const org = scoreOrganicWeakness(organic);
  const total = Math.max(0, Math.min(100, Math.round(maps.score * 0.65 + org.score * 0.35)));
  const vis = scoreVisibilityProxy(profile, organic);
  const packages = listServicePackageGaps(profile, organic);
  const estimatedGrade = gradeFromVisibilityScore(vis.score);

  return {
    maps: maps.score,
    organic: org.score,
    total,
    reasons: [...maps.reasons, ...org.reasons],
    criticalMapsGap: maps.criticalMapsGap,
    estimatedGrade,
    visibilityScore: vis.score,
    packages,
  };
}

/** Clear B / C+ / Map Pack surface — do not dial as weak presence. */
export function shouldHardSkipStrongPresence(
  profile: LeadProfile,
  organic: OrganicFootprint | null | undefined,
): boolean {
  const reviews = profile.review_count ?? 0;
  const website = hasRealWebsite(profile.website);
  const organicUnavailable = !organic || organic.skipped;

  // Always skip high-review listings with a website — not C-and-below ICP.
  if (website && reviews >= STRONG_REVIEW_HARD_SKIP) return true;

  // Without organic, website + mid reviews = already winning enough on Maps.
  if (organicUnavailable && website && reviews >= STRONG_REVIEW_HARD_SKIP_NO_CSE) {
    return true;
  }

  // With organic: branded top hit + real site + decent reviews → B-tier.
  if (
    !organicUnavailable &&
    website &&
    reviews >= STRONG_REVIEW_HARD_SKIP_NO_CSE &&
    organic.branded_hit === true &&
    (organic.branded_rank ?? 1) <= 3
  ) {
    return true;
  }

  if (
    !organicUnavailable &&
    website &&
    reviews >= STRONG_REVIEW_HARD_SKIP_NO_CSE &&
    typeof organic.site_total_results === "number" &&
    organic.site_total_results > 40
  ) {
    return true;
  }

  return false;
}

/**
 * Keep only C / D / F prospects with enough sellable packages.
 * One lonely gap (e.g. missing hours alone on an otherwise solid shop) is dropped.
 */
export function shouldKeepWeakProspect(
  breakdown: OpportunityBreakdown,
  _organic?: OrganicFootprint | null,
): boolean {
  if (!isCOrBelow(breakdown.estimatedGrade)) return false;
  if (breakdown.packages.length < MIN_PACKAGE_GAPS) return false;
  // Prefer stacked weakness: opportunity floor avoids soft C+ noise.
  if (breakdown.total < MIN_OPPORTUNITY_KEEP && !breakdown.criticalMapsGap) return false;
  return true;
}

export function formatPackageNotes(packages: ServicePackageGap[]): string {
  if (!packages.length) return "Packages: none";
  return `Packages: ${packages.map((p) => p.id).join(", ")}`;
}

export function formatOrganicNotes(organic: OrganicFootprint | null | undefined): string {
  if (!organic) return "Organic: n/a";
  if (organic.skipped) return `Organic: skipped (${organic.reason || "no SERP"})`;
  const site =
    organic.site_total_results == null
      ? "site: n/a"
      : `site≈${organic.site_total_results}`;
  const branded =
    organic.branded_hit == null
      ? "branded: n/a"
      : organic.branded_hit
        ? `branded: hit#${organic.branded_rank ?? "?"}`
        : "branded: miss";
  return `Organic: ${site} · ${branded}`;
}

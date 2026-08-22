/**
 * Weak-presence / opportunity scoring for Hunter Leadfinder.
 * Higher opportunity = weaker Maps/organic = better dial target.
 */
import type { OrganicFootprint } from "@/lib/custom-search";
import type { LeadProfile } from "@/lib/lead-profile";

/** Prefer prospects under this review count. */
export const WEAK_REVIEW_SOFT_MAX = 40;
/** Critical Maps gap when reviews below this. */
export const WEAK_REVIEW_CRITICAL = 15;
/** Map Pack winners at or above this + website + branded hit → hard skip. */
export const STRONG_REVIEW_HARD_SKIP = 150;
/** site: totalResults at or below this counts as thin index. */
export const THIN_SITE_INDEX_MAX = 5;
/** Minimum opportunity score to keep when no critical Maps gap. */
export const MIN_OPPORTUNITY_KEEP = 35;

export type OpportunityBreakdown = {
  maps: number;
  organic: number;
  total: number;
  reasons: string[];
  criticalMapsGap: boolean;
};

function hasRealWebsite(website: string | null | undefined): boolean {
  const w = (website ?? "").trim();
  return Boolean(w) && !w.startsWith("(listed");
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
    score += 30;
    reasons.push(`reviews_${reviews}`);
  } else if (reviews < WEAK_REVIEW_SOFT_MAX) {
    score += 18;
    reasons.push(`reviews_mid_${reviews}`);
  } else if (reviews < 80) {
    score += 6;
    reasons.push(`reviews_ok_${reviews}`);
  } else {
    score -= 15;
    reasons.push(`reviews_strong_${reviews}`);
  }

  if (profile.has_hours === false) {
    score += 15;
    reasons.push("no_hours");
  }

  if ((profile.photo_count ?? 0) < 3) {
    score += 10;
    reasons.push(`thin_photos_${profile.photo_count ?? 0}`);
  }

  const rating = profile.rating ?? 0;
  if (rating > 0 && rating < 4.0) {
    score += 8;
    reasons.push(`rating_${rating}`);
  }

  const criticalMapsGap =
    !website || reviews < WEAK_REVIEW_CRITICAL || profile.has_hours === false;

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
    // No website → already scored on Maps; mild organic boost for "no domain to rank"
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
  return {
    maps: maps.score,
    organic: org.score,
    total,
    reasons: [...maps.reasons, ...org.reasons],
    criticalMapsGap: maps.criticalMapsGap,
  };
}

/** Clear Map Pack / organic winners — do not dial as "weak presence". */
export function shouldHardSkipStrongPresence(
  profile: LeadProfile,
  organic: OrganicFootprint | null | undefined,
): boolean {
  const reviews = profile.review_count ?? 0;
  const website = hasRealWebsite(profile.website);
  if (reviews < STRONG_REVIEW_HARD_SKIP || !website) return false;

  // Strong review + website is enough to skip when organic confirms brand presence,
  // or when organic was skipped (don't queue obvious giants on Maps-only path).
  if (!organic || organic.skipped) return true;
  if (organic.branded_hit === true) return true;
  if (typeof organic.site_total_results === "number" && organic.site_total_results > 50) return true;
  return false;
}

export function shouldKeepWeakProspect(breakdown: OpportunityBreakdown): boolean {
  if (breakdown.criticalMapsGap) return true;
  return breakdown.total >= MIN_OPPORTUNITY_KEEP;
}

export function formatOrganicNotes(organic: OrganicFootprint | null | undefined): string {
  if (!organic) return "Organic: n/a";
  if (organic.skipped) return `Organic: skipped (${organic.reason || "no CSE"})`;
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

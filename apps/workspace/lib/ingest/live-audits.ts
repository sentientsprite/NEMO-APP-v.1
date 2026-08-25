/**
 * Live audit enrichment (PageSpeed + Places) appended to URL sourceContext.
 * Best-effort and env-gated — never throws into the workflow create path.
 */

import { fetchPageSpeedReport, formatPageSpeedReport, isPageSpeedConfigured } from "./pagespeed";
import {
  businessNameFromTitle,
  extractPhoneCandidate,
  fetchPlaceSnapshot,
  formatPlaceSnapshot,
  buildPlaceQuery,
  isPlacesConfigured,
} from "./places";

export interface LiveAuditInput {
  url: string;
  title: string;
  content: string;
}

export interface LiveAuditBlocks {
  pagespeedMarkdown?: string;
  placesMarkdown?: string;
  notes: string[];
}

export function liveAuditConfigSummary(): {
  pagespeed: boolean;
  places: boolean;
} {
  return {
    pagespeed: isPageSpeedConfigured(),
    places: isPlacesConfigured(),
  };
}

export async function enrichWithLiveAudits(input: LiveAuditInput): Promise<LiveAuditBlocks> {
  const notes: string[] = [];
  const host = (() => {
    try {
      return new URL(input.url).hostname.replace(/^www\./, "");
    } catch {
      return undefined;
    }
  })();

  const name = businessNameFromTitle(input.title);
  const phone = extractPhoneCandidate(input.content);
  const placeQuery = buildPlaceQuery({
    businessName: name,
    phone,
    websiteHost: host,
  });

  const pagespeedPromise = isPageSpeedConfigured()
    ? fetchPageSpeedReport(input.url).then(formatPageSpeedReport)
    : Promise.resolve(undefined);

  const placesPromise = isPlacesConfigured()
    ? fetchPlaceSnapshot({
        businessName: name,
        phone,
        websiteHost: host,
      }).then((snap) => formatPlaceSnapshot(snap, placeQuery))
    : Promise.resolve(undefined);

  if (!isPageSpeedConfigured()) {
    notes.push("PageSpeed skipped (set GOOGLE_PAGESPEED_API_KEY or GOOGLE_MAPS_API_KEY)");
  }
  if (!isPlacesConfigured()) {
    notes.push("Places/GBP skipped (set GOOGLE_MAPS_API_KEY)");
  }

  const [pagespeedMarkdown, placesMarkdown] = await Promise.all([
    pagespeedPromise.catch((error) => {
      notes.push(`PageSpeed failed: ${error instanceof Error ? error.message : "unknown"}`);
      return undefined;
    }),
    placesPromise.catch((error) => {
      notes.push(`Places failed: ${error instanceof Error ? error.message : "unknown"}`);
      return undefined;
    }),
  ]);

  return { pagespeedMarkdown, placesMarkdown, notes };
}

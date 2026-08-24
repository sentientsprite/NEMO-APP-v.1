/**
 * Google Places (New) — best-effort GBP-style lookup for workflow sourceContext.
 * Requires GOOGLE_MAPS_API_KEY with Places API (New) enabled.
 */

export function isPlacesConfigured(): boolean {
  return Boolean(placesApiKey());
}

function placesApiKey(): string {
  return process.env.GOOGLE_MAPS_API_KEY?.trim() || "";
}

export interface PlaceSnapshot {
  placeId?: string;
  name?: string;
  address?: string;
  phone?: string;
  website?: string;
  rating?: number;
  reviewCount?: number;
  primaryType?: string;
  photoCount?: number;
  hasHours?: boolean;
  mapsUri?: string;
  error?: string;
  skipped?: string;
}

export interface PlaceLookupInput {
  businessName: string;
  phone?: string;
  websiteHost?: string;
  localityHint?: string;
}

/** Build a text query from site title / phone / host. */
export function buildPlaceQuery(input: PlaceLookupInput): string {
  const parts = [input.businessName, input.phone, input.localityHint, input.websiteHost].filter(
    Boolean,
  );
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/** Strip common title suffixes ("Business – Tagline"). */
export function businessNameFromTitle(title: string): string {
  const cleaned = title
    .split(/\s+[–—|::-]\s+/)[0]
    ?.replace(/\s+/g, " ")
    .trim();
  return cleaned || title.trim();
}

export function extractPhoneCandidate(text: string): string | undefined {
  const match = text.match(
    /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/,
  );
  return match?.[0]?.replace(/\s+/g, " ").trim();
}

export async function fetchPlaceSnapshot(
  input: PlaceLookupInput,
  options: { timeoutMs?: number } = {},
): Promise<PlaceSnapshot> {
  const key = placesApiKey();
  if (!key) {
    return { skipped: "GOOGLE_MAPS_API_KEY not set — Places/GBP lookup skipped" };
  }

  const textQuery = buildPlaceQuery(input);
  if (!textQuery) {
    return { error: "No business name available for Places lookup" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);

  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber," +
          "places.websiteUri,places.rating,places.userRatingCount,places.primaryType," +
          "places.regularOpeningHours,places.photos,places.googleMapsUri",
      },
      body: JSON.stringify({ textQuery, pageSize: 1 }),
    });

    const json = (await res.json()) as {
      error?: { message?: string };
      places?: Array<{
        id?: string;
        displayName?: { text?: string };
        formattedAddress?: string;
        nationalPhoneNumber?: string;
        websiteUri?: string;
        rating?: number;
        userRatingCount?: number;
        primaryType?: string;
        regularOpeningHours?: unknown;
        photos?: unknown[];
        googleMapsUri?: string;
      }>;
    };

    if (!res.ok || json.error) {
      return { error: json.error?.message || `Places HTTP ${res.status}` };
    }

    const place = json.places?.[0];
    if (!place) {
      return { error: `No Places match for query: ${textQuery}` };
    }

    return {
      placeId: place.id,
      name: place.displayName?.text,
      address: place.formattedAddress,
      phone: place.nationalPhoneNumber,
      website: place.websiteUri,
      rating: place.rating,
      reviewCount: place.userRatingCount,
      primaryType: place.primaryType,
      photoCount: place.photos?.length ?? 0,
      hasHours: Boolean(place.regularOpeningHours),
      mapsUri: place.googleMapsUri,
    };
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "Places lookup timed out"
        : error instanceof Error
          ? error.message
          : "Places lookup failed";
    return { error: message };
  } finally {
    clearTimeout(timer);
  }
}

export function formatPlaceSnapshot(snapshot: PlaceSnapshot, query: string): string {
  const lines = [`### Google Places / GBP snapshot`, `- Query: ${query}`];
  if (snapshot.skipped) {
    lines.push(`- ${snapshot.skipped}`);
    return lines.join("\n");
  }
  if (snapshot.error) {
    lines.push(`- Error: ${snapshot.error}`);
    return lines.join("\n");
  }
  lines.push(
    `- Name: ${snapshot.name ?? "n/a"}`,
    `- Rating: ${snapshot.rating ?? "n/a"} (${snapshot.reviewCount ?? 0} reviews)`,
    `- Category: ${snapshot.primaryType ?? "n/a"}`,
    `- Phone: ${snapshot.phone ?? "n/a"}`,
    `- Address: ${snapshot.address ?? "n/a"}`,
    `- Website: ${snapshot.website ?? "n/a"}`,
    `- Hours present: ${snapshot.hasHours ? "yes" : "no"}`,
    `- Photos (API sample): ${snapshot.photoCount ?? 0}`,
  );
  if (snapshot.mapsUri) lines.push(`- Maps: ${snapshot.mapsUri}`);
  return lines.join("\n");
}

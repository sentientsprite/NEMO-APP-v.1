import type { LeadProfile } from "@/lib/lead-profile";

export function placesApiKey(): string {
  return (
    process.env.GOOGLE_PLACES_API_KEY?.trim() ||
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    ""
  );
}

type PlaceDetailsResult = {
  name?: string;
  formatted_phone_number?: string;
  formatted_address?: string;
  business_status?: string;
  place_id?: string;
  rating?: number;
  user_ratings_total?: number;
  website?: string;
  url?: string;
  types?: string[];
  opening_hours?: { open_now?: boolean };
  photos?: unknown[];
};

export async function fetchPlaceDetails(placeId: string): Promise<PlaceDetailsResult | null> {
  const key = placesApiKey();
  if (!key) throw new Error("Missing GOOGLE_PLACES_API_KEY / GOOGLE_MAPS_API_KEY");

  const u = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  u.searchParams.set("place_id", placeId);
  u.searchParams.set(
    "fields",
    "name,formatted_phone_number,formatted_address,business_status,place_id,rating,user_ratings_total,website,url,types,opening_hours,photos",
  );
  u.searchParams.set("key", key);
  const res = await fetch(u, { signal: AbortSignal.timeout(10_000) });
  const data = (await res.json()) as {
    status: string;
    error_message?: string;
    result?: PlaceDetailsResult;
  };
  if (data.status !== "OK" || !data.result) {
    throw new Error(`Places Details: ${data.status} ${data.error_message || ""}`.trim());
  }
  return data.result;
}

export function placeDetailsToProfile(
  det: PlaceDetailsResult,
  extras?: { maps_query?: string | null },
): LeadProfile {
  return {
    place_id: det.place_id,
    website: det.website?.trim() || null,
    maps_url: det.url?.trim() || null,
    address: det.formatted_address?.trim() || null,
    rating: typeof det.rating === "number" ? det.rating : null,
    review_count: det.user_ratings_total ?? 0,
    types: Array.isArray(det.types) ? det.types.slice(0, 8) : [],
    maps_query: extras?.maps_query ?? null,
    hours_open_now: det.opening_hours?.open_now ?? null,
    has_hours: det.opening_hours != null,
    photo_count: Array.isArray(det.photos) ? det.photos.length : 0,
    business_status: det.business_status ?? null,
    fetched_at: new Date().toISOString(),
  };
}

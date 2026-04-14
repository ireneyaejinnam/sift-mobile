/**
 * google-places.ts
 *
 * Fetches venue photos from the Google Places API (New / v1).
 * Returns a stable photo URL that can be stored in events.image_url.
 *
 * Uses in-process cache so the same venue isn't looked up twice per run.
 */

// venue name → photo URL (or null if not found)
const cache = new Map<string, string | null>();

/**
 * Look up a venue photo URL from Google Places.
 * Returns null if not found or if API key is missing.
 */
export async function getVenuePhotoUrl(
  venueName: string,
  borough?: string
): Promise<string | null> {
  const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
  if (!API_KEY) return null;

  const cacheKey = `${venueName}::${borough ?? ''}`.toLowerCase();
  if (cache.has(cacheKey)) return cache.get(cacheKey)!;

  const query = borough
    ? `${venueName} ${borough} New York`
    : `${venueName} New York`;

  try {
    // Step 1: Text search for the venue
    const searchRes = await fetch(
      'https://places.googleapis.com/v1/places:searchText',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': API_KEY,
          'X-Goog-FieldMask': 'places.photos,places.displayName',
        },
        body: JSON.stringify({
          textQuery: query,
          maxResultCount: 1,
          locationBias: {
            circle: {
              center: { latitude: 40.7128, longitude: -74.0060 }, // NYC center
              radius: 50000,
            },
          },
        }),
      }
    );

    if (!searchRes.ok) {
      cache.set(cacheKey, null);
      return null;
    }

    const searchData = await searchRes.json();
    const photoName = searchData.places?.[0]?.photos?.[0]?.name;

    if (!photoName) {
      cache.set(cacheKey, null);
      return null;
    }

    // Step 2: Build the photo URL (direct media URL, no second request needed)
    const photoUrl = `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=800&key=${API_KEY}`;

    cache.set(cacheKey, photoUrl);
    return photoUrl;
  } catch {
    cache.set(cacheKey, null);
    return null;
  }
}

/**
 * Clear the in-process cache (useful between ingest runs).
 */
export function clearPhotoCache() {
  cache.clear();
}

/**
 * Post-processing step: fill image_url for recently ingested events that have
 * a venue_name but no image. Called from ingest-all.ts after each run.
 *
 * Limits to 200 events per run to stay within API quotas.
 */
export async function fillMissingPhotos(): Promise<void> {
  if (!process.env.GOOGLE_PLACES_API_KEY) {
    console.log('[Photos] Skipping — GOOGLE_PLACES_API_KEY not set');
    return;
  }

  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  const { data: events, error } = await supabase
    .from('events')
    .select('id, venue_name, borough')
    .is('image_url', null)
    .not('venue_name', 'is', null)
    .neq('is_suppressed', true)
    .in('borough', ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island'])
    .order('start_date', { ascending: true })
    .limit(200);

  if (error || !events?.length) {
    console.log('[Photos] No events need photos');
    return;
  }

  console.log(`[Photos] Looking up photos for ${events.length} events...`);

  // Group by venue to avoid duplicate API calls
  const venueMap = new Map<string, { ids: string[]; borough: string; name: string }>();
  for (const e of events) {
    const key = (e.venue_name as string).toLowerCase().trim();
    if (!venueMap.has(key)) {
      venueMap.set(key, { ids: [], borough: e.borough ?? '', name: e.venue_name as string });
    }
    venueMap.get(key)!.ids.push(e.id as string);
  }

  let filled = 0;
  for (const { ids, borough, name } of venueMap.values()) {
    const photoUrl = await getVenuePhotoUrl(name, borough);
    if (photoUrl) {
      await supabase.from('events').update({ image_url: photoUrl }).in('id', ids);
      filled++;
    }
    await new Promise(r => setTimeout(r, 100));
  }

  console.log(`[Photos] Filled photos for ${filled}/${venueMap.size} venues`);
}

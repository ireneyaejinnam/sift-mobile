import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// ── Borough bounding boxes (fast, no API call) ─────────────────────────────
// Live in a pure module so scripts can import the coordinate check without
// pulling in this file's Supabase client.
export { BOROUGH_BOXES, extractBoroughFromCoords } from './nycBounds';
import { extractBoroughFromCoords } from './nycBounds';

// ── Borough extraction from address string ──────────────────────────────────
export function extractBoroughFromAddress(address: string): string | null {
  const a = address.toLowerCase();
  if (/brooklyn/i.test(a)) return 'Brooklyn';
  if (/queens|flushing|astoria|jamaica|bayside|ridgewood/i.test(a)) return 'Queens';
  if (/bronx/i.test(a)) return 'Bronx';
  if (/staten island/i.test(a)) return 'Staten Island';
  if (/new york|manhattan|ny,?\s*ny/i.test(a)) return 'Manhattan';
  return null;
}

// ── Nominatim reverse geocoding (1 req/sec limit) ──────────────────────────
let lastNominatimCall = 0;

async function nominatimDelay() {
  const elapsed = Date.now() - lastNominatimCall;
  if (elapsed < 1100) await new Promise(r => setTimeout(r, 1100 - elapsed));
  lastNominatimCall = Date.now();
}

export async function geocodeNeighborhood(
  lat: number,
  lng: number
): Promise<{ neighborhood: string; borough: string } | null> {
  await nominatimDelay();
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { 'User-Agent': 'sift-nyc-app/1.0 (contact@siftnyc.com)' } }
    );
    if (!res.ok) return null;
    const json = await res.json();
    const addr = json.address ?? {};
    const neighborhood =
      addr.neighbourhood || addr.suburb || addr.quarter || addr.city_district || null;
    const boroughRaw =
      addr.city_district || addr.county || addr.suburb || null;
    // Map Nominatim values to standard NYC borough names
    const borough = boroughRaw
      ? ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island'].find(b =>
          boroughRaw.toLowerCase().includes(b.toLowerCase())
        ) ?? extractBoroughFromCoords(lat, lng)
      : extractBoroughFromCoords(lat, lng);
    if (!borough) return null;
    return { neighborhood: neighborhood ?? borough, borough };
  } catch {
    return null;
  }
}

export async function geocodeAddress(
  address: string
): Promise<{ lat: number; lng: number } | null> {
  await nominatimDelay();
  try {
    const params = new URLSearchParams({
      q: address,
      format: 'json',
      limit: '1',
      countrycodes: 'us',
    });
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?${params}`,
      { headers: { 'User-Agent': 'sift-nyc-app/1.0 (contact@siftnyc.com)' } }
    );
    if (!res.ok) return null;
    const json = await res.json();
    if (!json[0]) return null;
    return { lat: parseFloat(json[0].lat), lng: parseFloat(json[0].lon) };
  } catch {
    return null;
  }
}

// ── Main: fill in borough/neighborhood for all events missing it ────────────
export async function geocodeAllEvents(): Promise<void> {
  console.log('[Geocode] Starting geocode pass...');

  // ── Pass 1: fill borough from coords or address (no API calls) ─────────
  console.log('[Geocode] Pass 1: filling borough from coords/address strings...');

  const { data: noBorough, error } = await supabase
    .from('events')
    .select('id, latitude, longitude, address, borough')
    .is('borough', null)
    .limit(5000);

  if (error) {
    console.error('[Geocode] Fetch error:', error.message);
    return;
  }

  console.log(`[Geocode] Found ${noBorough?.length ?? 0} events missing borough`);

  let pass1Updated = 0;
  const stillMissingBorough: string[] = [];

  for (const ev of noBorough ?? []) {
    let borough: string | null = null;

    // Try coords first (fast)
    if (ev.latitude && ev.longitude) {
      borough = extractBoroughFromCoords(ev.latitude, ev.longitude);
    }
    // Fallback to address string
    if (!borough && ev.address) {
      borough = extractBoroughFromAddress(ev.address);
    }

    if (borough) {
      const { error: upErr } = await supabase
        .from('events')
        .update({ borough })
        .eq('id', ev.id);
      if (!upErr) pass1Updated++;
    } else {
      stillMissingBorough.push(ev.id);
    }
  }

  console.log(`[Geocode] Pass 1 complete: ${pass1Updated} boroughs filled, ${stillMissingBorough.length} still missing`);

  // ── Pass 2: Nominatim reverse geocode for events with coords but no borough ─
  // Only run if there are events with lat/lng but no borough still
  const { data: needsNominatim } = await supabase
    .from('events')
    .select('id, latitude, longitude')
    .is('borough', null)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .limit(50); // cap at 50 per run to stay under Vercel 300s timeout

  if (!needsNominatim?.length) {
    console.log('[Geocode] No events need Nominatim reverse geocoding.');
    return;
  }

  console.log(`[Geocode] Pass 2: Nominatim reverse geocoding ${needsNominatim.length} events (slow, 1/sec)...`);
  let pass2Updated = 0;

  for (const ev of needsNominatim) {
    const result = await geocodeNeighborhood(ev.latitude, ev.longitude);
    if (result) {
      await supabase
        .from('events')
        .update({ borough: result.borough, neighborhood: result.neighborhood })
        .eq('id', ev.id);
      pass2Updated++;
    }
  }

  console.log(`[Geocode] Pass 2 complete: ${pass2Updated} events geocoded via Nominatim`);

  // ── Pass 3: Nominatim forward geocode for events with address but no coords ─
  const { data: needsForward } = await supabase
    .from('events')
    .select('id, address, venue_name')
    .is('borough', null)
    .is('latitude', null)
    .limit(50); // cap at 50 per run to stay under Vercel 300s timeout

  if (needsForward?.length) {
    console.log(`[Geocode] Pass 3: Nominatim forward geocoding ${needsForward.length} events by address...`);
    let pass3Updated = 0;

    for (const ev of needsForward) {
      const query = ev.address || (ev.venue_name ? `${ev.venue_name}, New York, NY` : null);
      if (!query) continue;

      const coords = await geocodeAddress(query);
      if (coords) {
        const borough = extractBoroughFromCoords(coords.lat, coords.lng);
        if (borough) {
          await supabase
            .from('events')
            .update({ latitude: coords.lat, longitude: coords.lng, borough })
            .eq('id', ev.id);
          pass3Updated++;
        }
      }
    }

    console.log(`[Geocode] Pass 3 complete: ${pass3Updated} events geocoded via forward lookup`);
  }

  // ── Pass 4: report events still missing a borough ──────────────────────────
  // Previously these were force-defaulted to 'Manhattan', which DISGUISED non-NYC
  // leaks (e.g. a Baltimore event) as valid NYC events. We now leave the borough
  // null so the NYC borough guard at query time excludes them from the feed.
  const { data: noLocation, error: noLocErr } = await supabase
    .from('events')
    .select('id')
    .is('borough', null)
    .limit(5000);

  if (!noLocErr && noLocation?.length) {
    console.log(`[Geocode] Pass 4: ${noLocation.length} events still have no borough — left null (excluded from the NYC feed by the borough guard).`);
  }

  console.log('[Geocode] Done.');
}

async function main() {
  await geocodeAllEvents();
}

// Only run when executed directly (not when imported by other scripts)

if (require.main === module) {
  main().catch(console.error);
}

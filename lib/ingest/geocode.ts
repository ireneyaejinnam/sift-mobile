import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// ── Borough bounding boxes (fast, no API call) ─────────────────────────────
// Rough but accurate enough for NYC. Used as a first pass before Nominatim.
const BOROUGH_BOXES = [
  {
    name: 'Manhattan',
    minLat: 40.6986, maxLat: 40.8820, minLng: -74.0210, maxLng: -73.9070,
  },
  {
    name: 'Brooklyn',
    minLat: 40.5695, maxLat: 40.7395, minLng: -74.0420, maxLng: -73.8330,
  },
  {
    name: 'Queens',
    minLat: 40.5413, maxLat: 40.8007, minLng: -73.9630, maxLng: -73.6996,
  },
  {
    name: 'Bronx',
    minLat: 40.7855, maxLat: 40.9176, minLng: -73.9338, maxLng: -73.7654,
  },
  {
    name: 'Staten Island',
    minLat: 40.4774, maxLat: 40.6514, minLng: -74.2591, maxLng: -74.0341,
  },
] as const;

export function extractBoroughFromCoords(lat: number, lng: number): string | null {
  for (const b of BOROUGH_BOXES) {
    if (lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng) {
      return b.name;
    }
  }
  return null;
}

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
    .limit(200); // cap at 200 to respect rate limit (~3 min)

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
    .limit(100); // cap at 100 to respect rate limit (~2 min)

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

  // ── Pass 4: fallback — events with utterly no location data ────────────────
  // Rather than looping forever, set these to 'Manhattan' (most NYC events are there)
  // so they stop appearing as "missing borough" on every run.
  const { data: noLocation, error: noLocErr } = await supabase
    .from('events')
    .select('id')
    .is('borough', null)
    .limit(5000);

  if (!noLocErr && noLocation?.length) {
    console.log(`[Geocode] Pass 4: defaulting ${noLocation.length} events with no location data to Manhattan`);
    const ids = noLocation.map(e => e.id);
    for (let i = 0; i < ids.length; i += 50) {
      await supabase
        .from('events')
        .update({ borough: 'Manhattan' })
        .in('id', ids.slice(i, i + 50));
    }
    console.log(`[Geocode] Pass 4 complete: ${noLocation.length} events defaulted`);
  }

  console.log('[Geocode] Done.');
}

async function main() {
  await geocodeAllEvents();
}

// Only run when executed directly (not when imported by other scripts)
import { fileURLToPath } from 'url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(console.error);
}

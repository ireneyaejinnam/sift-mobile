/**
 * backfill-photos.ts
 *
 * Finds events with no image_url, looks up the venue photo from Google Places,
 * and updates the events table.
 *
 * Groups by venue_name so each venue is only looked up once.
 * Processes in batches with a short delay to stay within rate limits.
 *
 * Usage:
 *   npx tsx scripts/backfill-photos.ts
 *
 * Env required:
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY, GOOGLE_PLACES_API_KEY
 */

import * as fs from 'fs';
import * as path from 'path';

const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const [key, ...rest] = line.split('=');
    if (key && !key.startsWith('#') && rest.length) {
      process.env[key.trim()] = rest.join('=').trim().replace(/^["']|["']$/g, '');
    }
  }
}

import { createClient } from '@supabase/supabase-js';
import { getVenuePhotoUrl } from '../lib/ingest/google-places';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const NYC_BOROUGHS = ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island'];

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  if (!process.env.GOOGLE_PLACES_API_KEY) {
    console.error('[BackfillPhotos] Missing GOOGLE_PLACES_API_KEY');
    process.exit(1);
  }

  console.log('[BackfillPhotos] Fetching events without images...');

  // Fetch all events missing image_url with a real venue name
  let allEvents: { id: string; venue_name: string; borough: string }[] = [];
  let page = 0;

  while (true) {
    const { data, error } = await supabase
      .from('events')
      .select('id, venue_name, borough')
      .is('image_url', null)
      .in('borough', NYC_BOROUGHS)
      .not('venue_name', 'is', null)
      .neq('is_suppressed', true)
      .order('start_date', { ascending: true })
      .range(page * 500, (page + 1) * 500 - 1);

    if (error) { console.error('[BackfillPhotos] Fetch error:', error.message); break; }
    if (!data?.length) break;
    allEvents = allEvents.concat(data as any[]);
    if (data.length < 500) break;
    page++;
  }

  console.log(`[BackfillPhotos] ${allEvents.length} events need photos`);

  // Group event IDs by venue name to avoid duplicate API calls
  const venueMap = new Map<string, { ids: string[]; borough: string }>();
  for (const e of allEvents) {
    const key = e.venue_name.toLowerCase().trim();
    if (!venueMap.has(key)) {
      venueMap.set(key, { ids: [], borough: e.borough });
    }
    venueMap.get(key)!.ids.push(e.id);
  }

  console.log(`[BackfillPhotos] ${venueMap.size} unique venues to look up\n`);

  let found = 0;
  let notFound = 0;
  let errors = 0;
  let venuesDone = 0;

  for (const [venueKey, { ids, borough }] of venueMap) {
    const venueName = allEvents.find(
      e => e.venue_name.toLowerCase().trim() === venueKey
    )?.venue_name ?? venueKey;

    try {
      const photoUrl = await getVenuePhotoUrl(venueName, borough);

      if (photoUrl) {
        // Update all events at this venue
        const { error } = await supabase
          .from('events')
          .update({ image_url: photoUrl })
          .in('id', ids);

        if (error) {
          console.error(`  ! Update failed for "${venueName}":`, error.message);
          errors++;
        } else {
          found++;
          console.log(`  ✓ "${venueName}" → ${ids.length} event(s) updated`);
        }
      } else {
        notFound++;
      }
    } catch (err) {
      errors++;
      console.error(`  ! Error for "${venueName}":`, (err as Error).message);
    }

    venuesDone++;
    if (venuesDone % 10 === 0) {
      console.log(`[BackfillPhotos] Progress: ${venuesDone}/${venueMap.size} venues`);
    }

    // ~100ms between requests — well within Google's 600 req/min limit
    await sleep(100);
  }

  const totalUpdated = [...venueMap.values()]
    .filter((_, i) => i < found) // approximate
    .reduce((sum, v) => sum + v.ids.length, 0);

  console.log('\n[BackfillPhotos] ====== Done ======');
  console.log(`  Venues found:     ${found}`);
  console.log(`  Venues not found: ${notFound}`);
  console.log(`  Errors:           ${errors}`);
}

main().catch(console.error);

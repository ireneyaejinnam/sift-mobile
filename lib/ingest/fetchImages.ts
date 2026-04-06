/**
 * Image fetching step — fills in missing image_url using Unsplash API.
 *
 * Runs as the last post-processing step after dedup.
 * For each event with no image_url, fetches a relevant stock photo
 * from Unsplash based on the event category.
 *
 * Requires UNSPLASH_ACCESS_KEY in .env
 * Free tier: 50 requests/hour, which is enough for incremental updates.
 *
 * To avoid re-fetching, only events with image_url IS NULL are processed.
 * Each category maps to a curated search query for best results.
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// Curated search queries per category for best Unsplash results
const CATEGORY_QUERIES: Record<string, string> = {
  live_music:  'live concert music performance stage',
  art:         'art gallery exhibition painting',
  theater:     'theater stage play performance',
  comedy:      'comedy stand up microphone spotlight',
  workshops:   'workshop creative class hands-on',
  fitness:     'fitness yoga workout outdoor',
  food:        'food dining restaurant table',
  outdoors:    'outdoor park nature new york',
  nightlife:   'nightlife bar party lights',
  popups:      'market popup shopping urban',
};

interface UnsplashPhoto {
  urls: {
    regular: string;
    small: string;
  };
}

// In-memory cache: category → list of photo URLs fetched this run
// Cycles through them to vary images across events in the same category
const photoCache: Record<string, string[]> = {};
const photoCacheIndex: Record<string, number> = {};

async function getPhotoForCategory(category: string): Promise<string | null> {
  if (!process.env.UNSPLASH_ACCESS_KEY) return null;

  // Refill cache for this category if empty
  if (!photoCache[category] || photoCache[category].length === 0) {
    const query = CATEGORY_QUERIES[category] ?? 'new york city event';
    const url = `https://api.unsplash.com/photos/random?query=${encodeURIComponent(query)}&orientation=landscape&count=10&client_id=${process.env.UNSPLASH_ACCESS_KEY}`;

    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`[Images] Unsplash API error ${res.status} for category "${category}"`);
        return null;
      }
      const photos = (await res.json()) as UnsplashPhoto[];
      photoCache[category] = photos.map((p) => p.urls.regular);
      photoCacheIndex[category] = 0;
    } catch (err) {
      console.warn(`[Images] Failed to fetch Unsplash photos for "${category}":`, err);
      return null;
    }
  }

  // Return next photo from cache, cycling through
  const photos = photoCache[category];
  const idx = photoCacheIndex[category] ?? 0;
  photoCacheIndex[category] = (idx + 1) % photos.length;
  return photos[idx];
}

export async function fetchMissingImages(): Promise<void> {
  if (!process.env.UNSPLASH_ACCESS_KEY) {
    console.log('[Images] UNSPLASH_ACCESS_KEY not set, skipping image fetch');
    return;
  }

  console.log('[Images] Fetching images for events with no image_url...');

  const { data: events, error } = await supabase
    .from('events')
    .select('id, category')
    .is('image_url', null)
    .gte('start_date', new Date().toISOString().split('T')[0])
    .limit(200);

  if (error || !events || events.length === 0) {
    console.log('[Images] No events need images:', error?.message ?? 'none found');
    return;
  }

  console.log(`[Images] Processing ${events.length} events...`);

  let updated = 0;
  let failed = 0;

  for (const event of events) {
    const imageUrl = await getPhotoForCategory(event.category);

    if (imageUrl) {
      const { error: updateError } = await supabase
        .from('events')
        .update({ image_url: imageUrl })
        .eq('id', event.id);

      if (updateError) {
        failed++;
      } else {
        updated++;
      }
    } else {
      failed++;
    }

    // Unsplash free tier: 50 req/hour = ~1 req/72s
    // We batch 10 photos per request so 1 request covers 10 events → safe at any speed
    // But add a small delay to be safe
    await new Promise((r) => setTimeout(r, 100));
  }

  console.log(`[Images] Done. Updated: ${updated}, Failed: ${failed}`);
}

// Run directly: npx tsx --env-file=.env lib/ingest/fetchImages.ts
if (process.argv[1] && process.argv[1].endsWith('fetchImages.ts')) {
  fetchMissingImages().catch(console.error);
}

import { normalizeEvent } from './normalize';
import { upsertEvents } from './upsert';
import { SiftEvent } from './schema';
import { LUMA_SEED_CALENDARS } from './config';

/**
 * Luma (lu.ma) ingester — scrapes the NYC discover page.
 *
 * Luma's public API requires a key, but the Next.js page embeds
 * ~20–29 curated NYC events in __NEXT_DATA__ with no auth needed.
 * These are Luma's own featured/trending picks for the city — high signal.
 *
 * Expected yield: 20–30 events per run
 */

const LUMA_NYC_URL = 'https://lu.ma/nyc';

// Title-based category inference (Luma has no category field)
const CATEGORY_KEYWORDS: { keywords: string[]; category: string }[] = [
  { keywords: ['concert', 'live music', 'band', 'dj set', 'showcase', 'album', 'listening party', 'jazz', 'hip hop', 'rap', 'r&b', 'indie', 'punk', 'electronic', 'techno', 'house music'], category: 'live_music' },
  { keywords: ['comedy', 'stand-up', 'standup', 'improv', 'open mic', 'roast'], category: 'comedy' },
  { keywords: ['gallery', 'exhibition', 'art show', 'opening', 'studio', 'artist', 'art fair', 'pop-up art', 'installation', 'film screening', 'film festival', 'cinema', 'documentary', 'screening'], category: 'art' },
  { keywords: ['run club', 'running club', 'yoga', 'fitness', 'workout', 'cycling', 'pilates', 'boxing', 'pickleball', 'hike', 'climb', 'crossfit', 'swim'], category: 'fitness' },
  { keywords: ['pop-up', 'popup', 'market', 'flea', 'bazaar', 'vendor', 'sample sale', 'swap', 'vintage', 'thrift', 'fashion show', 'streetwear', 'sneaker', 'drop'], category: 'popups' },
  { keywords: ['food', 'dinner', 'tasting', 'brunch', 'supper', 'chef', 'restaurant', 'culinary', 'pizza', 'dumpling', 'cocktail', 'wine', 'beer', 'spirits', 'bar crawl', 'eating'], category: 'food' },
  { keywords: ['club', 'nightlife', 'rave', 'dance', 'party', 'rooftop', 'lounge', 'after party', 'afrobeats', 'salsa', 'bachata', 'latin night'], category: 'nightlife' },
  { keywords: ['theater', 'theatre', 'musical', 'play', 'performance', 'opera', 'ballet', 'dance performance', 'spoken word', 'poetry'], category: 'theater' },
  { keywords: ['workshop', 'class', 'craft', 'ceramics', 'pottery', 'photography', 'drawing', 'painting', 'sewing', 'knitting', 'textile', 'skill', 'learn'], category: 'workshops' },
  { keywords: ['park', 'outdoor', 'garden', 'nature', 'trail', 'kayak', 'boat', 'beach', 'waterfront', 'picnic'], category: 'outdoors' },
];

function inferCategory(title: string): string {
  const lower = title.toLowerCase();
  for (const { keywords, category } of CATEGORY_KEYWORDS) {
    if (keywords.some(k => lower.includes(k))) return category;
  }
  return 'popups'; // default for community events
}

function inferBorough(geoInfo: any): string | undefined {
  const sub = geoInfo?.sublocality?.toLowerCase() ?? '';
  const city = geoInfo?.city?.toLowerCase() ?? '';
  const addr = geoInfo?.full_address?.toLowerCase() ?? '';

  if (sub.includes('brooklyn') || addr.includes('brooklyn')) return 'Brooklyn';
  if (sub.includes('queens') || city.includes('queens') || addr.includes('queens')) return 'Queens';
  if (sub.includes('bronx') || addr.includes('bronx')) return 'Bronx';
  if (sub.includes('staten island') || addr.includes('staten island')) return 'Staten Island';
  return 'Manhattan';
}

async function scrapePageEvents(
  url: string,
  defaultCategory?: string
): Promise<SiftEvent[]> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; SiftBot/1.0)',
      'Accept': 'text/html,application/xhtml+xml',
    },
  });
  if (!res.ok) return [];

  const html = await res.text();
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) return [];

  const nextData = JSON.parse(match[1]);
  const pageData = nextData?.props?.pageProps?.initialData?.data ?? {};

  const events: any[] = [
    ...(pageData.events ?? []),
    ...(pageData.featured_events ?? []),
    ...(pageData.featured_items ?? []),
  ];

  const results: SiftEvent[] = [];
  const seen = new Set<string>();

  for (const item of events) {
    const ev = item.event ?? item;
    const apiId = ev.api_id;
    if (!apiId || seen.has(apiId)) continue;
    seen.add(apiId);

    if (ev.location_type === 'online' || ev.location_type === 'virtual') continue;

    const geo = ev.geo_address_info;
    if (!geo?.full_address && !ev.coordinate) continue;

    const title = ev.name?.trim();
    if (!title) continue;

    const slug = ev.url;
    const eventUrl = slug ? `https://lu.ma/${slug}` : undefined;
    const category = defaultCategory ?? inferCategory(title);

    const normalized = normalizeEvent({
      source: 'luma',
      source_id: apiId,
      title,
      description: ev.description_short || ev.description || undefined,
      category,
      start_date: ev.start_at,
      end_date: ev.end_at ?? undefined,
      venue_name: geo?.description || geo?.address || undefined,
      address: geo?.full_address || geo?.short_address || undefined,
      neighborhood: geo?.sublocality || undefined,
      borough: inferBorough(geo),
      latitude: ev.coordinate?.latitude,
      longitude: ev.coordinate?.longitude,
      is_free: undefined,
      ticket_url: eventUrl,
      event_url: eventUrl,
      image_url: ev.cover_url || item.cover_image?.url || undefined,
      tags: ['luma'],
    });

    if (normalized) results.push(normalized);
  }

  return results;
}

export async function ingestLuma(): Promise<void> {
  console.log('[Luma] Starting ingest...');
  const allEvents: SiftEvent[] = [];
  const globalSeen = new Set<string>();

  const addEvents = (events: SiftEvent[]) => {
    for (const e of events) {
      if (!globalSeen.has(e.source_id)) {
        globalSeen.add(e.source_id);
        allEvents.push(e);
      }
    }
  };

  // 1. NYC city discover page
  try {
    const res = await fetch(LUMA_NYC_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SiftBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });

    if (!res.ok) {
      console.error(`[Luma] NYC page fetch failed: ${res.status}`);
    } else {
      const events = await scrapePageEvents(LUMA_NYC_URL);
      addEvents(events);
      console.log(`[Luma] NYC discover: ${events.length} events`);
    }
  } catch (e) {
    console.error('[Luma] NYC page error:', e);
  }

  // 2. Seed calendars (run clubs, art spaces, etc.)
  for (const cal of LUMA_SEED_CALENDARS) {
    try {
      const url = `https://lu.ma/${cal.slug}`;
      const events = await scrapePageEvents(url, cal.defaultCategory);
      addEvents(events);
      if (events.length > 0) {
        console.log(`[Luma] ${cal.name}: ${events.length} events`);
      }
    } catch (e) {
      console.error(`[Luma] ${cal.name} error:`, e);
    }
  }

  console.log(`[Luma] Fetched ${allEvents.length} events`);
  if (allEvents.length > 0) {
    const result = await upsertEvents(allEvents);
    console.log(`[Luma] Upserted: ${result.inserted}, Errors: ${result.errors}`);
  }
}

if (require.main === module) {
  ingestLuma().catch(console.error);
}

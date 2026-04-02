import { normalizeEvent } from './normalize';
import { upsertEvents } from './upsert';
import { SiftEvent } from './schema';

/**
 * Yelp Events API ingest — local events, food tastings, nightlife.
 * Auth: Bearer token from yelp.com/developers
 * Expected yield: 20-50 events
 */

const API_KEY = process.env.YELP_API_KEY;
const BASE_URL = 'https://api.yelp.com/v3/events';

const CATEGORY_MAP: Record<string, string> = {
  'food-and-drink': 'food',
  'nightlife': 'nightlife',
  'music': 'live_music',
  'performing-arts': 'theater',
  'visual-arts': 'art',
  'film': 'art',
  'fashion': 'popups',
  'sports-active-life': 'fitness',
  'kids-family': 'outdoors',
  'charities': 'workshops',
  'festivals-fairs': 'popups',
  'lectures-books': 'workshops',
  'other': 'popups',
};

export async function ingestYelp(): Promise<void> {
  if (!API_KEY) {
    console.warn('[Yelp] No YELP_API_KEY set, skipping');
    return;
  }

  console.log('[Yelp] Starting ingest...');
  const allEvents: SiftEvent[] = [];
  let offset = 0;
  const limit = 50;

  while (offset < 200) {
    try {
      const params = new URLSearchParams({
        location: 'New York, NY',
        limit: String(limit),
        offset: String(offset),
        sort_on: 'time_start',
        sort_by: 'asc',
        start_date: Math.floor(Date.now() / 1000).toString(),
      });

      const res = await fetch(`${BASE_URL}?${params}`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });

      if (!res.ok) {
        console.error(`[Yelp] HTTP ${res.status} at offset ${offset}`);
        break;
      }

      const json = await res.json();
      const events = json.events ?? [];

      if (events.length === 0) break;

      for (const ev of events) {
        const category = CATEGORY_MAP[ev.category] ?? 'popups';

        const normalized = normalizeEvent({
          source: 'yelp',
          source_id: ev.id,
          title: ev.name,
          description: ev.description,
          category,
          start_date: ev.time_start,
          end_date: ev.time_end || undefined,
          venue_name: ev.business_id ? ev.location?.display_address?.join(', ') : undefined,
          address: ev.location?.display_address?.join(', '),
          latitude: ev.latitude,
          longitude: ev.longitude,
          price_min: ev.cost ? parseCost(ev.cost) : 0,
          price_max: ev.cost_max ? parseCost(ev.cost_max) : undefined,
          is_free: ev.is_free ?? false,
          event_url: ev.event_site_url,
          ticket_url: ev.tickets_url || undefined,
          image_url: ev.image_url,
          tags: ev.category ? [ev.category] : [],
        });

        if (normalized) allEvents.push(normalized);
      }

      offset += limit;
      await new Promise((r) => setTimeout(r, 500));
    } catch (e) {
      console.error('[Yelp] Error:', e);
      break;
    }
  }

  console.log(`[Yelp] Fetched ${allEvents.length} events total`);
  const result = await upsertEvents(allEvents);
  console.log(`[Yelp] Upserted: ${result.inserted}, Errors: ${result.errors}`);
}

function parseCost(cost: any): number {
  if (typeof cost === 'number') return cost;
  if (typeof cost === 'string') {
    const num = parseFloat(cost.replace(/[^0-9.]/g, ''));
    return isNaN(num) ? 0 : num;
  }
  return 0;
}

if (require.main === module) {
  ingestYelp().catch(console.error);
}

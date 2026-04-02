import { normalizeEvent } from './normalize';
import { upsertEvents } from './upsert';
import { SiftEvent } from './schema';

/**
 * Meetup API ingest — workshops, run clubs, hobby groups, tech meetups.
 * Auth: OAuth2 bearer token from meetup.com/api
 * Expected yield: 50-100 events
 */

const API_KEY = process.env.MEETUP_API_KEY;
const BASE_URL = 'https://api.meetup.com/find/upcoming_events';

const TOPIC_CATEGORIES: { id: number; category: string }[] = [
  { id: 546, category: 'fitness' },     // Sports & Fitness
  { id: 292, category: 'workshops' },   // Tech
  { id: 522, category: 'outdoors' },    // Outdoors & Adventure
  { id: 388, category: 'food' },        // Food & Drink
  { id: 898, category: 'art' },         // Arts & Culture
  { id: 482, category: 'workshops' },   // Career & Business
];

export async function ingestMeetup(): Promise<void> {
  if (!API_KEY) {
    console.warn('[Meetup] No MEETUP_API_KEY set, skipping');
    return;
  }

  console.log('[Meetup] Starting ingest...');
  const allEvents: SiftEvent[] = [];

  for (const topic of TOPIC_CATEGORIES) {
    try {
      const params = new URLSearchParams({
        topic_category: String(topic.id),
        lon: '-73.9857',
        lat: '40.7484',
        radius: '10',
        page: '50',
        order: 'time',
      });

      const res = await fetch(`${BASE_URL}?${params}`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });

      if (!res.ok) {
        console.error(`[Meetup] HTTP ${res.status} for topic ${topic.id}`);
        continue;
      }

      const json = await res.json();
      const events = json.events ?? [];

      for (const ev of events) {
        const venue = ev.venue;
        const borough = inferBorough(venue?.city, venue?.address_1);

        const normalized = normalizeEvent({
          source: 'meetup',
          source_id: ev.id,
          title: ev.name,
          description: stripHtml(ev.description || ''),
          category: topic.category,
          start_date: new Date(ev.time).toISOString(),
          end_date: ev.duration
            ? new Date(ev.time + ev.duration).toISOString()
            : undefined,
          venue_name: venue?.name,
          address: venue?.address_1,
          borough,
          latitude: venue?.lat,
          longitude: venue?.lon,
          price_min: ev.fee?.amount ?? 0,
          price_max: ev.fee?.amount,
          is_free: !ev.fee || ev.fee.amount === 0,
          event_url: ev.link,
          image_url: ev.group?.key_photo?.highres_link || ev.group?.key_photo?.photo_link,
          tags: [ev.group?.name?.toLowerCase()].filter(Boolean),
        });

        if (normalized) allEvents.push(normalized);
      }

      console.log(`[Meetup] Topic ${topic.id} (${topic.category}): ${events.length} events`);
      await new Promise((r) => setTimeout(r, 300));
    } catch (e) {
      console.error(`[Meetup] Error for topic ${topic.id}:`, e);
    }
  }

  console.log(`[Meetup] Fetched ${allEvents.length} events total`);
  const result = await upsertEvents(allEvents);
  console.log(`[Meetup] Upserted: ${result.inserted}, Errors: ${result.errors}`);
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
}

function inferBorough(city?: string, address?: string): string | undefined {
  const text = `${city || ''} ${address || ''}`.toLowerCase();
  if (text.includes('brooklyn')) return 'Brooklyn';
  if (text.includes('queens')) return 'Queens';
  if (text.includes('bronx')) return 'Bronx';
  if (text.includes('staten island')) return 'Staten Island';
  if (text.includes('new york') || text.includes('manhattan')) return 'Manhattan';
  return undefined;
}

if (require.main === module) {
  ingestMeetup().catch(console.error);
}

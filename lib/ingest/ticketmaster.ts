import 'dotenv/config';
import { TICKETMASTER_CATEGORY_MAP } from './config';
import { normalizeEvent } from './normalize';
import { upsertEvents } from './upsert';
import { SiftEvent } from './schema';

const API_KEY = process.env.TICKETMASTER_API_KEY!;
const BASE_URL = 'https://app.ticketmaster.com/discovery/v2/events.json';

const SEGMENTS = ['Music', 'Arts & Theatre', 'Comedy', 'Miscellaneous'];

export async function ingestTicketmaster(): Promise<void> {
  console.log('[Ticketmaster] Starting ingest...');
  const allEvents: SiftEvent[] = [];

  for (const segment of SEGMENTS) {
    let page = 0;
    let totalPages = 1;

    while (page < totalPages && page < 5) {
      const params = new URLSearchParams({
        apikey: API_KEY,
        city: 'New York',
        stateCode: 'NY',
        size: '200',
        page: String(page),
        sort: 'date,asc',
        startDateTime: new Date().toISOString().split('.')[0] + 'Z',
        classificationName: segment,
      });

      const res = await fetch(`${BASE_URL}?${params}`);
      if (!res.ok) {
        console.error(`[Ticketmaster] HTTP ${res.status} for segment "${segment}" page ${page}`);
        break;
      }

      const json = await res.json();
      totalPages = json.page?.totalPages ?? 1;

      const events = json._embedded?.events ?? [];
      for (const ev of events) {
        const venueCity = ev._embedded?.venues?.[0]?.city?.name;
        if (venueCity && venueCity !== 'New York') continue;

        const venue = ev._embedded?.venues?.[0];
        const segmentName = ev.classifications?.[0]?.segment?.name;
        const category = TICKETMASTER_CATEGORY_MAP[segmentName] ?? 'popups';

        const normalized = normalizeEvent({
          source: 'ticketmaster',
          source_id: ev.id,
          title: ev.name,
          description: ev.info || ev.pleaseNote || undefined,
          category,
          start_date: ev.dates?.start?.dateTime || ev.dates?.start?.localDate,
          end_date: ev.dates?.end?.dateTime || ev.dates?.end?.localDate || undefined,
          venue_name: venue?.name,
          address: venue?.address?.line1,
          latitude: venue?.location ? parseFloat(venue.location.latitude) : undefined,
          longitude: venue?.location ? parseFloat(venue.location.longitude) : undefined,
          price_min: ev.priceRanges?.[0]?.min,
          price_max: ev.priceRanges?.[0]?.max,
          is_free: !ev.priceRanges || ev.priceRanges[0]?.min === 0,
          ticket_url: ev.url,
          event_url: ev.url,
          image_url: ev.images?.[0]?.url,
          on_sale_date: ev.sales?.public?.startDateTime,
        });

        if (normalized) allEvents.push(normalized);
      }

      page++;
      await new Promise(r => setTimeout(r, 250)); // 4 req/sec, well within 5/sec limit
    }

    console.log(`[Ticketmaster] Segment "${segment}" done. Running total: ${allEvents.length}`);
  }

  console.log(`[Ticketmaster] Fetched ${allEvents.length} events total`);
  const result = await upsertEvents(allEvents);
  console.log(`[Ticketmaster] Upserted: ${result.inserted}, Errors: ${result.errors}`);
}

async function main() {
  await ingestTicketmaster();
}

main().catch(console.error);

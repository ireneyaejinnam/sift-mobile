import 'dotenv/config';
import { EVENTBRITE_SEED_ORGS, EVENTBRITE_CATEGORY_MAP } from './config';
import { normalizeEvent } from './normalize';
import { upsertEvents } from './upsert';
import { SiftEvent } from './schema';

const TOKEN = process.env.EVENTBRITE_OAUTH_TOKEN!;
// NOTE: The correct endpoint is /organizers/ (not /organizations/).
// Only ?expand= and ?continuation= params are supported — status/page_size are rejected.
const BASE_URL = 'https://www.eventbriteapi.com/v3';

async function fetchOrgEvents(orgId: string, defaultCategory: string): Promise<SiftEvent[]> {
  const events: SiftEvent[] = [];
  let continuation: string | null = null;
  let hasMore = true;
  const now = new Date();

  while (hasMore) {
    const url = continuation
      ? `${BASE_URL}/organizers/${orgId}/events/?expand=venue,ticket_availability&continuation=${continuation}`
      : `${BASE_URL}/organizers/${orgId}/events/?expand=venue,ticket_availability`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });

    if (!res.ok) {
      console.error(`[Eventbrite] HTTP ${res.status} for org ${orgId}`);
      break;
    }

    const json = await res.json();

    if (json.error) {
      console.error(`[Eventbrite] API error for org ${orgId}: ${json.error_description}`);
      break;
    }

    const rawEvents: any[] = json.events ?? [];

    for (const ev of rawEvents) {
      // Skip past events
      const startUtc = ev.start?.utc;
      if (!startUtc || new Date(startUtc) < now) continue;

      // Determine category from Eventbrite category or org default
      const ebCategoryName = ev.category?.name;
      const category = (ebCategoryName && EVENTBRITE_CATEGORY_MAP[ebCategoryName]) || defaultCategory;

      const startDate = ev.start?.utc;
      const endDate = ev.end?.utc;

      // Build available_dates for multi-day events
      let availableDates: string[] | undefined;
      if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays > 1 && diffDays < 180) {
          availableDates = [];
          for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            availableDates.push(d.toISOString().split('T')[0]);
          }
        }
      }

      const priceMin = ev.ticket_availability?.minimum_ticket_price?.major_value
        ? parseFloat(ev.ticket_availability.minimum_ticket_price.major_value)
        : undefined;
      const priceMax = ev.ticket_availability?.maximum_ticket_price?.major_value
        ? parseFloat(ev.ticket_availability.maximum_ticket_price.major_value)
        : undefined;

      const normalized = normalizeEvent({
        source: 'eventbrite',
        source_id: ev.id,
        title: ev.name?.text,
        description: ev.description?.text?.slice(0, 1000),
        category,
        start_date: startDate,
        end_date: endDate,
        available_dates: availableDates,
        venue_name: ev.venue?.name,
        address: ev.venue?.address?.localized_address_display,
        latitude: ev.venue?.latitude ? parseFloat(ev.venue.latitude) : undefined,
        longitude: ev.venue?.longitude ? parseFloat(ev.venue.longitude) : undefined,
        price_min: priceMin ?? 0,
        price_max: priceMax,
        is_free: ev.is_free ?? (priceMin === 0 || priceMin == null),
        event_url: ev.url,
        ticket_url: ev.url,
        image_url: ev.logo?.url,
      });

      if (normalized) events.push(normalized);
    }

    continuation = json.pagination?.continuation ?? null;
    hasMore = json.pagination?.has_more_items ?? false;

    // Courtesy delay
    await new Promise(r => setTimeout(r, 300));
  }

  return events;
}

export async function ingestEventbrite(): Promise<void> {
  console.log('[Eventbrite] Starting ingest...');
  const allEvents: SiftEvent[] = [];

  for (const org of EVENTBRITE_SEED_ORGS) {
    process.stdout.write(`[Eventbrite] Fetching: ${org.name} (${org.id})...`);
    try {
      const events = await fetchOrgEvents(org.id, org.defaultCategory);
      allEvents.push(...events);
      console.log(` ${events.length} upcoming events`);
    } catch (e) {
      console.log(` ERROR: ${e}`);
    }
  }

  console.log(`[Eventbrite] Total fetched: ${allEvents.length}`);
  const result = await upsertEvents(allEvents);
  console.log(`[Eventbrite] Upserted: ${result.inserted}, Errors: ${result.errors}`);
}

async function main() {
  await ingestEventbrite();
}

main().catch(console.error);

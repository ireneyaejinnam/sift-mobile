import { normalizeEvent } from './normalize';
import { upsertEvents } from './upsert';
import { SiftEvent } from './schema';

const BASE = 'https://www.nycgovparks.org';

// Category keywords → Sift category
function inferCategory(title: string, description: string): string {
  const text = `${title} ${description}`.toLowerCase();
  if (/concert|music|jazz|perform|band|sing|choir|orchestra/.test(text)) return 'live_music';
  if (/yoga|fitness|workout|cardio|pilates|zumba|dance|exercise|run|aerobic/.test(text)) return 'fitness';
  if (/workshop|class|learn|craft|skill|sewing|knit|paint/.test(text)) return 'workshops';
  if (/art|exhibit|gallery|mural|draw/.test(text)) return 'art';
  if (/comedy|stand.?up|improv/.test(text)) return 'comedy';
  if (/hike|walk|nature|bird|trail|ecology|garden|tour/.test(text)) return 'outdoors';
  if (/food|cook|farm|market|harvest/.test(text)) return 'food';
  return 'outdoors'; // default for parks events
}

// Strip HTML tags from a string
function strip(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&ndash;/g, '–').trim();
}

function parseEvents(html: string): SiftEvent[] {
  const events: SiftEvent[] = [];

  // Split on each schema.org Event div
  const eventPattern = /<div[^>]*itemtype="http:\/\/schema\.org\/Event"[^>]*>([\s\S]*?)(?=<div[^>]*itemtype="http:\/\/schema\.org\/Event"|<\/div>\s*<\/div>\s*<h2|$)/g;
  let match: RegExpExecArray | null;

  while ((match = eventPattern.exec(html)) !== null) {
    const block = match[1];

    // Title + event URL
    const titleMatch = block.match(/itemprop="name"[^>]*><a href="([^"]+)">([^<]+)<\/a>/);
    if (!titleMatch) continue;
    const eventPath = titleMatch[1];
    const title = titleMatch[2].trim();

    // Venue name (room name inside location)
    const venueRoomMatch = block.match(/<span itemprop="name">([^<]+)<\/span>/);
    const venueRoom = venueRoomMatch ? venueRoomMatch[1].trim() : '';

    // Park name — appears as "(in Park Name)" text
    const parkMatch = block.match(/\(in ([^)]+)\)/);
    const parkName = parkMatch ? parkMatch[1].trim() : venueRoom;

    // Street address
    const streetMatch = block.match(/itemprop="streetAddress"\s+content="([^"]+)"/);
    const streetAddress = streetMatch ? streetMatch[1].trim() : '';

    // Borough
    const boroughMatch = block.match(/<span itemprop="addressLocality">([^<]+)<\/span>/);
    const borough = boroughMatch ? boroughMatch[1].trim() : undefined;

    // Dates
    const startMatch = block.match(/itemprop="startDate"\s+content="([^"]+)"/);
    const endMatch = block.match(/itemprop="endDate"\s+content="([^"]+)"/);
    if (!startMatch) continue;

    // Description
    const descMatch = block.match(/<span itemprop="description"[^>]*>([\s\S]*?)<\/span>/);
    const description = descMatch ? strip(descMatch[1]).slice(0, 1000) : '';

    const category = inferCategory(title, description);
    const venueName = parkName || venueRoom;

    // source_id from event URL slug
    const sourceId = eventPath.replace('/events/', '').replace(/\//g, '-');

    const normalized = normalizeEvent({
      source: 'nyc_parks',
      source_id: sourceId,
      title,
      description,
      category,
      start_date: startMatch[1],
      end_date: endMatch ? endMatch[1] : undefined,
      venue_name: venueName,
      address: streetAddress || undefined,
      borough: borough as any,
      is_free: true,
      price_min: 0,
      price_max: 0,
      event_url: `${BASE}${eventPath}`,
      ticket_url: `${BASE}${eventPath}`,
      tags: ['nyc-parks', 'free'],
    });

    if (normalized) events.push(normalized);
  }

  return events;
}

export async function ingestNYCParks(): Promise<void> {
  console.log('[NYC Parks] Starting ingest...');
  const allEvents: SiftEvent[] = [];
  const seenIds = new Set<string>();

  // Fetch main page + a few category pages to maximize yield
  const pages = [
    '/events',
    '/events/fitness',
    '/events/arts',
    '/events/recreation',
  ];

  for (const path of pages) {
    const url = `${BASE}${path}`;
    console.log(`[NYC Parks] Fetching ${url}...`);

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });

    if (!res.ok) {
      console.error(`[NYC Parks] HTTP ${res.status} for ${url}`);
      continue;
    }

    const html = await res.text();
    const events = parseEvents(html);

    for (const ev of events) {
      if (!seenIds.has(ev.source_id)) {
        seenIds.add(ev.source_id);
        allEvents.push(ev);
      }
    }

    console.log(`[NYC Parks]   → ${events.length} events (${allEvents.length} total unique)`);
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`[NYC Parks] Total unique events: ${allEvents.length}`);
  const result = await upsertEvents(allEvents);
  console.log(`[NYC Parks] Upserted: ${result.inserted}, Errors: ${result.errors}`);
}

async function main() {
  await ingestNYCParks();
}

main().catch(console.error);

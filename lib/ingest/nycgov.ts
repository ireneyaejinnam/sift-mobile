import { normalizeEvent } from './normalize';
import { upsertEvents } from './upsert';
import { SiftEvent } from './schema';

/**
 * NYC.gov events scraper — city-sponsored events, free public programming.
 * Scrapes the public events page and JSON-LD data.
 * Expected yield: 20-40 events
 */

const EVENTS_URL = 'https://www.nyc.gov/events/';
const API_URL = 'https://a]002-sbaapp.nyc.gov/s/api/events';

const CATEGORY_MAP: Record<string, string> = {
  'arts-culture': 'art',
  'parks-recreation': 'outdoors',
  'education': 'workshops',
  'health-wellness': 'fitness',
  'community': 'workshops',
  'music': 'live_music',
  'food': 'food',
  'sports': 'fitness',
};

export async function ingestNYCGov(): Promise<void> {
  console.log('[NYC.gov] Starting ingest...');
  const allEvents: SiftEvent[] = [];

  // Try the NYC Open Data Events API
  try {
    const res = await fetch(
      'https://data.cityofnewyork.us/resource/tvpp-9vvx.json?$limit=100&$order=start_date_time ASC&$where=start_date_time > \'' +
        new Date().toISOString() +
        "'",
      { headers: { Accept: 'application/json' } }
    );

    if (res.ok) {
      const events = await res.json();

      for (const ev of events) {
        const category = guessCategory(ev.event_type || ev.category || '', ev.event_name || '');

        const normalized = normalizeEvent({
          source: 'nycgov',
          source_id: ev.event_id || `nycgov-${ev.event_name?.replace(/\s+/g, '-').toLowerCase().slice(0, 50)}`,
          title: ev.event_name || ev.title,
          description: ev.description || ev.event_description,
          category,
          start_date: ev.start_date_time || ev.start_date,
          end_date: ev.end_date_time || ev.end_date || undefined,
          venue_name: ev.event_location || ev.location,
          address: ev.event_address || ev.address,
          borough: ev.event_borough || inferBorough(ev.event_address || ev.address || ''),
          latitude: ev.latitude ? parseFloat(ev.latitude) : undefined,
          longitude: ev.longitude ? parseFloat(ev.longitude) : undefined,
          price_min: 0,
          is_free: true,
          event_url: ev.event_url || ev.url || EVENTS_URL,
          tags: ['free', 'nyc', 'city-sponsored'],
        });

        if (normalized) allEvents.push(normalized);
      }

      console.log(`[NYC.gov] Open Data API: ${events.length} events`);
    } else {
      console.warn(`[NYC.gov] Open Data API returned ${res.status}, trying HTML...`);
    }
  } catch (e) {
    console.error('[NYC.gov] Open Data API error:', e);
  }

  // If we got few results, also try HTML scraping
  if (allEvents.length < 10) {
    await scrapeNYCGovHtml(allEvents);
  }

  console.log(`[NYC.gov] Fetched ${allEvents.length} events total`);
  if (allEvents.length > 0) {
    const result = await upsertEvents(allEvents);
    console.log(`[NYC.gov] Upserted: ${result.inserted}, Errors: ${result.errors}`);
  }
}

async function scrapeNYCGovHtml(allEvents: SiftEvent[]): Promise<void> {
  try {
    const res = await fetch(EVENTS_URL, {
      headers: {
        'User-Agent': 'Sift/1.0 (event discovery)',
        Accept: 'text/html',
      },
    });

    if (!res.ok) {
      console.error(`[NYC.gov] HTML scrape failed: ${res.status}`);
      return;
    }

    const html = await res.text();

    // Extract JSON-LD structured data
    const ldBlocks = html.match(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g
    );
    if (ldBlocks) {
      for (const block of ldBlocks) {
        try {
          const jsonStr = block.replace(/<\/?script[^>]*>/g, '');
          const data = JSON.parse(jsonStr);
          const items = Array.isArray(data) ? data : [data];

          for (const item of items) {
            if (item['@type'] === 'Event') {
              const normalized = normalizeEvent({
                source: 'nycgov',
                source_id: `nycgov-html-${item.name?.replace(/\s+/g, '-').toLowerCase().slice(0, 50)}`,
                title: item.name,
                description: item.description,
                category: guessCategory('', item.name || ''),
                start_date: item.startDate,
                end_date: item.endDate,
                venue_name: item.location?.name,
                address: item.location?.address?.streetAddress,
                borough: inferBorough(item.location?.address?.addressLocality || ''),
                price_min: 0,
                is_free: true,
                event_url: item.url || EVENTS_URL,
                image_url: typeof item.image === 'string' ? item.image : item.image?.[0],
                tags: ['free', 'nyc'],
              });
              if (normalized) allEvents.push(normalized);
            }
          }
        } catch {
          // skip malformed
        }
      }
    }

    console.log(`[NYC.gov] HTML scrape found ${allEvents.length} additional events`);
  } catch (e) {
    console.error('[NYC.gov] HTML scrape error:', e);
  }
}

function guessCategory(type: string, title: string): string {
  const text = `${type} ${title}`.toLowerCase();
  if (text.includes('music') || text.includes('concert')) return 'live_music';
  if (text.includes('art') || text.includes('exhibit') || text.includes('gallery')) return 'art';
  if (text.includes('park') || text.includes('garden') || text.includes('outdoor') || text.includes('walk') || text.includes('hike')) return 'outdoors';
  if (text.includes('workshop') || text.includes('class') || text.includes('learn')) return 'workshops';
  if (text.includes('fitness') || text.includes('yoga') || text.includes('run')) return 'fitness';
  if (text.includes('food') || text.includes('cook') || text.includes('taste')) return 'food';
  if (text.includes('comedy') || text.includes('laugh')) return 'comedy';
  if (text.includes('theater') || text.includes('theatre') || text.includes('play') || text.includes('dance')) return 'theater';
  return 'outdoors'; // most NYC gov events are outdoor/community
}

function inferBorough(address: string): string | undefined {
  const lower = address.toLowerCase();
  if (lower.includes('brooklyn')) return 'Brooklyn';
  if (lower.includes('queens')) return 'Queens';
  if (lower.includes('bronx')) return 'Bronx';
  if (lower.includes('staten island')) return 'Staten Island';
  if (lower.includes('manhattan') || lower.includes('new york')) return 'Manhattan';
  return undefined;
}

if (require.main === module) {
  ingestNYCGov().catch(console.error);
}

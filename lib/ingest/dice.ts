import { normalizeEvent } from './normalize';
import { upsertEvents } from './upsert';
import { SiftEvent } from './schema';

/**
 * Dice.fm scraper — concerts, comedy, club nights in NYC.
 * Scrapes the public browse page (no API key needed).
 * Expected yield: 20-40 events
 */

const BROWSE_URL = 'https://dice.fm/browse/new-york';
const API_BASE = 'https://api.dice.fm/v1';

const CATEGORY_MAP: Record<string, string> = {
  'club': 'nightlife',
  'club-night': 'nightlife',
  'concert': 'live_music',
  'live-music': 'live_music',
  'comedy': 'comedy',
  'festival': 'live_music',
  'workshop': 'workshops',
  'exhibition': 'art',
  'theatre': 'theater',
  'other': 'popups',
};

export async function ingestDice(): Promise<void> {
  console.log('[Dice] Starting ingest...');
  const allEvents: SiftEvent[] = [];

  try {
    // Dice has a public GraphQL-like endpoint for browse pages
    const res = await fetch(
      `https://api.dice.fm/v1/events?filter[venues][]=new-york&page[size]=50&filter[date][gte]=${new Date().toISOString().split('T')[0]}`,
      {
        headers: {
          Accept: 'application/json',
          'x-dice-version': '84',
        },
      }
    );

    if (!res.ok) {
      // Fallback: try scraping the HTML page
      console.warn(`[Dice] API returned ${res.status}, trying HTML scrape...`);
      await scrapeDiceHtml(allEvents);
    } else {
      const json = await res.json();
      const events = json.data ?? [];

      for (const ev of events) {
        const attrs = ev.attributes || ev;
        const genre = attrs.genre?.toLowerCase() || '';
        const category = CATEGORY_MAP[genre] || 'live_music';

        const normalized = normalizeEvent({
          source: 'dice',
          source_id: String(ev.id || attrs.slug),
          title: attrs.name || attrs.title,
          description: attrs.description || attrs.about,
          category,
          start_date: attrs.date || attrs.starts_at,
          end_date: attrs.ends_at || undefined,
          venue_name: attrs.venue?.name,
          address: attrs.venue?.address,
          borough: inferBorough(attrs.venue?.address),
          latitude: attrs.venue?.latitude,
          longitude: attrs.venue?.longitude,
          price_min: attrs.price ? attrs.price / 100 : undefined, // Dice prices in cents
          price_max: attrs.max_price ? attrs.max_price / 100 : undefined,
          is_free: attrs.price === 0,
          ticket_url: attrs.url || `https://dice.fm/event/${attrs.slug}`,
          event_url: attrs.url || `https://dice.fm/event/${attrs.slug}`,
          image_url: attrs.image_url || attrs.cover_image?.url,
          tags: [genre].filter(Boolean),
        });

        if (normalized) allEvents.push(normalized);
      }
    }
  } catch (e) {
    console.error('[Dice] Error:', e);
  }

  console.log(`[Dice] Fetched ${allEvents.length} events total`);
  if (allEvents.length > 0) {
    const result = await upsertEvents(allEvents);
    console.log(`[Dice] Upserted: ${result.inserted}, Errors: ${result.errors}`);
  }
}

async function scrapeDiceHtml(allEvents: SiftEvent[]): Promise<void> {
  try {
    const res = await fetch(BROWSE_URL, {
      headers: { 'User-Agent': 'Sift/1.0 (event discovery)' },
    });
    if (!res.ok) {
      console.error(`[Dice] HTML scrape failed: ${res.status}`);
      return;
    }

    const html = await res.text();

    // Extract JSON-LD structured data if available
    const ldMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g);
    if (ldMatch) {
      for (const block of ldMatch) {
        try {
          const jsonStr = block.replace(/<\/?script[^>]*>/g, '');
          const data = JSON.parse(jsonStr);
          if (data['@type'] === 'Event' || data['@type'] === 'MusicEvent') {
            const normalized = normalizeEvent({
              source: 'dice',
              source_id: `dice-${data.name?.replace(/\s+/g, '-').toLowerCase().slice(0, 50)}`,
              title: data.name,
              description: data.description,
              category: 'live_music',
              start_date: data.startDate,
              end_date: data.endDate,
              venue_name: data.location?.name,
              address: data.location?.address?.streetAddress,
              borough: inferBorough(data.location?.address?.addressLocality),
              price_min: data.offers?.price ? parseFloat(data.offers.price) : undefined,
              is_free: data.isAccessibleForFree === true,
              ticket_url: data.offers?.url || data.url,
              event_url: data.url,
              image_url: typeof data.image === 'string' ? data.image : data.image?.[0],
              tags: ['dice'],
            });
            if (normalized) allEvents.push(normalized);
          }
        } catch {
          // skip malformed JSON-LD blocks
        }
      }
    }
  } catch (e) {
    console.error('[Dice] HTML scrape error:', e);
  }
}

function inferBorough(addr?: string): string | undefined {
  if (!addr) return undefined;
  const lower = addr.toLowerCase();
  if (lower.includes('brooklyn')) return 'Brooklyn';
  if (lower.includes('queens')) return 'Queens';
  if (lower.includes('bronx')) return 'Bronx';
  if (lower.includes('staten island')) return 'Staten Island';
  return 'Manhattan';
}

if (require.main === module) {
  ingestDice().catch(console.error);
}

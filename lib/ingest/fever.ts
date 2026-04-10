import { normalizeEvent } from './normalize';
import { upsertEvents } from './upsert';
import { SiftEvent } from './schema';

/**
 * Fever (feverup.com) ingester — immersive experiences, candlelight concerts,
 * pop-ups, rooftop events, art, nightlife.
 *
 * Strategy:
 *   1. Fetch curated NYC category pages → extract event URLs from JSON-LD ItemList
 *   2. Fetch each event page → extract Event JSON-LD (name, date, location, price)
 *   3. Normalize + upsert
 *
 * No API key needed — all public pages with structured data.
 * Expected yield: 40–80 events per run across all categories.
 */

const BASE = 'https://feverup.com';

// NYC categories to scrape — curated for Gen Z/Millennial local audience
const FEVER_NYC_CATEGORIES: { slug: string; category: string }[] = [
  { slug: 'candlelight',            category: 'live_music'  },
  { slug: 'immersive-experiences',  category: 'art'         },
  { slug: 'fever-originals',        category: 'popups'      },
  { slug: 'culture-art-fashion',    category: 'art'         },
  { slug: 'exhibitions',            category: 'art'         },
  { slug: 'music-events',           category: 'live_music'  },
  { slug: 'concerts-festivals',     category: 'live_music'  },
  { slug: 'nightlife-clubs',        category: 'nightlife'   },
  { slug: 'terraces-and-rooftops',  category: 'nightlife'   },
  { slug: 'stand-up',               category: 'comedy'      },
  { slug: 'drag-shows',             category: 'nightlife'   },
  { slug: 'food',                   category: 'food'        },
  { slug: 'tasting',                category: 'food'        },
  { slug: 'diy-workshops',          category: 'workshops'   },
  { slug: 'sports',                 category: 'fitness'     },
];

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; SiftBot/1.0)',
  'Accept': 'text/html,application/xhtml+xml',
};

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchEventUrls(categorySlug: string): Promise<string[]> {
  const url = `${BASE}/en/new-york/${categorySlug}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) return [];

  const html = await res.text();
  const ldBlocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];

  const urls: string[] = [];
  for (const [, raw] of ldBlocks) {
    try {
      const data = JSON.parse(raw.trim());
      if (data['@type'] === 'ItemList' && Array.isArray(data.itemListElement)) {
        for (const item of data.itemListElement) {
          if (item.url) urls.push(item.url);
        }
      }
    } catch {
      // skip malformed
    }
  }

  return urls;
}

async function fetchEventData(eventUrl: string, defaultCategory: string): Promise<SiftEvent | null> {
  const res = await fetch(eventUrl, { headers: HEADERS });
  if (!res.ok) return null;

  const html = await res.text();
  const ldBlocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];

  for (const [, raw] of ldBlocks) {
    try {
      const data = JSON.parse(raw.trim());
      if (!['Event', 'MusicEvent', 'TheaterEvent', 'ExhibitionEvent', 'ScreeningEvent'].includes(data['@type'])) continue;
      if (data.eventStatus === 'EventCancelled' || data.eventStatus === 'EventPostponed') continue;

      const location = data.location ?? {};
      const address = location.address;
      const geo = location.geo;

      const offers = Array.isArray(data.offers) ? data.offers : data.offers ? [data.offers] : [];
      const prices = offers.map((o: any) => parseFloat(o.price)).filter((p: number) => !isNaN(p));
      const priceMin = prices.length ? Math.min(...prices) : undefined;
      const priceMax = prices.length ? Math.max(...prices) : undefined;

      const sourceId = eventUrl.match(/\/m\/(\d+)/)?.[1];
      if (!sourceId || !data.name || !data.startDate) return null;

      return normalizeEvent({
        source: 'fever',
        source_id: `fever-${sourceId}`,
        title: data.name.trim(),
        description: data.description?.replace(/[\r\n\t ]+/g, ' ').trim().slice(0, 1000),
        category: defaultCategory,
        start_date: data.startDate,
        end_date: data.endDate ?? undefined,
        venue_name: location.name ?? undefined,
        address: typeof address === 'string'
          ? address
          : address?.streetAddress
            ? `${address.streetAddress}, ${address.addressLocality ?? 'New York'}`
            : address?.addressLocality ?? undefined,
        neighborhood: undefined,
        borough: inferBorough(location.name, typeof address === 'string' ? address : address?.streetAddress),
        latitude: geo?.latitude ? parseFloat(geo.latitude) : undefined,
        longitude: geo?.longitude ? parseFloat(geo.longitude) : undefined,
        price_min: priceMin,
        price_max: priceMax,
        is_free: priceMin === 0,
        ticket_url: eventUrl,
        event_url: eventUrl,
        image_url: typeof data.image === 'string' ? data.image : Array.isArray(data.image) ? data.image[0] : undefined,
        tags: ['fever'],
      });
    } catch {
      // skip malformed
    }
  }

  return null;
}

function inferBorough(venueName?: string, address?: string): string | undefined {
  const text = `${venueName ?? ''} ${address ?? ''}`.toLowerCase();
  if (text.includes('brooklyn')) return 'Brooklyn';
  if (text.includes('queens')) return 'Queens';
  if (text.includes('bronx')) return 'Bronx';
  if (text.includes('staten island')) return 'Staten Island';
  return 'Manhattan';
}

export async function ingestFever(): Promise<void> {
  console.log('[Fever] Starting ingest...');

  // Collect unique event URLs across all categories
  const urlToCategory = new Map<string, string>();

  for (const { slug, category } of FEVER_NYC_CATEGORIES) {
    try {
      const urls = await fetchEventUrls(slug);
      for (const url of urls) {
        if (!urlToCategory.has(url)) urlToCategory.set(url, category);
      }
      console.log(`[Fever] ${slug}: ${urls.length} event URLs`);
    } catch (e) {
      console.error(`[Fever] Failed to fetch category ${slug}:`, e);
    }
    await sleep(500);
  }

  console.log(`[Fever] ${urlToCategory.size} unique events to fetch`);

  const allEvents: SiftEvent[] = [];
  let i = 0;
  for (const [url, category] of urlToCategory) {
    try {
      const event = await fetchEventData(url, category);
      if (event) allEvents.push(event);
    } catch (e) {
      console.error(`[Fever] Failed to fetch ${url}:`, e);
    }
    i++;
    await sleep(300); // be polite to their servers
    if (i % 20 === 0) console.log(`[Fever] Fetched ${i}/${urlToCategory.size}...`);
  }

  console.log(`[Fever] Fetched ${allEvents.length} valid events`);
  if (allEvents.length > 0) {
    const result = await upsertEvents(allEvents);
    console.log(`[Fever] Upserted: ${result.inserted}, Errors: ${result.errors}`);
  }
}

if (require.main === module) {
  ingestFever().catch(console.error);
}

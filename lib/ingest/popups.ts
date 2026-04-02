import 'dotenv/config';
import { normalizeEvent } from './normalize';
import { upsertEvents } from './upsert';
import { SiftEvent } from './schema';
import { geocodeAddress } from './geocode';

const CHICMI_FEED = 'https://www.chicmi.com/new-york/feed/';
const CHICMI_BASE = 'https://www.chicmi.com';

const SKIP_CATEGORIES = new Set(['Online Sample Sale', 'Online Events']);

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

interface FeedItem {
  title: string;
  link: string;
  category: string;
  pubDate: string;
  description: string;
  isEnded: boolean;
  address: string;
}

function parseFeed(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  const rawItems = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];

  for (const raw of rawItems) {
    const title = raw.match(/<title>(.*?)<\/title>/)?.[1];
    const link = raw.match(/<link>(.*?)<\/link>/)?.[1] ??
                 raw.match(/<guid>(.*?)<\/guid>/)?.[1];
    const category = raw.match(/<category>(.*?)<\/category>/)?.[1] ?? '';
    const pubDate = raw.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] ?? '';
    const descRaw = raw.match(/<description>([\s\S]*?)<\/description>/)?.[1] ?? '';
    const desc = stripHtml(descRaw);

    if (!title || !link) continue;

    // Skip online events
    if (SKIP_CATEGORIES.has(category)) continue;

    // Parse description fields
    const whenMatch = desc.match(/When:\s*([^\n]+)/i);
    const whereMatch = desc.match(/Where:\s*([^\n]+)/i);
    const whenText = whenMatch ? whenMatch[1].trim() : '';
    const address = whereMatch ? whereMatch[1].trim() : '';

    // Skip ended events
    const isEnded = /ended/i.test(whenText);

    items.push({
      title: stripHtml(title),
      link,
      category,
      pubDate,
      description: desc,
      isEnded,
      address,
    });
  }

  return items;
}

async function fetchEventDetails(url: string): Promise<{
  startDate?: string;
  endDate?: string;
  description?: string;
  imageUrl?: string;
} | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Extract JSON-LD schema.org/Event
    const jsonldMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    if (!jsonldMatch) return null;
    const data = JSON.parse(jsonldMatch[1]);
    if (data['@type'] !== 'Event') return null;

    // Image: prefer og:image
    const ogImg = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];

    return {
      startDate: data.startDate,
      endDate: data.endDate,
      description: data.description?.slice(0, 1000),
      imageUrl: ogImg ?? data.image,
    };
  } catch {
    return null;
  }
}

export async function ingestPopups(): Promise<void> {
  console.log('[Popups] Starting Chicmi ingest...');

  // 1. Fetch RSS feed
  const feedRes = await fetch(CHICMI_FEED, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  if (!feedRes.ok) throw new Error(`Feed HTTP ${feedRes.status}`);
  const feedXml = await feedRes.text();

  const feedItems = parseFeed(feedXml);
  const liveItems = feedItems.filter(i => !i.isEnded);
  console.log(`[Popups] Feed: ${feedItems.length} items, ${liveItems.length} live`);

  // 2. Fetch each event page for precise dates (cap at 40)
  const allEvents: SiftEvent[] = [];
  const toFetch = liveItems.slice(0, 40);

  for (let i = 0; i < toFetch.length; i++) {
    const item = toFetch[i];
    process.stdout.write(`[Popups] (${i + 1}/${toFetch.length}) ${item.title.slice(0, 40)}...`);

    const details = await fetchEventDetails(item.link);
    if (!details?.startDate) {
      console.log(' skip (no dates)');
      continue;
    }

    // Skip if event has already ended
    if (details.endDate && new Date(details.endDate) < new Date()) {
      console.log(' skip (past)');
      continue;
    }

    // Geocode address to get borough/coords
    let latitude: number | undefined;
    let longitude: number | undefined;
    let borough: string | undefined;

    if (item.address && !item.address.toLowerCase().includes('online')) {
      const geo = await geocodeAddress(`${item.address}, New York, NY`);
      if (geo) {
        latitude = geo.lat;
        longitude = geo.lng;
      }
    }

    // Extract borough from address string as fallback
    if (!borough && item.address) {
      const a = item.address.toLowerCase();
      if (/brooklyn/.test(a)) borough = 'Brooklyn';
      else if (/queens|astoria|flushing/.test(a)) borough = 'Queens';
      else if (/bronx/.test(a)) borough = 'Bronx';
      else if (/staten island/.test(a)) borough = 'Staten Island';
      else borough = 'Manhattan'; // default — most Chicmi sales are in Manhattan
    }

    // slug from URL
    const slug = item.link.replace(/https?:\/\/[^/]+/, '').replace(/\//g, '-').replace(/^-|-$/g, '');

    const normalized = normalizeEvent({
      source: 'chicmi',
      source_id: slug,
      title: item.title,
      description: details.description ?? item.description.slice(0, 1000),
      category: 'popups',
      start_date: details.startDate,
      end_date: details.endDate,
      address: item.address || undefined,
      borough: borough as any,
      latitude,
      longitude,
      price_min: 0,
      price_max: undefined,
      is_free: true,
      event_url: item.link,
      ticket_url: item.link,
      image_url: details.imageUrl,
      tags: ['sample-sale', 'popup', item.category.toLowerCase().replace(/\s+/g, '-')],
    });

    if (normalized) {
      allEvents.push(normalized);
      console.log(' ok');
    } else {
      console.log(' skip (normalize failed)');
    }

    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`[Popups] Total: ${allEvents.length} events`);
  const result = await upsertEvents(allEvents);
  console.log(`[Popups] Upserted: ${result.inserted}, Errors: ${result.errors}`);
}

async function main() {
  await ingestPopups();
}

main().catch(console.error);

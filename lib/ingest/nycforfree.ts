import { normalizeEvent } from './normalize';
import { upsertEvents } from './upsert';
import { SiftEvent } from './schema';

const BASE_URL = 'https://www.nycforfree.co';

function stripHtml(html: string): string {
  return html
    // Remove entire <style>, <script>, <noscript> blocks (content would otherwise bleed through)
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const CATEGORY_PATTERNS: [string, RegExp][] = [
  ['live_music',  /\b(music hall|music|concert|jazz|band|perform|sing|choir|dj|live music|festival|symphony|orchestra)\b/],
  ['comedy',      /\b(comedy|stand.?up|improv|funny|laugh|comedian)\b/],
  ['art',         /\b(art|exhibit|exhibition|gallery|museum|paint|photo|sculpt|install|mural|biennial)\b/],
  ['food',        /\b(food|eat|drink|tasting|culinary|wine|beer|cocktail|chef|restaurant|market|café|cafe)\b/],
  ['fitness',     /\b(fitness|run|yoga|workout|exercise|hike|zumba|pilates|bootcamp|training)\b/],
  ['outdoors',    /\b(outdoor|park|garden|nature|walk|walking tour|boat|kayak|bike|cycling)\b/],
  ['theater',     /\b(theater|theatre|dance|opera|film|movie|screening|ballet|circus|broadway)\b/],
  ['workshops',   /\b(workshop|class|learn|lecture|talk|seminar|course|skill|craft|make|create)\b/],
  ['nightlife',   /\b(nightlife|bar|club|party|social|mixer|happy hour)\b/],
];

/** Returns [primaryCategory, ...secondaryCategories] for an event. */
function inferCategories(title: string, body: string): string[] {
  const text = (title + ' ' + body).toLowerCase();
  const matched = CATEGORY_PATTERNS.filter(([, re]) => re.test(text)).map(([cat]) => cat);
  return matched.length ? matched : ['popups'];
}

// Extract the first external event link from Squarespace body HTML.
// Handles urldefense.com-wrapped URLs (ProofPoint email rewriter).
function extractExternalLink(html: string): string | undefined {
  const SKIP = [
    'nycforfree.co',
    'squarespace.com',
    'facebook.com/sharer',
    'twitter.com/intent',
    'linkedin.com/share',
    'mailto:',
  ];

  const hrefs = [...html.matchAll(/href="(https?:\/\/[^"]+)"/gi)].map(m => m[1]);

  for (const href of hrefs) {
    let url = href;

    // Decode urldefense.com v3 wrapper: __<actual_url>__;!!token$
    if (url.includes('urldefense.com')) {
      const m = url.match(/urldefense\.com\/v3\/__(.+?)__;!!/);
      if (!m) continue;
      // urldefense strips one slash from https:// → restore it
      url = m[1].replace(/^(https?):\/([^/])/, '$1://$2');
    }

    if (SKIP.some(s => url.includes(s))) continue;
    return url;
  }
  return undefined;
}

// Prefer high-res squarespace-cdn.com image from body HTML over bare assetUrl.
function extractBodyImage(html: string): string | undefined {
  const m = html.match(/src="(https:\/\/images\.squarespace-cdn\.com\/[^"]+)"/);
  return m ? m[1] : undefined;
}

function extractBoroughFromAddress(addr: string): string {
  const a = addr.toLowerCase();
  if (/brooklyn/.test(a)) return 'Brooklyn';
  if (/queens|flushing|astoria|jamaica/.test(a)) return 'Queens';
  if (/bronx/.test(a)) return 'Bronx';
  if (/staten island/.test(a)) return 'Staten Island';
  return 'Manhattan';
}

interface SquarespaceEvent {
  id: string;
  urlId: string;
  title: string;
  startDate: number;
  endDate: number;
  body: string;
  assetUrl?: string;
  location?: {
    addressLine1?: string;
    addressLine2?: string;
    markerLat?: number;
    markerLng?: number;
  };
}

async function fetchPage(url: string): Promise<{ upcoming: SquarespaceEvent[]; pagination: any }> {
  const sep = url.includes('?') ? '&' : '?';
  const res = await fetch(`${url}${sep}format=json`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return { upcoming: data.upcoming ?? [], pagination: data.pagination };
}

export async function ingestNYCForFree(): Promise<void> {
  console.log('[NYCForFree] Starting ingest...');
  const now = Date.now();
  const seen = new Set<string>();
  const allItems: SquarespaceEvent[] = [];

  // Fetch up to 3 pages — upcoming events are all on page 1, but paginate to catch any that span pages
  let nextUrl: string | null = `${BASE_URL}/events`;
  let page = 0;

  while (nextUrl && page < 3) {
    const { upcoming, pagination } = await fetchPage(nextUrl);
    for (const item of upcoming) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        allItems.push(item);
      }
    }
    nextUrl = pagination?.nextPage ? `${BASE_URL}${pagination.nextPageUrl}` : null;
    page++;
    if (nextUrl) await new Promise(r => setTimeout(r, 500)); // be polite
  }

  console.log(`[NYCForFree] Found ${allItems.length} upcoming events`);

  const events: SiftEvent[] = [];
  for (const item of allItems) {
    // Skip if endDate is in the past
    if (item.endDate && item.endDate < now) continue;

    const title = stripHtml(item.title ?? '').trim();
    if (!title) continue;

    const description = stripHtml(item.body ?? '').slice(0, 500);
    const [category, ...secondaryCategories] = inferCategories(title, description);

    const start = new Date(item.startDate).toISOString().split('T')[0];
    const end = item.endDate ? new Date(item.endDate).toISOString().split('T')[0] : undefined;

    const address = [item.location?.addressLine1, item.location?.addressLine2]
      .filter(Boolean).join(', ');
    const borough = address ? extractBoroughFromAddress(address) : 'Manhattan';
    const lat = item.location?.markerLat;
    const lng = item.location?.markerLng;

    const nycforfreeUrl = `${BASE_URL}/events/${item.urlId}`;
    const externalLink = extractExternalLink(item.body ?? '');
    const eventUrl = externalLink ?? nycforfreeUrl;

    // Prefer high-res body image; fall back to assetUrl thumbnail
    const imageUrl =
      extractBodyImage(item.body ?? '') ??
      (item.assetUrl && item.assetUrl.startsWith('http') ? item.assetUrl : undefined);

    const normalized = normalizeEvent({
      source: 'nycforfree',
      source_id: item.id,
      title,
      category: category as any,
      description,
      start_date: start,
      end_date: end,
      venue_name: item.location?.addressLine1 || 'NYC',
      address: address || 'New York, NY',
      borough: borough as any,
      latitude: lat,
      longitude: lng,
      is_free: true,
      price_min: 0,
      price_max: 0,
      event_url: eventUrl,
      ticket_url: eventUrl,
      image_url: imageUrl,
      tags: ['free', 'nyc', category, ...secondaryCategories],
    });

    if (normalized) events.push(normalized);
  }

  console.log(`[NYCForFree] Normalized: ${events.length} events`);
  const result = await upsertEvents(events);
  console.log(`[NYCForFree] Upserted: ${result.inserted}, Errors: ${result.errors}`);
}

import { fileURLToPath } from 'url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  ingestNYCForFree().catch(console.error);
}

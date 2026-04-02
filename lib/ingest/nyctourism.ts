import 'dotenv/config';
import { normalizeEvent } from './normalize';
import { upsertEvents } from './upsert';
import { SiftEvent } from './schema';

const BASE_URL  = 'https://www.nyctourism.com';
const SITEMAP   = `${BASE_URL}/server-sitemap.xml`;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

// ── Helpers ────────────────────────────────────────────────────────────────

async function get(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.text();
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ── Category inference ─────────────────────────────────────────────────────

const CATEGORY_PATTERNS: [string, RegExp][] = [
  ['live_music',  /\b(music|concert|jazz|band|perform|sing|dj|festival|symphony|orchestra|opera|philharmonic)\b/],
  ['comedy',      /\b(comedy|stand.?up|improv|funny|laugh|comedian|humor)\b/],
  ['art',         /\b(art|exhibit|gallery|museum|paint|photo|sculpt|mural|design|fashion|film festival|cultural)\b/],
  ['food',        /\b(food|culinary|wine|beer|cocktail|chef|restaurant|tasting|market|festival.{0,20}food)\b/],
  ['fitness',     /\b(fitness|run|marathon|yoga|workout|exercise|race|triathlon|walk)\b/],
  ['outdoors',    /\b(outdoor|park|garden|nature|parade|street fair|block party|boat|kayak|bike|waterfront)\b/],
  ['theater',     /\b(theater|theatre|dance|opera|ballet|circus|broadway|off.broadway|screening|film)\b/],
  ['workshops',   /\b(workshop|class|lecture|talk|seminar|course|skill|craft|fair|expo)\b/],
  ['nightlife',   /\b(nightlife|bar|club|party|social|mixer|happy hour|gala)\b/],
];

function inferCategory(name: string, desc: string): string {
  const text = `${name} ${desc}`.toLowerCase();
  for (const [cat, re] of CATEGORY_PATTERNS) if (re.test(text)) return cat;
  return 'popups';
}

function extractBorough(addr: string): string {
  const a = addr.toLowerCase();
  if (/brooklyn/.test(a)) return 'Brooklyn';
  if (/queens|flushing|astoria|jamaica/.test(a)) return 'Queens';
  if (/bronx/.test(a)) return 'Bronx';
  if (/staten island/.test(a)) return 'Staten Island';
  return 'Manhattan';
}

// ── Sitemap ────────────────────────────────────────────────────────────────

async function getEventUrls(): Promise<string[]> {
  const xml = await get(SITEMAP);
  return [...xml.matchAll(/<loc>(https:\/\/www\.nyctourism\.com\/events\/[^<]+)<\/loc>/g)]
    .map(m => m[1]);
}

// ── Event page parser ──────────────────────────────────────────────────────

interface NycTourismEvent {
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  image: string;
  streetAddress: string;
  url: string;
}

function parseEventPage(html: string, pageUrl: string): NycTourismEvent | null {
  // Primary source: JSON-LD schema.org/Event
  const jsonLdM = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
  if (!jsonLdM) return null;

  let data: any;
  try { data = JSON.parse(jsonLdM[1]); } catch { return null; }
  if (data['@type'] !== 'Event' || !data.name || !data.startDate) return null;

  const addr = data.location?.address;
  const streetAddress = [addr?.streetAddress, addr?.addressLocality, addr?.addressRegion]
    .filter(Boolean).join(', ') || 'New York, NY';

  // Description: prefer the JSON-LD one; fall back to og:description
  let description = data.description ?? '';
  if (!description) {
    const ogM = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i) ??
                html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:description"/i);
    description = ogM ? ogM[1] : '';
  }

  // Image: JSON-LD first, then og:image
  let image = data.image ?? '';
  if (!image) {
    const imgM = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i) ??
                 html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:image"/i);
    image = imgM ? imgM[1] : '';
  }

  return {
    name: data.name.trim(),
    description: description.replace(/&amp;/g,'&').replace(/&#39;/g,"'").trim(),
    startDate: data.startDate,
    endDate: data.endDate ?? data.startDate,
    image,
    streetAddress,
    url: pageUrl,
  };
}

// ── Main ingest ────────────────────────────────────────────────────────────

export async function ingestNYCTourism(): Promise<void> {
  console.log('[NYCTourism] Starting ingest...');
  const today = new Date().toISOString().split('T')[0];

  const urls = await getEventUrls();
  console.log(`[NYCTourism] Found ${urls.length} event URLs in sitemap`);

  const events: SiftEvent[] = [];
  let fetched = 0;
  let skipped = 0;

  for (const url of urls) {
    try {
      const html = await get(url);
      const ev   = parseEventPage(html, url);

      if (!ev) { skipped++; continue; }

      // Only keep events today or in future
      const startIso = ev.startDate.split('T')[0];
      const endIso   = ev.endDate.split('T')[0];
      if (endIso < today) { skipped++; continue; }

      const category = inferCategory(ev.name, ev.description);
      const borough  = extractBorough(ev.streetAddress);

      const normalized = normalizeEvent({
        source:      'nyctourism',
        source_id:   url.replace(`${BASE_URL}/events/`, '').replace(/\//g, ''),
        title:       ev.name,
        category:    category as any,
        description: ev.description.slice(0, 1000),
        start_date:  ev.startDate,
        end_date:    endIso !== startIso ? ev.endDate : undefined,
        venue_name:  ev.streetAddress.split(',')[0],
        address:     ev.streetAddress,
        borough:     borough as any,
        is_free:     false,
        event_url:   ev.url,
        ticket_url:  ev.url,
        image_url:   ev.image || undefined,
        tags:        ['nyc tourism', 'nyc', category],
      });

      if (normalized) { events.push(normalized); fetched++; }
    } catch (e) {
      console.error(`[NYCTourism] Error fetching ${url}:`, e);
      skipped++;
    }

    await sleep(300); // polite crawl rate
  }

  console.log(`[NYCTourism] Upcoming: ${fetched}, Skipped (past/no data): ${skipped}`);
  const result = await upsertEvents(events);
  console.log(`[NYCTourism] Upserted: ${result.inserted}, Errors: ${result.errors}`);
}

import { fileURLToPath } from 'url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  ingestNYCTourism().catch(console.error);
}

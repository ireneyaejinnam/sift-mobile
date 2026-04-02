import 'dotenv/config';
import { normalizeEvent } from './normalize';
import { upsertEvents } from './upsert';
import { SiftEvent } from './schema';

const BASE_URL = 'https://cozycreatives.beehiiv.com';
const SITEMAP_URL = `${BASE_URL}/sitemap.xml`;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

// ── Helpers ────────────────────────────────────────────────────────────────

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'").replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim());
}

async function get(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.text();
}

async function fetchOgImage(url: string): Promise<string | undefined> {
  try {
    const html = await get(url);
    const m =
      html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i) ??
      html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:image"/i);
    return m ? decodeHtmlEntities(m[1]) : undefined;
  } catch {
    return undefined;
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ── Category inference ─────────────────────────────────────────────────────

const CATEGORY_PATTERNS: [string, RegExp][] = [
  ['live_music',  /\b(music|concert|jazz|band|perform|sing|dj|festival|symphony)\b/],
  ['comedy',      /\b(comedy|stand.?up|improv|funny|laugh|comedian)\b/],
  ['art',         /\b(art|exhibit|gallery|museum|paint|photo|sculpt|mural|drawing|sketch|riso|print|textile|ceramics|pottery|fiber|collage|zine|illustration)\b/],
  ['food',        /\b(food|eat|drink|tasting|culinary|wine|beer|cocktail|chef|restaurant|market|cafe|coffee|tea|matcha|baking|cooking|pastry|potluck)\b/],
  ['fitness',     /\b(fitness|run|yoga|workout|exercise|hike|pilates|bootcamp|dance|movement)\b/],
  ['outdoors',    /\b(outdoor|park|garden|nature|walk|tour|boat|kayak|bike|cycling)\b/],
  ['theater',     /\b(theater|theatre|opera|film|movie|screening|ballet|circus|broadway|performance)\b/],
  ['workshops',   /\b(workshop|class|learn|lecture|talk|seminar|course|skill|craft|make|create|sewing|knit|weave|block\s*print|shadow\s*box|glass|candle|macrame|embroid)\b/],
  ['nightlife',   /\b(nightlife|bar|club|party|social|mixer|happy\s*hour|soiree|soirée)\b/],
];

function inferCategory(title: string, desc: string): string {
  const text = `${title} ${desc}`.toLowerCase();
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

interface PostMeta { url: string; lastmod: string; }

async function getRecentPosts(lookbackDays = 90): Promise<PostMeta[]> {
  const xml = await get(SITEMAP_URL);
  const cutoff = new Date(Date.now() - lookbackDays * 86_400_000).toISOString().split('T')[0];
  return [...xml.matchAll(
    /<loc>(https:\/\/cozycreatives\.beehiiv\.com\/p\/[^<]+)<\/loc>[\s\S]*?<lastmod>([^<]+)<\/lastmod>/g
  )]
    .filter(m => m[2] >= cutoff)
    .map(m => ({ url: m[1], lastmod: m[2] }))
    .sort((a, b) => b.lastmod.localeCompare(a.lastmod));
}

// ── URL extraction from HTML ───────────────────────────────────────────────

// Domains that are actual event platforms (not social/nav links)
const EVENT_DOMAINS = [
  'partiful.com', 'luma.com', 'lu.ma', 'eventbrite.com',
  'tixfox.co', 'book.squareup.com', 'humanitix.com', 'dice.fm',
  'ra.co', 'ticketweb.com', 'showclix.com', 'universe.com',
];
const SKIP_DOMAINS = [
  'beehiiv.com', 'fonts.google', 'instagram.com', 'tiktok.com',
  'twitter.com', 'facebook.com', 'youtube.com', 'linkedin.com',
  'google.com/maps', 'maps.app', 'staginghiiv.com',
];

function isEventUrl(url: string): boolean {
  if (SKIP_DOMAINS.some(d => url.includes(d))) return false;
  return EVENT_DOMAINS.some(d => url.includes(d));
}

/**
 * Build a map of event title (lowercased) → external URL by finding
 * every external link and the nearest <strong> text in the HTML.
 */
function buildUrlMap(html: string): Map<string, string> {
  const map = new Map<string, string>();

  // Scan for all href= attributes
  let i = 0;
  while (true) {
    const hi = html.indexOf('href=', i);
    if (hi < 0) break;
    const q = html[hi + 5]; // opening quote
    const end = html.indexOf(q, hi + 6);
    if (end < 0) { i = hi + 1; continue; }
    const url = decodeHtmlEntities(html.slice(hi + 6, end));
    i = end + 1;
    if (!isEventUrl(url)) continue;

    // Search backwards for nearest <strong>...</strong>
    const searchWindow = html.slice(Math.max(0, hi - 600), hi + 600);
    const strongs = [...searchWindow.matchAll(/<strong[^>]*>([\s\S]*?)<\/strong>/gi)];
    if (strongs.length) {
      const title = stripTags(strongs[strongs.length - 1][1]).trim();
      if (title && title.length > 2) {
        map.set(title.toLowerCase(), url);
      }
    }
  }
  return map;
}

// ── Newsletter text parser ─────────────────────────────────────────────────

interface RawEvent {
  title: string;
  date: string;
  time: string;
  address: string;
  venue: string;
  description: string;
  externalUrl: string | undefined;
  price: number | undefined;
  isFree: boolean;
}

const DAY_HEADER_RE = /^(MON|TUE|WED|THU|FRI|SAT|SUN)[A-Z]*\s*\((\d{1,2})\/(\d{1,2})\)/i;
const TIME_RE       = /^\d{1,2}:\d{2}\s*[ap]m\s*[-–]\s*\d{1,2}:\d{2}\s*[ap]m/i;
const ADDRESS_RE    = /^\d+(-\d+)?\s+[A-Z].*(Street|St\.?|Ave\.?|Avenue|Blvd|Road|Rd\.?|Place|Drive|Dr\.?|Floor|Broadway|Park\b|Square\b|Parkway|Way\b|Grand\b)/i;
// Event headline: starts with an emoji (non-ASCII) then a capital letter
const EVENT_LINE_RE = /^[\p{Emoji_Presentation}\p{Extended_Pictographic}]\s*[A-Z\p{L}]/u;

function parseEventLine(line: string): { title: string; price: number | undefined; isFree: boolean; venue: string } {
  // Remove leading emoji
  let s = line.replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+/u, '').trim();

  let price: number | undefined;
  let isFree = false;
  // FREE tag
  if (/\(FREE[^)]*\)/i.test(s)) { isFree = true; }
  // Price: ($65) or ($55-$70)
  const pm = s.match(/\(\$(\d+)(?:\s*[-–]\s*\$(\d+))?\)/);
  if (pm) price = parseInt(pm[1]);
  // Remove price + free annotations from the string
  s = s.replace(/\(FREE[^)]*\)/gi, '').replace(/\(\$[^)]+\)/g, '').trim();

  // Extract venue: text after " at ", " in ", " by " (last occurrence)
  const venueM = s.match(/^([\s\S]+?)\s+(?:at|in|by)\s+(.+)$/i);
  let title = s;
  let venue = '';
  if (venueM) {
    title = venueM[1].trim();
    venue = venueM[2].trim();
  }
  return { title, price, isFree, venue };
}

/** Fuzzy lookup: find URL for a title by longest common normalized substring */
function findUrl(title: string, urlMap: Map<string, string>): string | undefined {
  const norm = (s: string) => s.toLowerCase().replace(/[^\w]/g, '');
  const t = norm(title);
  for (const [key, url] of urlMap) {
    const k = norm(key);
    if (t === k || t.startsWith(k) || k.startsWith(t) || t.includes(k) || k.includes(t)) {
      return url;
    }
  }
  return undefined;
}

function parsePostEvents(html: string, postDate: string): RawEvent[] {
  const postYear  = parseInt(postDate.slice(0, 4));
  const postMonth = parseInt(postDate.slice(5, 7));

  const clean = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');

  const urlMap = buildUrlMap(clean);

  // Convert to readable lines
  const text = clean
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\u200B/g, '') // zero-width space
    .replace(/\u00AD/g, '') // soft hyphen
    .split('\n')
    .map(l => decodeHtmlEntities(l).trim())
    .filter(l => l.length > 0);

  const events: RawEvent[] = [];
  let currentDate = '';
  let pending: Partial<RawEvent> | null = null;
  let descLines: string[] = [];

  const flush = () => {
    if (pending?.title && pending.date) {
      events.push({
        title:       pending.title,
        date:        pending.date,
        time:        pending.time ?? '',
        address:     pending.address ?? '',
        venue:       pending.venue ?? '',
        description: descLines.slice(0, 4).join(' ').slice(0, 600),
        externalUrl: pending.externalUrl,
        price:       pending.price,
        isFree:      pending.isFree ?? false,
      });
    }
    pending = null;
    descLines = [];
  };

  for (const line of text) {
    // Day header?
    const dm = line.match(DAY_HEADER_RE);
    if (dm) {
      flush();
      const month = parseInt(dm[2]);
      const day   = parseInt(dm[3]);
      const year  = month < postMonth - 6 ? postYear + 1 : postYear;
      currentDate = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      continue;
    }

    if (!currentDate) continue;

    // Stop at footer/newsletter boilerplate
    if (/join the club|subscribe|powered by beehiiv|report abuse|privacy policy/i.test(line)) {
      flush();
      break;
    }

    // Event headline?
    if (EVENT_LINE_RE.test(line)) {
      flush();
      const { title, price, isFree, venue } = parseEventLine(line);
      if (!title || title.length < 3) continue;
      const externalUrl = findUrl(title, urlMap);
      pending = { title, date: currentDate, venue, externalUrl, price, isFree };
      descLines = [];
      continue;
    }

    if (!pending) continue;

    // Time?
    if (!pending.time && TIME_RE.test(line)) {
      pending.time = line.match(TIME_RE)![0].trim();
      continue;
    }

    // Address?
    if (!pending.address && ADDRESS_RE.test(line)) {
      pending.address = line;
      continue;
    }

    // Description (skip very short lines and bullet separators)
    if (line.length > 30 && !line.startsWith('-') && !/^[•·▸●]/u.test(line)) {
      descLines.push(line);
    }
  }

  flush();
  return events;
}

// ── Main ingest ────────────────────────────────────────────────────────────

export async function ingestCozyCretaives(): Promise<void> {
  console.log('[CozyCratives] Starting ingest...');
  const today = new Date().toISOString().split('T')[0];

  const posts = await getRecentPosts(90);
  console.log(`[CozyCratives] Found ${posts.length} recent newsletters`);

  const raw: RawEvent[] = [];
  for (const post of posts) {
    try {
      const html = await get(post.url);
      const events = parsePostEvents(html, post.lastmod);
      console.log(`[CozyCratives]  ${post.url.split('/p/')[1]} → ${events.length} events`);
      raw.push(...events);
    } catch (e) {
      console.error(`[CozyCratives] Failed ${post.url}:`, e);
    }
    await sleep(600);
  }

  // Dedup by title+date
  const seen = new Set<string>();
  const unique = raw.filter(e => {
    const key = `${e.title.toLowerCase().replace(/\s+/g, '')}::${e.date}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const upcoming = unique.filter(e => e.date >= today);
  console.log(`[CozyCratives] ${unique.length} total, ${upcoming.length} upcoming`);

  // Fetch og:image for each event (rate-limited, best-effort)
  const withImages: (RawEvent & { imageUrl?: string })[] = [];
  for (const ev of upcoming) {
    let imageUrl: string | undefined;
    if (ev.externalUrl) {
      imageUrl = await fetchOgImage(ev.externalUrl);
      await sleep(350);
    }
    withImages.push({ ...ev, imageUrl });
  }

  // Normalize and upsert
  const siftEvents: SiftEvent[] = [];
  for (const ev of withImages) {
    const category = inferCategory(ev.title, ev.description);
    const borough  = ev.address ? extractBorough(ev.address) : 'Manhattan';

    // Build start_date with time component if we have it
    let startDate = ev.date;
    if (ev.time) {
      const tm = ev.time.match(/^(\d{1,2}):(\d{2})\s*(am|pm)/i);
      if (tm) {
        let h = parseInt(tm[1]);
        if (tm[3].toLowerCase() === 'pm' && h < 12) h += 12;
        if (tm[3].toLowerCase() === 'am' && h === 12) h = 0;
        startDate = `${ev.date}T${String(h).padStart(2, '0')}:${tm[2]}:00`;
      }
    }

    const normalized = normalizeEvent({
      source:      'cozycreatives',
      source_id:   `${ev.date}::${ev.title.toLowerCase().replace(/\W+/g, '_').slice(0, 60)}`,
      title:       ev.title,
      category:    category as any,
      description: ev.description,
      start_date:  startDate,
      venue_name:  ev.venue || (ev.address ? ev.address.split(',')[0] : 'NYC'),
      address:     ev.address || 'New York, NY',
      borough:     borough as any,
      is_free:     ev.isFree || ev.price === 0,
      price_min:   ev.price ?? (ev.isFree ? 0 : undefined),
      price_max:   ev.price,
      event_url:   ev.externalUrl,
      ticket_url:  ev.externalUrl,
      image_url:   ev.imageUrl,
      tags:        ['cozy creatives', 'nyc', category, ...(ev.isFree ? ['free'] : [])],
    });

    if (normalized) siftEvents.push(normalized);
  }

  console.log(`[CozyCratives] Normalized: ${siftEvents.length} events`);
  const result = await upsertEvents(siftEvents);
  console.log(`[CozyCratives] Upserted: ${result.inserted}, Errors: ${result.errors}`);
}

import { fileURLToPath } from 'url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  ingestCozyCretaives().catch(console.error);
}

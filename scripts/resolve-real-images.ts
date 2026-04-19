/**
 * resolve-real-images.ts
 *
 * Replaces generic Unsplash stock photos with real event/artist images.
 *
 * Strategy per category:
 *   - live_music / nightlife (artists): Ticketmaster Discovery API → artist promo photo
 *   - All categories: og:image from event-specific pages (retry with better URLs)
 *   - Last resort: keep existing Unsplash image
 *
 * No LLM calls. Uses existing TICKETMASTER_API_KEY.
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import 'dotenv/config';

const EVENTS_PATH = join(__dirname, '..', 'lib', 'ai-collect-data', 'output', 'ai_new_events.json');
const TM_KEY = process.env.TICKETMASTER_API_KEY!;

// ── Helpers ──────────────────────────────────────────────────

async function isImageUrlValid(url: string): Promise<boolean> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 5000);
    const r = await fetch(url, { method: 'HEAD', signal: c.signal });
    clearTimeout(t);
    const ct = r.headers.get('content-type') ?? '';
    return r.ok && ct.startsWith('image/');
  } catch {
    return false;
  }
}

function extractArtistName(title: string): string {
  return title
    .replace(/\s*[—–]\s*.*/g, '')       // "Peso Pluma — DINASTÍA Tour" → "Peso Pluma"
    .replace(/\s*\(.*\)/g, '')           // "(Barclays)" etc
    .replace(/\s+with\s+.*/i, '')        // "Iron & Wine with Improvement Movement"
    .replace(/^An Evening With\s+/i, '') // "An Evening With Maya Hawke"
    .trim();
}

// ── Ticketmaster Discovery API ───────────────────────────────

async function ticketmasterImage(searchTerm: string): Promise<string | null> {
  try {
    const q = encodeURIComponent(searchTerm);
    const url = `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${TM_KEY}&keyword=${q}&size=3&sort=relevance,asc`;
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 8000);
    const r = await fetch(url, { signal: c.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const data = (await r.json()) as any;
    const events = data._embedded?.events;
    if (!events?.length) return null;

    // Find the best 16:9 image from the first matching event
    for (const ev of events) {
      const imgs: any[] = ev.images ?? [];
      // Prefer largest 16_9
      const best = imgs
        .filter((i: any) => i.ratio === '16_9' && i.width >= 640)
        .sort((a: any, b: any) => b.width - a.width)[0];
      if (best?.url) return best.url;
      // Fallback to 3_2
      const alt = imgs
        .filter((i: any) => i.ratio === '3_2' && i.width >= 640)
        .sort((a: any, b: any) => b.width - a.width)[0];
      if (alt?.url) return alt.url;
    }
    return null;
  } catch {
    return null;
  }
}

// ── og:image scraper (with better event-specific URLs) ───────

function extractOgImage(html: string): string | null {
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) return m[1];
  }
  return null;
}

const GENERIC_PATTERNS = [
  /default_thumb/i,
  /placeholder/i,
  /logo[-_.]/i,
  /\/logo\./i,
  /roundabout-header/i,
  /1618496741/i, // Elsewhere fallback
  /share-image/i, // Generic share images
  /og-default/i,
  /social-share/i,
];

function looksGeneric(url: string): boolean {
  return GENERIC_PATTERNS.some((p) => p.test(url));
}

async function ogImageFromUrl(eventUrl: string): Promise<string | null> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 8000);
    const r = await fetch(eventUrl, {
      signal: c.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        Accept: 'text/html',
      },
      redirect: 'follow',
    });
    clearTimeout(t);
    if (!r.ok) return null;
    const html = await r.text();
    let img = extractOgImage(html);
    if (!img) return null;
    if (img.startsWith('//')) img = 'https:' + img;
    else if (img.startsWith('/')) {
      const u = new URL(eventUrl);
      img = u.origin + img;
    }
    if (looksGeneric(img)) return null;
    return img;
  } catch {
    return null;
  }
}

// ── Better event-specific URLs for known venues ──────────────

// Many events point to venue homepages (bkstl.com, terminal5nyc.com).
// For these, we search TM instead.
const VENUE_HOMEPAGE_PATTERNS = [
  /bkstl\.com$/,
  /terminal5nyc\.com$/,
  /knockdown\.center/,
  /boweryballroom\.com$/,
  /elsewherebrooklyn\.com$/,
  /websterhall\.com$/,
  /publicrecords\.nyc$/,
  /barclayscenter\.com/,
  /260samplesale\.com/,
  /arlettie\.us$/,
  /resy\.com/,
  /brooklynflea\.com$/,
  /artistsandfleas\.com$/,
  /nycxdesign\.org/,
];

function isVenueHomepage(url: string): boolean {
  return VENUE_HOMEPAGE_PATTERNS.some(p => p.test(url));
}

// ── Main ─────────────────────────────────────────────────────

async function main() {
  const events: any[] = JSON.parse(readFileSync(EVENTS_PATH, 'utf-8'));
  const needsImage = events.filter(e => e.image_url?.includes('unsplash.com'));
  console.log(`[resolve-real] ${needsImage.length} events with Unsplash stock to replace\n`);

  let resolved = 0;
  let kept = 0;
  const failures: string[] = [];

  // Rate-limit TM API: max 5 req/sec
  const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

  for (const e of needsImage) {
    const isMusic = e.category === 'live_music' || e.category === 'nightlife';
    const eventUrl = e.event_url ?? e.ticket_url ?? '';
    let found: string | null = null;

    // Strategy 1: Ticketmaster for music + any event with a title worth searching
    if (isMusic || isVenueHomepage(eventUrl)) {
      const searchTerm = isMusic ? extractArtistName(e.title) : e.title;
      // Skip non-artist searches like "Elsewhere Rooftop" or "Wire Festival 2026"
      if (searchTerm && searchTerm.length > 2) {
        found = await ticketmasterImage(searchTerm);
        if (found && await isImageUrlValid(found)) {
          e.image_url = found;
          resolved++;
          console.log(`  ✓ TM   ${e.title}\n         → ${found.substring(0, 80)}...`);
          await delay(250);
          continue;
        }
        await delay(250);
      }
    }

    // Strategy 2: og:image from event URL (if not a venue homepage)
    if (eventUrl && !isVenueHomepage(eventUrl)) {
      found = await ogImageFromUrl(eventUrl);
      if (found && await isImageUrlValid(found)) {
        e.image_url = found;
        resolved++;
        console.log(`  ✓ OG   ${e.title}\n         → ${found.substring(0, 80)}...`);
        continue;
      }
    }

    // Strategy 3: For non-music, try TM anyway as a last resort
    if (!isMusic) {
      found = await ticketmasterImage(e.title);
      if (found && await isImageUrlValid(found)) {
        e.image_url = found;
        resolved++;
        console.log(`  ✓ TM2  ${e.title}\n         → ${found.substring(0, 80)}...`);
        await delay(250);
        continue;
      }
      await delay(250);
    }

    // Keep existing Unsplash
    kept++;
    failures.push(e.title);
    console.log(`  ·      ${e.title} (kept Unsplash)`);
  }

  writeFileSync(EVENTS_PATH, JSON.stringify(events, null, 2), 'utf-8');

  console.log('\n── Summary ──');
  console.log(`Replaced with real images: ${resolved}`);
  console.log(`Kept Unsplash:             ${kept}`);
  if (failures.length) {
    console.log('\nKept Unsplash (still usable):');
    for (const f of failures) console.log(`  - ${f}`);
  }
}

main().catch(err => {
  console.error('[resolve-real] fatal:', err);
  process.exit(1);
});

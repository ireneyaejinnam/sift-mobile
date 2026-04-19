/**
 * resolve-seed-images.ts
 *
 * Pre-resolves image_url for every event in ai_new_events.json using og:image
 * scraping only — no LLM calls, no Unsplash search. Pure HTML + regex.
 *
 * Strategy per event:
 *   1. HEAD-check existing image_url — keep if valid.
 *   2. Fetch event_url HTML, extract og:image meta tag.
 *   3. Validate og:image URL via HEAD request.
 *   4. On success: patch image_url in-place. On failure: leave null + log.
 *
 * Writes back to ai_new_events.json. Re-runnable (skips already-resolved rows).
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import 'dotenv/config';

const EVENTS_PATH = join(__dirname, '..', 'lib', 'ai-collect-data', 'output', 'ai_new_events.json');

async function isImageUrlValid(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { method: 'HEAD', signal: controller.signal });
    clearTimeout(timer);
    const ct = res.headers.get('content-type') ?? '';
    return res.ok && ct.startsWith('image/');
  } catch {
    return false;
  }
}

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

// Low-quality og:image patterns — treat as no-image so we fall through to Unsplash.
const GENERIC_PATTERNS = [
  /default_thumb/i,
  /placeholder/i,
  /logo[-_.]/i,
  /\/logo\./i,
  /roundabout-header/i,
  /1618496741-34655729651bbafde2b7e61e1accc3e6/, // Elsewhere fallback hero
];

function looksGeneric(url: string): boolean {
  return GENERIC_PATTERNS.some((p) => p.test(url));
}

async function unsplashSearch(query: string): Promise<string | null> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return null;
  const q = encodeURIComponent(query.replace(/[^\w\s]/g, ' ').trim().slice(0, 60));
  try {
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${q}&per_page=1&orientation=landscape`,
      { headers: { Authorization: `Client-ID ${key}` } }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    return data?.results?.[0]?.urls?.regular ?? null;
  } catch {
    return null;
  }
}

// Build a more descriptive Unsplash query from the event.
function unsplashQuery(ev: any): string {
  const parts: string[] = [];
  const c = ev.category;
  const tags: string[] = ev.tags ?? [];

  if (tags.includes('sample-sale')) parts.push('fashion boutique sale');
  else if (tags.includes('flea') || tags.includes('market')) parts.push('brooklyn flea market');
  else if (tags.includes('drop')) parts.push('streetwear drop store');
  else if (tags.includes('anchor') && c === 'art') parts.push('art gallery opening nyc');
  else if (c === 'live_music') parts.push('concert stage crowd');
  else if (c === 'nightlife') parts.push('nightclub dj lights brooklyn');
  else if (c === 'theater') parts.push('broadway theater stage');
  else if (c === 'art') parts.push('modern art gallery nyc');
  else if (c === 'food') parts.push('brooklyn food market');
  else if (c === 'fitness') parts.push('nyc running race brooklyn');
  else if (c === 'outdoors') parts.push('new york sports stadium');
  else parts.push('new york city event');

  // Add a token from the title for some variety
  const titleWord = ev.title.split(/\s+/).find((w: string) => w.length > 4 && /^[A-Za-z]/.test(w));
  if (titleWord) parts.push(titleWord.toLowerCase());

  return parts.join(' ');
}

async function ogImageFromUrl(eventUrl: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(eventUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const html = await res.text();
    let img = extractOgImage(html);
    if (!img) return null;
    // Resolve relative URLs
    if (img.startsWith('//')) img = 'https:' + img;
    else if (img.startsWith('/')) {
      const u = new URL(eventUrl);
      img = u.origin + img;
    }
    return img;
  } catch {
    return null;
  }
}

async function main() {
  if (!existsSync(EVENTS_PATH)) {
    console.error(`Not found: ${EVENTS_PATH}`);
    process.exit(1);
  }
  const events: any[] = JSON.parse(readFileSync(EVENTS_PATH, 'utf-8'));
  console.log(`[resolve-images] Loaded ${events.length} events`);

  let resolved = 0;
  let alreadyOk = 0;
  const failures: { title: string; url: string }[] = [];

  const CONCURRENCY = 6;
  for (let i = 0; i < events.length; i += CONCURRENCY) {
    const batch = events.slice(i, i + CONCURRENCY);

    await Promise.all(batch.map(async (e) => {
      if (e.image_url && !looksGeneric(e.image_url) && await isImageUrlValid(e.image_url)) {
        alreadyOk++;
        return;
      }
      // Existing image is generic or invalid — clear and re-resolve.
      e.image_url = null;

      const url = e.event_url ?? e.source_url;
      if (!url) {
        failures.push({ title: e.title, url: '(no url)' });
        return;
      }

      const og = await ogImageFromUrl(url);
      if (og && !looksGeneric(og) && await isImageUrlValid(og)) {
        e.image_url = og;
        resolved++;
        console.log(`  ✓ og   ${e.title}\n         → ${og}`);
        return;
      }

      // Fall through: Unsplash
      const query = unsplashQuery(e);
      const stock = await unsplashSearch(query);
      if (stock && await isImageUrlValid(stock)) {
        e.image_url = stock;
        resolved++;
        console.log(`  ✓ ush  ${e.title}  [${query}]\n         → ${stock}`);
        return;
      }

      failures.push({ title: e.title, url });
      console.log(`  ✗      ${e.title}`);
    }));
  }

  writeFileSync(EVENTS_PATH, JSON.stringify(events, null, 2), 'utf-8');

  console.log('\n── Summary ──');
  console.log(`Already OK:  ${alreadyOk}`);
  console.log(`Resolved:    ${resolved}`);
  console.log(`Failed:      ${failures.length}`);
  if (failures.length) {
    console.log('\nFailures (need manual lookup):');
    for (const f of failures) console.log(`  - ${f.title}  (${f.url})`);
  }
}

main().catch((err) => {
  console.error('[resolve-images] fatal:', err);
  process.exit(1);
});

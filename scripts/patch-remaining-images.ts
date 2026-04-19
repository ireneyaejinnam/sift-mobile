/**
 * patch-remaining-images.ts
 *
 * Hand-curated image_url overrides for events the automated resolver failed on.
 * Match keyed on event title (exact). Run after resolve-seed-images.ts.
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const EVENTS_PATH = join(__dirname, '..', 'lib', 'ai-collect-data', 'output', 'ai_new_events.json');

// Unsplash direct-photo URLs (stable, CDN-hosted, editorial-quality).
// Format: https://images.unsplash.com/photo-<id>?...
const OVERRIDES: Record<string, string> = {
  'NYCxDesign 2026 Festival':
    'https://images.unsplash.com/photo-1618220179428-22790b461013?w=1080&q=80&fm=jpg', // modern NYC design/architecture
  'Frieze New York 2026':
    'https://images.unsplash.com/photo-1605429523419-d828acb941d9?w=1080&q=80&fm=jpg', // art fair booths
  'VIP Stuart Weitzman Sample Sale':
    'https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=1080&q=80&fm=jpg', // luxury shoes/designer
  'BeautySpace Sample Sale':
    'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=1080&q=80&fm=jpg', // beauty products display
  'Brock Collection Sample Sale':
    'https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=1080&q=80&fm=jpg', // designer fashion boutique
  'Peekaboo':
    'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=1080&q=80&fm=jpg', // EDM festival lasers
  'Elsewhere Rooftop — Season Opens':
    'https://images.unsplash.com/photo-1566417713940-fe7c737a9ef2?w=1080&q=80&fm=jpg', // brooklyn rooftop party
  'Inner Wave with Los Mesoneros':
    'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=1080&q=80&fm=jpg', // indie concert crowd
  'Bar Ferdinando (opening month)':
    'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=1080&q=80&fm=jpg', // cozy nyc bar/restaurant
};

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

async function main() {
  const events: any[] = JSON.parse(readFileSync(EVENTS_PATH, 'utf-8'));
  let patched = 0;
  const bad: string[] = [];

  for (const [title, url] of Object.entries(OVERRIDES)) {
    const ev = events.find((e) => e.title === title);
    if (!ev) {
      console.log(`  ? no match: ${title}`);
      continue;
    }
    const ok = await isImageUrlValid(url);
    if (!ok) {
      bad.push(`${title} → ${url}`);
      continue;
    }
    ev.image_url = url;
    patched++;
    console.log(`  ✓ ${title}`);
  }

  writeFileSync(EVENTS_PATH, JSON.stringify(events, null, 2), 'utf-8');
  console.log(`\nPatched: ${patched}`);
  if (bad.length) {
    console.log('Failed HEAD check:');
    for (const b of bad) console.log(`  - ${b}`);
  }
}

main();

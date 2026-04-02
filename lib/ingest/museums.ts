import 'dotenv/config';
import { MUSEUM_CONFIG } from './config';
import { normalizeEvent } from './normalize';
import { upsertEvents } from './upsert';
import { SiftEvent } from './schema';

const MONTH_MAP: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', sept: '09', oct: '10', nov: '11', dec: '12',
};

const THIS_YEAR = new Date().getFullYear();

/**
 * Parse Whitney-style date strings into { start, end } ISO date strings.
 * Patterns seen:
 *   "Through Aug 23"       → end = 2026-08-23, start = today
 *   "Through Sept"         → end = 2026-09-30, start = today
 *   "Through Apr 27"       → end = 2026-04-27, start = today
 *   "Through Sept 2026"    → end = 2026-09-30, start = today
 *   "Oct 29, 2025–"        → start = 2025-10-29, no end
 *   "2026"                 → start = 2026-01-01, end = 2026-12-31
 *   ""                     → null (skip)
 */
function parseWhitneyDates(
  raw: string
): { start: string; end: string | undefined } | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;

  const today = new Date().toISOString().split('T')[0];

  // "through <month> <day>" or "through <month>"
  const throughMatch = s.match(/through\s+(\w+)(?:\s+(\d+))?,?\s*(\d{4})?/);
  if (throughMatch) {
    const mon = MONTH_MAP[throughMatch[1]];
    if (!mon) return null;
    // throughMatch[2] might be a day (1-2 digits) or accidentally a year (4 digits)
    const capture2IsYear = throughMatch[2] && throughMatch[2].length === 4;
    const year = capture2IsYear ? throughMatch[2] : (throughMatch[3] ?? String(THIS_YEAR));
    const rawDay = capture2IsYear ? undefined : throughMatch[2];
    const day = rawDay
      ? rawDay.padStart(2, '0')
      : new Date(Number(year), Number(mon), 0).getDate().toString().padStart(2, '0');
    return { start: today, end: `${year}-${mon}-${day}` };
  }

  // "opens <year>" or just "<year>" — too vague, skip
  if (/opens/.test(s)) return null;

  // plain year like "2026" or "2025"
  const yearOnly = s.match(/^(\d{4})$/);
  if (yearOnly) {
    const y = Number(yearOnly[1]);
    if (y < THIS_YEAR) return null; // past
    return { start: `${y}-01-01`, end: `${y}-12-31` };
  }

  // "Oct 29, 2025–" (ongoing since past date)
  const ongoingMatch = s.match(/(\w+)\s+(\d+),?\s+(\d{4})[–-]/);
  if (ongoingMatch) {
    const mon = MONTH_MAP[ongoingMatch[1]];
    if (!mon) return null;
    const day = ongoingMatch[2].padStart(2, '0');
    const year = ongoingMatch[3];
    return { start: `${year}-${mon}-${day}`, end: undefined };
  }

  return null;
}

// ── Whitney scraper ────────────────────────────────────────────────────────

async function scrapeWhitney(): Promise<SiftEvent[]> {
  const config = MUSEUM_CONFIG.find(m => m.name === 'whitney')!;
  const events: SiftEvent[] = [];

  const res = await fetch(config.url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  // Each exhibition is a <li class="list-item exhibition-list-item">
  const items = html.match(/<li class="list-item exhibition-list-item">([\s\S]*?)<\/li>/g) ?? [];

  for (const item of items) {
    const titleM = item.match(/<h3[^>]*>([^<]+)<\/h3>/);
    const dateM = item.match(/<p class="list-item__subtitle[^"]*">([^<]+)<\/p>/);
    const linkM = item.match(/href="(\/exhibitions\/[^"]+)"/);
    const imgM = item.match(/src="(https:\/\/whitneymedia[^"]+large[^"]+)"/);

    if (!titleM || !linkM) continue;

    const title = titleM[1].replace(/&amp;/g, '&').trim();
    const dateRaw = dateM ? dateM[1].trim() : '';
    const slug = linkM[1].replace('/exhibitions/', '');
    const eventUrl = `https://whitney.org${linkM[1]}`;
    const imageUrl = imgM ? imgM[1] : undefined;

    const dates = parseWhitneyDates(dateRaw);
    if (!dates) continue; // skip past or unparseable

    const normalized = normalizeEvent({
      source: config.name,
      source_id: slug,
      title,
      category: 'art',
      start_date: dates.start,
      end_date: dates.end,
      venue_name: config.venue_name,
      address: config.address,
      neighborhood: config.neighborhood,
      borough: config.borough as any,
      latitude: config.latitude,
      longitude: config.longitude,
      price_min: config.price_min,
      price_max: config.price_max,
      is_free: false,
      event_url: eventUrl,
      ticket_url: eventUrl,
      image_url: imageUrl,
      tags: ['museum', 'exhibition', 'whitney'],
    });

    if (normalized) events.push(normalized);
  }

  return events;
}

// ── New Museum scraper (GraphQL) ────────────────────────────────────────────

async function scrapeNewMuseum(): Promise<SiftEvent[]> {
  const config = MUSEUM_CONFIG.find(m => m.name === 'new_museum')!;
  const today = new Date().toISOString().split('T')[0];

  const query = `{
    exhibitions(first: 50, where: { status: PUBLISH }) {
      nodes {
        title slug startDate endDate excerpt exhibitionIntro
        featuredImage { node { sourceUrl } }
        exhibitionType { nodes { name } }
      }
    }
  }`;

  const res = await fetch('https://admin.newmuseum.org/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'sift-nyc-app/1.0' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const nodes: any[] = json?.data?.exhibitions?.nodes ?? [];

  const events: SiftEvent[] = [];
  for (const node of nodes) {
    // Skip if endDate is in the past
    if (node.endDate && node.endDate < today) continue;
    // Skip offsite exhibitions
    const types: string[] = (node.exhibitionType?.nodes ?? []).map((n: any) => n.name?.toLowerCase() ?? '');
    if (types.some(t => t.includes('offsite'))) continue;

    const title = node.title?.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ' ').trim();
    if (!title) continue;

    const description = (node.exhibitionIntro || node.excerpt || '')
      .replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ' ').trim();

    const normalized = normalizeEvent({
      source: 'new_museum',
      source_id: node.slug,
      title,
      category: 'art',
      start_date: node.startDate || today,
      end_date: node.endDate || undefined,
      description,
      venue_name: config.venue_name,
      address: config.address,
      neighborhood: config.neighborhood,
      borough: config.borough as any,
      latitude: config.latitude,
      longitude: config.longitude,
      price_min: config.price_min,
      price_max: config.price_max,
      is_free: false,
      event_url: `https://www.newmuseum.org/exhibition/${node.slug}/`,
      ticket_url: `https://www.newmuseum.org/exhibition/${node.slug}/`,
      image_url: node.featuredImage?.node?.sourceUrl || undefined,
      tags: ['museum', 'exhibition', 'new museum', 'lower east side'],
    });

    if (normalized) events.push(normalized);
  }

  return events;
}

// ── Orchestrator ───────────────────────────────────────────────────────────

export async function ingestMuseums(): Promise<void> {
  console.log('[Museums] Starting ingest...');
  const allEvents: SiftEvent[] = [];

  // Whitney — static HTML, works
  try {
    process.stdout.write('[Museums] Scraping Whitney...');
    const events = await scrapeWhitney();
    allEvents.push(...events);
    console.log(` ${events.length} exhibitions`);
  } catch (e) {
    console.log(` ERROR: ${e}`);
  }

  // New Museum — public GraphQL API
  try {
    process.stdout.write('[Museums] Scraping New Museum (GraphQL)...');
    const events = await scrapeNewMuseum();
    allEvents.push(...events);
    console.log(` ${events.length} exhibitions`);
  } catch (e) {
    console.log(` ERROR: ${e}`);
  }

  // MoMA — Cloudflare-protected, requires Playwright + proxy to bypass
  console.log('[Museums] Skipping MoMA (Cloudflare bot protection)');

  // Brooklyn Museum — Vercel bot protection
  console.log('[Museums] Skipping Brooklyn Museum (bot protection)');

  console.log(`[Museums] Total: ${allEvents.length} exhibitions`);
  const result = await upsertEvents(allEvents);
  console.log(`[Museums] Upserted: ${result.inserted}, Errors: ${result.errors}`);
}

async function main() {
  await ingestMuseums();
}

main().catch(console.error);

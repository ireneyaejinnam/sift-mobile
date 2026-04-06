/**
 * LLM enrichment step — uses Claude (Haiku) to improve data accuracy.
 *
 * Pipeline per event:
 *   1. Fetch the aggregator page (event_url) and extract all external links
 *   2. LLM picks which links are the official website(s) — not aggregators
 *   3. Fetch each official page (+ ticket_url if different)
 *   4. LLM extracts verified data from the official content
 *   5. Programmatic borough fix from address string
 *
 * Unknown/unconfirmed fields are left null — no guessing.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { parse } from 'node-html-parser';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const VALID_CATEGORIES = [
  'live_music', 'art', 'theater', 'comedy', 'workshops',
  'fitness', 'food', 'outdoors', 'nightlife', 'popups',
];

const VALID_BOROUGHS = ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island'];

// Known aggregator/social domains — never treat these as "official"
const AGGREGATOR_DOMAINS = new Set([
  'eventbrite.com', 'ticketmaster.com', 'facebook.com', 'instagram.com',
  'twitter.com', 'x.com', 'youtube.com', 'meetup.com', 'dice.fm',
  'residentadvisor.net', 'ra.co', 'nyctourism.com', 'nycgo.com',
  'timeout.com', 'theskint.com', 'nycforfree.com', 'cozycreatives.com',
  'yelp.com', 'tripadvisor.com', 'google.com', 'apple.com',
  'spotify.com', 'bandcamp.com', 'soundcloud.com',
]);

// ZIP → borough
const ZIP_BOROUGH: [RegExp, string][] = [
  [/\b100\d{2}\b/, 'Manhattan'], [/\b101\d{2}\b/, 'Manhattan'], [/\b102\d{2}\b/, 'Manhattan'],
  [/\b112\d{2}\b/, 'Brooklyn'],
  [/\b113\d{2}\b/, 'Queens'], [/\b114\d{2}\b/, 'Queens'], [/\b116\d{2}\b/, 'Queens'],
  [/\b104\d{2}\b/, 'Bronx'],
  [/\b103\d{2}\b/, 'Staten Island'],
];

interface EventRow {
  id: string;
  title: string;
  description?: string | null;
  venue_name?: string | null;
  address?: string | null;
  category: string;
  is_free: boolean;
  borough?: string | null;
  tags?: string[] | null;
  event_url?: string | null;
  ticket_url?: string | null;
}

interface EnrichResult {
  category?: string;
  is_free?: boolean;
  borough?: string | null;
  description?: string | null;
  address?: string | null;
  venue_name?: string | null;
}

// ── Borough fix from address ──────────────────────────────────

function boroughFromAddress(address: string): string | null {
  const text = address.toLowerCase();
  if (text.includes('brooklyn')) return 'Brooklyn';
  if (text.includes('queens')) return 'Queens';
  if (text.includes('bronx')) return 'Bronx';
  if (text.includes('staten island')) return 'Staten Island';
  for (const [re, borough] of ZIP_BOROUGH) {
    if (re.test(address)) return borough;
  }
  if (text.includes('manhattan') || /new york,?\s*ny\s*10\d{3}/.test(text)) return 'Manhattan';
  return null;
}

// ── Web fetch helpers ─────────────────────────────────────────

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function fetchPage(url: string, timeoutMs = 10_000): Promise<{ text: string; links: string[] }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal, headers: FETCH_HEADERS });
    clearTimeout(timer);
    if (!res.ok) return { text: '', links: [] };

    const html = await res.text();
    const root = parse(html);

    // Extract all external links with their anchor text
    const links: string[] = [];
    const baseHost = new URL(url).hostname.replace('www.', '');
    root.querySelectorAll('a[href]').forEach((a) => {
      const href = a.getAttribute('href') ?? '';
      if (!href.startsWith('http')) return;
      try {
        const linkHost = new URL(href).hostname.replace('www.', '');
        if (linkHost !== baseHost) links.push(href);
      } catch { /* skip malformed */ }
    });

    // Strip noise and extract readable text
    root.querySelectorAll('script, style, nav, footer, header, iframe, noscript').forEach((n) => n.remove());
    const focusSelectors = ['article', 'main', '[class*="event"]', '[class*="content"]', '[id*="event"]', '[id*="content"]'];
    for (const sel of focusSelectors) {
      const node = root.querySelector(sel);
      if (node) {
        const text = node.text.replace(/\s+/g, ' ').trim();
        if (text.length > 200) return { text: text.slice(0, 4000), links };
      }
    }
    const text = (root.querySelector('body')?.text ?? root.text).replace(/\s+/g, ' ').trim().slice(0, 4000);
    return { text, links };
  } catch {
    return { text: '', links: [] };
  }
}

// ── Step 1: Find official URLs from aggregator page ───────────

async function findOfficialUrls(eventTitle: string, aggregatorUrl: string, links: string[]): Promise<string[]> {
  // Pre-filter: remove aggregator/social domains, deduplicate
  const candidates = [...new Set(
    links.filter((href) => {
      try {
        const host = new URL(href).hostname.replace('www.', '');
        return !AGGREGATOR_DOMAINS.has(host) && !AGGREGATOR_DOMAINS.has(host.split('.').slice(-2).join('.'));
      } catch { return false; }
    })
  )].slice(0, 20); // cap at 20 candidates

  if (candidates.length === 0) return [];

  // Few-shot prompt to teach Claude what "official website" means
  const prompt = `You are finding the official website(s) for a NYC event. Given an event title and a list of URLs found on an aggregator page, return only the URLs that are the event's own official website — the organizer's site, venue's event page, or ticketing page for this specific event.

RULES:
- Include: organizer website, venue event page, official ticketing page for this specific event
- Exclude: social media (Instagram, Facebook, Twitter), music platforms (Spotify, Bandcamp), review sites (Yelp, TripAdvisor), other aggregators
- If a URL is for a specific tour/event page on the organizer's site, prefer that over their homepage
- Return a JSON array of URLs. Return [] if none are clearly official.

EXAMPLES:

Example 1:
Event: "Lower Manhattan Irish History Tour"
Aggregator: nyctourism.com
Candidates: ["https://fortythievestours.com/tour/lower-manhattan-walking-tour-exploring-irish-history/", "https://www.instagram.com/fortythievestours/", "https://www.tripadvisor.com/Attraction_Review-g60763"]
Answer: ["https://fortythievestours.com/tour/lower-manhattan-walking-tour-exploring-irish-history/"]

Example 2:
Event: "Jazz Night at Blue Note"
Aggregator: nycgo.com
Candidates: ["https://www.bluenote.net/event/jazz-night/", "https://www.ticketmaster.com/event/abc123", "https://www.facebook.com/bluenotenyc", "https://www.yelp.com/biz/blue-note"]
Answer: ["https://www.bluenote.net/event/jazz-night/", "https://www.ticketmaster.com/event/abc123"]

Example 3:
Event: "Brooklyn Flea Market"
Aggregator: theskint.com
Candidates: ["https://www.brooklynflea.com/markets/fort-greene/", "https://www.instagram.com/brooklynflea/", "https://maps.google.com/?q=brooklyn+flea"]
Answer: ["https://www.brooklynflea.com/markets/fort-greene/"]

Example 4:
Event: "MoMA Free Friday Nights"
Aggregator: nycforfree.com
Candidates: ["https://www.facebook.com/MuseumModernArt", "https://www.youtube.com/moma"]
Answer: []

Now answer for:
Event: "${eventTitle}"
Aggregator: ${aggregatorUrl}
Candidates: ${JSON.stringify(candidates)}
Answer:`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = message.content[0].type === 'text' ? message.content[0].text : '[]';
    const match = text.match(/\[[\s\S]*?\]/);
    if (!match) return [];
    const urls = JSON.parse(match[0]) as string[];
    return urls.filter((u) => typeof u === 'string' && u.startsWith('http'));
  } catch {
    return [];
  }
}

// ── Step 2: Extract data from official page content ───────────

async function extractFromOfficialPages(event: EventRow, pageContents: { url: string; text: string }[]): Promise<EnrichResult> {
  if (pageContents.length === 0) return {};

  const pagesSection = pageContents
    .map(({ url, text }) => `--- Official page: ${url} ---\n${text}`)
    .join('\n\n');

  // Few-shot prompt for data extraction from official content
  const prompt = `You are extracting accurate event data from official website content. Use ONLY the information explicitly stated on the official pages below. Do NOT guess or infer from the event title alone.

RULES:
- "borough": derive strictly from the address shown on the page (Brooklyn address = Brooklyn, not Manhattan)
- "address": use the exact address as written on the official page
- "is_free": only set if price is explicitly stated. true = free, false = paid
- "description": 1-2 punchy sentences (max 250 chars) describing what this event IS. No "Join us", no ticket info, no HTML artifacts. If event happens at multiple locations, briefly note that.
- "category": only re-classify if clearly wrong
- Set any field to null if not confirmed on the page
- Return ONLY a JSON object, no other text

EXAMPLES:

Example 1:
Official page content: "...Forty Thieves Tours presents a 2-hour walking tour through Lower Manhattan's Irish immigrant history. Departures from Bowling Green, Manhattan, NY 10004. $35 per person..."
Current data: title="Lower Manhattan Irish History Tour", borough="Manhattan", is_free=true
Answer: {"borough":"Manhattan","address":"Bowling Green, Manhattan, NY 10004","is_free":false,"description":"2-hour walking tour through Lower Manhattan's Irish immigrant history with Forty Thieves Tours. Departs from Bowling Green.","category":"outdoors"}

Example 2:
Official page content: "...Brooklyn Flea is open every Saturday at 80 Ferry St, Brooklyn, NY 11201. Free admission. Over 100 vendors selling vintage furniture, clothing, jewelry and food..."
Current data: borough="Manhattan", is_free=false
Answer: {"borough":"Brooklyn","address":"80 Ferry St, Brooklyn, NY 11201","is_free":true,"description":"100+ vendors selling vintage furniture, clothing, jewelry, and street food every Saturday in Brooklyn.","category":"popups"}

Example 3:
Official page content: "...An immersive theater experience set in a 1920s hotel. Tickets from $120. Located at 530 W 27th St, New York, NY 10001..."
Current data: borough=null, category="nightlife"
Answer: {"borough":"Manhattan","address":"530 W 27th St, New York, NY 10001","is_free":false,"description":"Immersive theater experience set in a 1920s hotel environment. Tickets from $120.","category":"theater"}

Now extract for:
Current data: title="${event.title}", venue="${event.venue_name ?? 'unknown'}", current address="${event.address ?? 'unknown'}", borough="${event.borough ?? 'unknown'}", category="${event.category}", is_free=${event.is_free}

${pagesSection}
Answer:`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = message.content[0].type === 'text' ? message.content[0].text : '';
    const match = text.match(/\{[\s\S]*?\}/);
    if (!match) return {};
    return JSON.parse(match[0]) as EnrichResult;
  } catch {
    return {};
  }
}

// ── Main ──────────────────────────────────────────────────────

export async function enrichEvents(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('[Enrich] ANTHROPIC_API_KEY not set, skipping');
    return;
  }

  console.log('[Enrich] Starting web-verified LLM enrichment...');

  const { data: events, error } = await supabase
    .from('events')
    .select('id, title, description, venue_name, address, category, is_free, borough, tags, event_url, ticket_url')
    .gte('start_date', new Date().toISOString().split('T')[0])
    .limit(300);

  if (error || !events || events.length === 0) {
    console.log('[Enrich] No events:', error?.message ?? 'empty');
    return;
  }

  console.log(`[Enrich] Processing ${events.length} events...`);

  let updated = 0;
  let addressFixed = 0;

  for (const ev of events as EventRow[]) {
    const patch: Record<string, unknown> = {};

    // ── Step 0: Fix borough/address mismatch programmatically ──
    if (ev.address) {
      const inferred = boroughFromAddress(ev.address);
      if (inferred && inferred !== ev.borough) {
        patch.borough = inferred;
        addressFixed++;
      }
    }

    // ── Step 1: Find official URLs ────────────────────────────
    const officialUrls: string[] = [];

    if (ev.event_url) {
      const { links } = await fetchPage(ev.event_url);
      const found = await findOfficialUrls(ev.title, ev.event_url, links);
      officialUrls.push(...found);
    }

    // Always include ticket_url if it's from a non-aggregator domain
    if (ev.ticket_url) {
      try {
        const host = new URL(ev.ticket_url).hostname.replace('www.', '');
        if (!AGGREGATOR_DOMAINS.has(host)) officialUrls.push(ev.ticket_url);
      } catch { /* skip */ }
    }

    // Deduplicate
    const uniqueUrls = [...new Set(officialUrls)].slice(0, 3);

    // ── Step 2: Fetch official pages ──────────────────────────
    const pageContents: { url: string; text: string }[] = [];
    for (const url of uniqueUrls) {
      const { text } = await fetchPage(url);
      if (text) pageContents.push({ url, text });
    }

    // ── Step 3: Extract data from official content ────────────
    let result: EnrichResult = {};
    if (pageContents.length > 0) {
      try {
        result = await extractFromOfficialPages(ev as EventRow, pageContents);
      } catch (err) {
        console.warn(`[Enrich] LLM failed for ${ev.id}:`, (err as Error).message);
      }
    }

    // Apply results
    if (result.category && VALID_CATEGORIES.includes(result.category)) patch.category = result.category;
    if (typeof result.is_free === 'boolean') {
      patch.is_free = result.is_free;
      if (result.is_free) patch.price_min = 0;
    }
    // Borough: address-based fix takes priority; only use LLM if no fix yet
    if (!patch.borough && result.borough && VALID_BOROUGHS.includes(result.borough)) {
      patch.borough = result.borough;
    }
    if (result.description && result.description.length > 20) {
      patch.description = result.description.slice(0, 300).trim();
    }
    if (result.address && result.address.length > 5 && (!ev.address || result.address.length > ev.address.length)) {
      patch.address = result.address;
      // Re-check borough from corrected address
      const newBorough = boroughFromAddress(result.address);
      if (newBorough) patch.borough = newBorough;
    }
    if (result.venue_name && result.venue_name.length > 2) patch.venue_name = result.venue_name;

    if (Object.keys(patch).length > 0) {
      const { error: updateErr } = await supabase.from('events').update(patch).eq('id', ev.id);
      if (!updateErr) {
        updated++;
      } else {
        console.warn(`[Enrich] Update failed for ${ev.id}:`, updateErr.message);
      }
    }

    const officialNote = pageContents.length > 0 ? `(${pageContents.length} official page(s))` : '(no official pages found)';
    console.log(`[Enrich] ${ev.title.slice(0, 50)} ${officialNote}`);

    await new Promise((r) => setTimeout(r, 400));
  }

  console.log(`\n[Enrich] Done. Updated: ${updated} events (${addressFixed} borough auto-fixed from address)`);
}

// Run directly: npx tsx --env-file=.env lib/ingest/enrich.ts
if (process.argv[1] && process.argv[1].endsWith('enrich.ts')) {
  enrichEvents().catch(console.error);
}

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
  start_date?: string | null;
  end_date?: string | null;
}

interface EnrichResult {
  category?: string;
  is_free?: boolean;
  borough?: string | null;
  description?: string | null;
  address?: string | null;
  venue_name?: string | null;
  start_date?: string | null;  // YYYY-MM-DD in local ET time
  end_date?: string | null;
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

// ── Step 2: Extract data from page content ───────────────────
// sourceLabel: 'official' when we found real organizer pages, 'aggregator' as fallback

async function extractFromPages(
  event: EventRow,
  pageContents: { url: string; text: string }[],
  sourceLabel: 'official' | 'aggregator'
): Promise<EnrichResult> {
  if (pageContents.length === 0) return {};

  const pagesSection = pageContents
    .map(({ url, text }) => `--- ${sourceLabel === 'official' ? 'Official' : 'Aggregator'} page: ${url} ---\n${text}`)
    .join('\n\n');

  const strictnessNote = sourceLabel === 'official'
    ? 'These are OFFICIAL pages from the event organizer/venue. Extract all fields you can confirm. Set null for anything not explicitly stated — do NOT keep current data if the page doesn\'t confirm it.'
    : 'This is an aggregator page (not the official source). Only extract fields you are highly confident about. Set null for anything uncertain.';

  const prompt = `You are verifying NYC event data from ${sourceLabel} page content. ${strictnessNote}

RULES — apply to EVERY field:
- "venue_name": exact venue name as written on the page. null if not stated.
- "address": full address exactly as written. null if not stated.
- "borough": derived ONLY from the address (Brooklyn zip/name = Brooklyn, not Manhattan). null if address not found.
- "is_free": true if explicitly free, false if price mentioned, null if not stated.
- "description": 1-2 punchy sentences (max 250 chars) of what this event IS. No "Join us", no HTML, no ticket info. If multiple locations, note briefly. null if not enough info.
- "category": only change if clearly wrong. Valid: live_music, art, theater, comedy, workshops, fitness, food, outdoors, nightlife, popups.
- "start_date": date in YYYY-MM-DD using New York local time (NOT UTC). If page says "April 19" → "2026-04-19". null if not found.
- "end_date": YYYY-MM-DD, only if explicitly an end date. null otherwise.
- NEVER guess. NEVER infer from the event title. NEVER keep old data — if the page doesn't say it, return null.
- Return ONLY a JSON object with all 8 fields present (use null for unknowns), no other text.

EXAMPLES:

Example 1 (official page, strict):
Page: "...Forty Thieves Tours — 2-hour walking tour of Irish history in Lower Manhattan. Every Saturday 11am. Departs from Bowling Green Station exit, Manhattan, NY 10004. $35/person..."
Current: title="Lower Manhattan Irish History Tour", borough="Manhattan", is_free=true, start_date="2026-04-12"
Answer: {"venue_name":null,"address":"Bowling Green Station exit, Manhattan, NY 10004","borough":"Manhattan","is_free":false,"description":"Weekly 2-hour walking tour exploring Irish immigrant history in Lower Manhattan with Forty Thieves Tours.","category":"outdoors","start_date":null,"end_date":null}

Example 2 (official page, date correction):
Page: "...Yilian Cañizares — Saturday, April 19, 2026. Doors 7pm, Show 8pm. Zankel Hall, Carnegie Hall, 881 7th Ave, New York, NY 10019. Tickets $45..."
Current: title="Yilian Cañizares", borough="Manhattan", is_free=false, start_date="2026-04-20"
Answer: {"venue_name":"Zankel Hall, Carnegie Hall","address":"881 7th Ave, New York, NY 10019","borough":"Manhattan","is_free":false,"description":"Cuban-Swiss jazz violinist performs at Carnegie Hall's Zankel Hall. Doors 7pm, show 8pm.","category":"live_music","start_date":"2026-04-19","end_date":null}

Example 3 (official page, borough correction):
Page: "...Brooklyn Flea — every Saturday at 80 Ferry St, Brooklyn, NY 11201. Free admission. 100+ vendors: vintage furniture, clothing, food..."
Current: borough="Manhattan", is_free=false, start_date="2026-04-12"
Answer: {"venue_name":"Brooklyn Flea","address":"80 Ferry St, Brooklyn, NY 11201","borough":"Brooklyn","is_free":true,"description":"Weekly outdoor flea market with 100+ vendors selling vintage furniture, clothing, jewelry, and street food.","category":"popups","start_date":null,"end_date":null}

Example 4 (page with no useful info):
Page: "...Sign up for our newsletter. Follow us on social media. Check back soon for updates..."
Current: title="Some Event", borough="Queens", is_free=false, start_date="2026-04-15"
Answer: {"venue_name":null,"address":null,"borough":null,"is_free":null,"description":null,"category":null,"start_date":null,"end_date":null}

Now extract for:
Current data: title="${event.title}", venue="${event.venue_name ?? 'unknown'}", address="${event.address ?? 'unknown'}", borough="${event.borough ?? 'unknown'}", category="${event.category}", is_free=${event.is_free}, start_date="${event.start_date ?? 'unknown'}"

${pagesSection}
Answer:`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = message.content[0].type === 'text' ? message.content[0].text : '';
    console.log(`  [LLM raw] ${text.trim()}`);

    const match = text.match(/\{[\s\S]*?\}/);
    if (!match) {
      console.warn('  [LLM] Could not parse JSON from response');
      return {};
    }
    return JSON.parse(match[0]) as EnrichResult;
  } catch (err) {
    console.warn('  [LLM] Parse error:', (err as Error).message);
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
    .select('id, title, description, venue_name, address, category, is_free, borough, tags, event_url, ticket_url, start_date, end_date')
    .gte('start_date', new Date().toISOString().split('T')[0])
    .limit(30);

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

    // ── Step 3: Extract data ──────────────────────────────────
    // Try official pages first; fall back to aggregator page content
    let result: EnrichResult = {};
    let sourceLabel: 'official' | 'aggregator' = 'official';

    if (pageContents.length > 0) {
      try {
        result = await extractFromPages(ev, pageContents, 'official');
      } catch (err) {
        console.warn(`[Enrich] LLM failed for ${ev.id}:`, (err as Error).message);
      }
    } else if (ev.event_url) {
      // No official pages found — fall back to aggregator page itself
      sourceLabel = 'aggregator';
      try {
        const { text: aggText } = await fetchPage(ev.event_url);
        if (aggText) {
          result = await extractFromPages(ev, [{ url: ev.event_url, text: aggText }], 'aggregator');
        }
      } catch (err) {
        console.warn(`[Enrich] Aggregator fallback failed for ${ev.id}:`, (err as Error).message);
      }
    }

    // ── Step 4: Apply results ─────────────────────────────────
    // When official pages were found, we trust the LLM fully — null means "not on page".
    // When only aggregator, we only apply confident non-null results.
    const isOfficial = sourceLabel === 'official' && pageContents.length > 0;

    // category
    if (result.category && VALID_CATEGORIES.includes(result.category)) {
      patch.category = result.category;
    }

    // is_free — boolean NOT NULL in DB, so never write null
    if (typeof result.is_free === 'boolean') {
      patch.is_free = result.is_free;
      if (result.is_free) patch.price_min = 0;
    }

    // address — official: overwrite even with null; aggregator: only if better
    if (isOfficial) {
      if (result.address && result.address.length > 5) {
        patch.address = result.address;
      } else if (result.address === null) {
        patch.address = null;
      }
    } else if (result.address && result.address.length > 5) {
      if (!ev.address || result.address.length > ev.address.length) {
        patch.address = result.address;
      }
    }

    // borough — re-derive from address if address was updated; otherwise use LLM result
    const finalAddress = (patch.address as string | null | undefined) ?? ev.address;
    if (finalAddress) {
      const derived = boroughFromAddress(finalAddress);
      if (derived) {
        patch.borough = derived;
      } else if (isOfficial && result.borough === null) {
        patch.borough = null;
      } else if (result.borough && VALID_BOROUGHS.includes(result.borough)) {
        patch.borough = result.borough;
      }
    } else if (!patch.borough) {
      // address-based fix from Step 0 already applied if applicable
    }

    // venue_name
    if (result.venue_name && result.venue_name.length > 2) {
      patch.venue_name = result.venue_name;
    } else if (isOfficial && result.venue_name === null) {
      patch.venue_name = null;
    }

    // description
    if (result.description && result.description.length > 20) {
      patch.description = result.description.slice(0, 300).trim();
    } else if (isOfficial && result.description === null) {
      patch.description = null;
    }

    // start_date — only correct if LLM found a specific date
    if (result.start_date && /^\d{4}-\d{2}-\d{2}$/.test(result.start_date)) {
      const stored = ev.start_date?.slice(0, 10);
      if (stored && result.start_date !== stored) {
        patch.start_date = result.start_date;
        console.log(`  [Date fix] ${stored} → ${result.start_date}`);
      }
    }
    if (result.end_date && /^\d{4}-\d{2}-\d{2}$/.test(result.end_date)) {
      patch.end_date = result.end_date;
    }

    if (Object.keys(patch).length > 0) {
      const { error: updateErr } = await supabase.from('events').update(patch).eq('id', ev.id);
      if (!updateErr) {
        updated++;
      } else {
        console.warn(`[Enrich] Update failed for ${ev.id}:`, updateErr.message);
      }
    }

    const officialNote = pageContents.length > 0
      ? `✓ ${pageContents.length} official page(s)`
      : sourceLabel === 'aggregator' ? '~ aggregator fallback'
      : '✗ no pages';
    console.log(`[Enrich] ${ev.title.slice(0, 50)} ${officialNote}`);

    await new Promise((r) => setTimeout(r, 400));
  }

  console.log(`\n[Enrich] Done. Updated: ${updated} events (${addressFixed} borough auto-fixed from address)`);
}

// Run directly: npx tsx --env-file=.env lib/ingest/enrich.ts
if (process.argv[1] && process.argv[1].endsWith('enrich.ts')) {
  enrichEvents().catch(console.error);
}

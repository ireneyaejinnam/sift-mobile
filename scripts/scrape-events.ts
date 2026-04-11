/**
 * Scrape event data from source listing pages using Claude Sonnet.
 *
 * Pipeline per source URL:
 *   1. Fetch the listing page, extract individual event links
 *   2. For each event link:
 *      a. Fetch the aggregator/listing page
 *      b. LLM picks official website links (not aggregators)
 *      c. Fetch each official page
 *      d. If results are thin, follow same-domain sub-links (tickets, schedule, etc.)
 *      e. LLM extracts fully structured event data
 *   3. Output all events to a JSON file ready for import-test-data.ts
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/scrape-events.ts           # uses default sources
 *   npx tsx --env-file=.env scripts/scrape-events.ts <url1> [url2 ...]  # custom sources
 *
 * Output:
 *   Directly upserts into test_events + test_event_sessions in Supabase.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { parse } from 'node-html-parser';
import * as fs from 'fs';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const MODEL = 'claude-sonnet-4-6';

// Known aggregator/social domains — never treat as "official"
const AGGREGATOR_DOMAINS = new Set([
  'eventbrite.com', 'ticketmaster.com', 'facebook.com', 'instagram.com',
  'twitter.com', 'x.com', 'youtube.com', 'meetup.com', 'dice.fm',
  'residentadvisor.net', 'ra.co', 'nyctourism.com', 'nycgo.com',
  'timeout.com', 'theskint.com', 'nycforfree.co', 'nycforfree.com',
  'cozycreatives.com', 'yelp.com', 'tripadvisor.com', 'google.com',
  'apple.com', 'spotify.com', 'bandcamp.com', 'soundcloud.com',
  'squarespace.com', 'linktree.com',
]);

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9',
};

// ── Web fetch ─────────────────────────────────────────────────

async function fetchPage(url: string, timeoutMs = 12_000): Promise<{ text: string; links: string[]; subLinks: string[] }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal, headers: FETCH_HEADERS });
    clearTimeout(timer);
    if (!res.ok) return { text: '', links: [], subLinks: [] };

    const html = await res.text();
    const root = parse(html);

    const links: string[] = [];
    const subLinks: string[] = [];
    const baseHost = new URL(url).hostname.replace('www.', '');

    root.querySelectorAll('a[href]').forEach((a) => {
      const href = a.getAttribute('href') ?? '';
      if (!href.startsWith('http')) return;
      try {
        const linkHost = new URL(href).hostname.replace('www.', '');
        if (linkHost !== baseHost) links.push(href);
        else subLinks.push(href);
      } catch { /* skip */ }
    });

    root.querySelectorAll('script, style, nav, footer, header, iframe, noscript').forEach((n) => n.remove());

    const focusSelectors = ['article', 'main', '[class*="event"]', '[class*="content"]', '[id*="event"]', '[id*="content"]'];
    for (const sel of focusSelectors) {
      const node = root.querySelector(sel);
      if (node) {
        const text = node.text.replace(/\s+/g, ' ').trim();
        if (text.length > 200) return { text: text.slice(0, 6000), links, subLinks };
      }
    }
    const text = (root.querySelector('body')?.text ?? root.text).replace(/\s+/g, ' ').trim().slice(0, 6000);
    return { text, links, subLinks };
  } catch {
    return { text: '', links: [], subLinks: [] };
  }
}

// ── Step 1: Discover individual event links from a listing page ──

async function discoverEventLinks(sourceUrl: string, allLinks: string[]): Promise<string[]> {
  // Same-domain links are more likely to be individual event pages
  const sameHostLinks = allLinks;

  const prompt = `You are finding individual event page URLs from an NYC event listing website.

Given the source listing URL and a list of links found on that page, return ONLY the links that are individual event detail pages — not category pages, not the homepage, not pagination.

Source: ${sourceUrl}
Links found: ${JSON.stringify([...new Set(sameHostLinks)].slice(0, 60))}

Return a JSON array of URLs that are individual event pages. Return [] if none found.
Answer:`;

  try {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = msg.content[0].type === 'text' ? msg.content[0].text : '[]';
    const match = text.match(/\[[\s\S]*?\]/);
    if (!match) return [];
    const urls = JSON.parse(match[0]) as string[];
    return urls.filter((u) => typeof u === 'string' && u.startsWith('http'));
  } catch {
    return [];
  }
}

// ── Step 2: Find official URLs from aggregator/listing page ──

async function findOfficialUrls(eventTitle: string, aggregatorUrl: string, links: string[]): Promise<string[]> {
  const candidates = [...new Set(
    links.filter((href) => {
      try {
        const host = new URL(href).hostname.replace('www.', '');
        return !AGGREGATOR_DOMAINS.has(host) && !AGGREGATOR_DOMAINS.has(host.split('.').slice(-2).join('.'));
      } catch { return false; }
    })
  )].slice(0, 25);

  if (candidates.length === 0) return [];

  const prompt = `You are finding the official website(s) for a NYC event. Given an event title and URLs found on an aggregator page, return only the URLs that are the event's own official website — the organizer's site, venue's event page, or ticketing page for this specific event.

INCLUDE: organizer website, venue event page, official ticketing page (e.g. Eventbrite, DICE, Ticketmaster pages for THIS specific event are OK as ticket_url)
EXCLUDE: social media, music platforms (Spotify, Bandcamp), review sites (Yelp, TripAdvisor), general aggregators

Return a JSON array of objects: [{"url": "...", "type": "official" | "ticket"}]
Prefer a specific event page over a homepage. Return [] if none found.

Event: "${eventTitle}"
Aggregator: ${aggregatorUrl}
Candidates: ${JSON.stringify(candidates)}
Answer:`;

  try {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = msg.content[0].type === 'text' ? msg.content[0].text : '[]';
    const match = text.match(/\[[\s\S]*?\]/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]);
    // Accept both [{url, type}] and plain string array for robustness
    return (parsed as any[])
      .map((item) => typeof item === 'string' ? item : item?.url)
      .filter((u): u is string => typeof u === 'string' && u.startsWith('http'));
  } catch {
    return [];
  }
}

// ── Step 3: Extract structured event data from page content ──

interface SessionInput {
  date: string;
  time?: string;
  venue_name?: string;
  address?: string;
  borough?: string;
  price_min?: number;
  price_max?: number;
}

interface EventOutput {
  source_id: string;
  title: string;
  category: string;
  description?: string;
  start_date: string;
  end_date?: string;
  venue_name?: string;
  address?: string;
  borough?: string;
  price_min?: number;
  price_max?: number;
  is_free: boolean;
  event_url?: string;
  ticket_url?: string;
  image_url?: string;
  tags?: string[];
  sessions?: SessionInput[];
}

async function extractEventData(
  eventUrl: string,
  pageContents: { url: string; text: string; type: 'aggregator' | 'official' | 'ticket' }[]
): Promise<EventOutput | null> {
  if (pageContents.length === 0) return null;

  const today = new Date().toISOString().split('T')[0];
  const pagesSection = pageContents
    .map(({ url, text, type }) => `--- ${type.toUpperCase()} PAGE: ${url} ---\n${text}`)
    .join('\n\n');

  const prompt = `You are extracting NYC event data to build a structured JSON object. Use ALL provided pages together — aggregator page for context, official/ticket pages for accuracy.

Today is ${today}. Only extract events happening on or after today.

Extract ONE event object with these fields:

source_id (required): slug format "{source}-{event-slug}-{YYYY-MM}". Source = domain name without TLD (e.g. "nycforfree", "timeout", "bam"). Slug = 3-5 word lowercase hyphenated event name. Month = first session month.

title (required): Event name exactly as listed.

category (required): One of: art, live_music, comedy, food, outdoors, nightlife, popups, fitness, theater, workshops

description (optional): 1–3 punchy sentences. No "Join us", no ticket info. Mention if multi-venue or recurring.

start_date (required): YYYY-MM-DD of first/earliest occurrence.

end_date (optional): YYYY-MM-DD of last occurrence, only if spans multiple days.

venue_name (optional): Primary venue name.

address (optional): Full street address with city, state, zip.

borough (optional): One of: Manhattan, Brooklyn, Queens, Bronx, Staten Island. Derive from address.

price_min (optional): Lowest per-session price in USD. 0 if free. Do NOT use weekend pass or bundle prices.

price_max (optional): Highest per-session price. Omit if same as price_min.

is_free (required): true ONLY if entirely free with no paid tiers.

event_url (optional): URL of the official event page (not aggregator).

ticket_url (optional): Direct ticket purchase link if different from event_url.

image_url (optional): Direct image URL ending in .jpg, .jpeg, .png, or .webp only.

tags (optional): 3–6 short lowercase keywords relevant to the event.

sessions (optional): Include ONLY if the event has multiple distinct occurrences (different dates or different showtimes on the same day). Each session:
  - date (required): YYYY-MM-DD
  - time (optional): e.g. "7 PM", "10:30 AM"
  - venue_name, address, borough (optional): only if different from primary
  - price_min, price_max (optional): only if different from primary

RULES:
- Never guess. If a field isn't clearly stated, omit it.
- If this is a recurring/multi-date event, list ALL upcoming sessions individually.
- start_date must match the earliest upcoming session date.
- Return ONLY a valid JSON object, no other text.
- Return null if the event has already passed or is not in NYC.

${pagesSection}

Answer:`;

  try {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    });
    const raw = msg.content[0].type === 'text' ? msg.content[0].text : '';
    const stripped = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();

    if (stripped.toLowerCase() === 'null' || stripped === '') return null;

    const match = stripped.match(/\{[\s\S]*\}/);
    if (!match) return null;

    const parsed = JSON.parse(match[0]) as EventOutput;

    // Basic validation
    if (!parsed.title || !parsed.start_date || !parsed.category) return null;
    if (parsed.start_date < today) {
      // Check if any session is still upcoming
      const hasUpcoming = parsed.sessions?.some((s) => s.date >= today);
      if (!hasUpcoming) return null;
    }

    // Always set event_url if not set
    if (!parsed.event_url) parsed.event_url = eventUrl;

    return parsed;
  } catch (err) {
    console.warn(`  [LLM] Parse error: ${(err as Error).message}`);
    return null;
  }
}

// ── Process one event URL ─────────────────────────────────────

async function processEventUrl(eventUrl: string): Promise<EventOutput | null> {
  console.log(`  Processing: ${eventUrl}`);

  // Fetch the listing/aggregator page
  const { text: aggText, links } = await fetchPage(eventUrl);
  if (!aggText) {
    console.log(`    ✗ Could not fetch page`);
    return null;
  }

  const pageContents: { url: string; text: string; type: 'aggregator' | 'official' | 'ticket' }[] = [
    { url: eventUrl, text: aggText, type: 'aggregator' },
  ];

  // Find title hint from page text (first 200 chars)
  const titleHint = aggText.slice(0, 200);

  // Find official URLs
  const officialUrls = await findOfficialUrls(titleHint, eventUrl, links);

  const fetchedUrls = new Set<string>([eventUrl]);
  const officialSubLinks: string[] = [];

  for (const url of officialUrls.slice(0, 3)) {
    if (fetchedUrls.has(url)) continue;
    fetchedUrls.add(url);

    const { text, subLinks } = await fetchPage(url);
    if (text) {
      // Determine type: known ticket domains → ticket, else official
      const host = new URL(url).hostname.replace('www.', '');
      const isTicket = ['eventbrite.com', 'ticketmaster.com', 'dice.fm', 'tix.com', 'axs.com', 'seetickets.com'].some((d) => host.includes(d));
      pageContents.push({ url, text, type: isTicket ? 'ticket' : 'official' });
      officialSubLinks.push(...subLinks);
    }
  }

  // First extraction attempt
  let result = await extractEventData(eventUrl, pageContents);

  // If thin (no date, no address, no sessions) → follow promising sub-links
  const isThin = !result || (!result.sessions?.length && !result.address && result.start_date === undefined);
  if (isThin && officialSubLinks.length > 0) {
    const EVENT_PATH_RE = /\/(event|tour|show|concert|exhibit|performance|schedule|ticket|book|program|agenda|calendar)/i;
    const subCandidates = [...new Set(officialSubLinks)]
      .filter((link) => EVENT_PATH_RE.test(link) && !fetchedUrls.has(link))
      .slice(0, 2);

    for (const url of subCandidates) {
      fetchedUrls.add(url);
      const { text } = await fetchPage(url);
      if (text) {
        pageContents.push({ url, text, type: 'official' });
        console.log(`    → followed sub-link: ${url}`);
      }
    }

    if (subCandidates.length > 0) {
      result = await extractEventData(eventUrl, pageContents);
    }
  }

  if (result) {
    const sessionCount = result.sessions?.length ?? 1;
    console.log(`    ✓ ${result.title} — ${result.category} — ${sessionCount} session(s)`);
  } else {
    console.log(`    ✗ Could not extract event data`);
  }

  return result;
}

// ── Main ──────────────────────────────────────────────────────

// Web-scraping sources (non-API). API-based sources (Ticketmaster, Eventbrite, etc.)
// are handled by their existing ingest scripts and don't benefit from LLM scraping.
const DEFAULT_SOURCES = [
  'https://www.nycforfree.co/events',
  'https://theskint.com',
  'https://dice.fm/browse/new-york',
  'https://www.nyc.gov/events/',
];

async function main() {
  const args = process.argv.slice(2);

  // Collect source URLs — fall back to defaults if none provided
  let sourceUrls: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' && args[i + 1]) {
      const lines = fs.readFileSync(args[++i], 'utf-8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
      sourceUrls.push(...lines);
    } else {
      sourceUrls.push(args[i]);
    }
  }
  if (sourceUrls.length === 0) {
    sourceUrls = DEFAULT_SOURCES;
    console.log('[Scrape] No URLs provided — using default sources');
  }

  sourceUrls = [...new Set(sourceUrls)];
  console.log(`\n[Scrape] ${sourceUrls.length} source URL(s)\n`);

  const allEvents: EventOutput[] = [];
  const seenTitles = new Set<string>();

  for (const sourceUrl of sourceUrls) {
    console.log(`\n[Source] ${sourceUrl}`);

    const { text, links, subLinks } = await fetchPage(sourceUrl);
    if (!text) {
      console.log('  ✗ Could not fetch source page');
      continue;
    }

    // Discover individual event links
    const allPageLinks = [...links, ...subLinks];
    const eventLinks = await discoverEventLinks(sourceUrl, allPageLinks);

    if (eventLinks.length === 0) {
      // Source URL itself might be a single event page
      console.log('  No sub-links found — treating source URL as single event page');
      const result = await processEventUrl(sourceUrl);
      if (result && !seenTitles.has(result.title.toLowerCase())) {
        seenTitles.add(result.title.toLowerCase());
        allEvents.push(result);
      }
      continue;
    }

    console.log(`  Found ${eventLinks.length} event link(s)`);

    // Process in batches of 5
    const BATCH = 5;
    for (let i = 0; i < eventLinks.length; i += BATCH) {
      const batch = eventLinks.slice(i, i + BATCH);
      console.log(`\n  Batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(eventLinks.length / BATCH)}`);

      for (const url of batch) {
        const result = await processEventUrl(url);
        if (result && !seenTitles.has(result.title.toLowerCase())) {
          seenTitles.add(result.title.toLowerCase());
          allEvents.push(result);
        }
        await new Promise((r) => setTimeout(r, 800)); // rate limit
      }
    }
  }

  // ── Upsert to Supabase test tables ───────────────────────────
  console.log(`\n[Upsert] Writing ${allEvents.length} events to test_events...`);
  let inserted = 0;
  let errors = 0;

  for (const ev of allEvents) {
    const { data: upserted, error: evErr } = await supabase
      .from('test_events')
      .upsert({
        source:      'scrape',
        source_id:   ev.source_id,
        title:       ev.title,
        description: ev.description ?? null,
        category:    ev.category,
        start_date:  ev.start_date,
        end_date:    ev.end_date ?? null,
        venue_name:  ev.venue_name ?? null,
        address:     ev.address ?? null,
        borough:     ev.borough ?? null,
        price_min:   ev.price_min ?? null,
        price_max:   ev.price_max ?? null,
        is_free:     ev.is_free,
        event_url:   ev.event_url ?? null,
        ticket_url:  ev.ticket_url ?? null,
        image_url:   ev.image_url ?? null,
        tags:        ev.tags ?? [],
      }, { onConflict: 'source,source_id' })
      .select('id')
      .single();

    if (evErr || !upserted) {
      console.error(`  ✗ ${ev.source_id}: ${evErr?.message}`);
      errors++;
      continue;
    }

    const eventId = upserted.id as string;
    const today = new Date().toISOString().split('T')[0];

    const sessions = ev.sessions?.length
      ? ev.sessions
      : [{ date: ev.start_date, time: undefined, venue_name: ev.venue_name, address: ev.address, borough: ev.borough, price_min: ev.price_min, price_max: ev.price_max }];

    const seen = new Set<string>();
    const sessionRows = sessions
      .filter((s) => !!s.date && s.date >= today)
      .map((s) => ({
        event_id:   eventId,
        date:       s.date.slice(0, 10),
        time:       s.time ?? '',
        venue_name: s.venue_name ?? null,
        address:    s.address ?? null,
        borough:    s.borough ?? null,
        price_min:  s.price_min ?? null,
        price_max:  s.price_max ?? null,
      }))
      .filter((s) => {
        const key = `${s.date}::${s.time}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    if (sessionRows.length > 0) {
      const { error: sessErr } = await supabase
        .from('test_event_sessions')
        .upsert(sessionRows, { onConflict: 'event_id,date,time' });
      if (sessErr) {
        console.error(`  ✗ sessions for ${ev.source_id}: ${sessErr.message}`);
        errors++;
        continue;
      }
    }

    console.log(`  ✓ ${ev.title} (${sessionRows.length} session${sessionRows.length === 1 ? '' : 's'})`);
    inserted++;
  }

  console.log(`\n[Done] ${inserted} inserted, ${errors} errors.`);
}

main().catch(console.error);

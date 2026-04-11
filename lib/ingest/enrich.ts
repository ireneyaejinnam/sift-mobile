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
import { isNYCAddress } from './normalize';

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

interface DBSession {
  date: string;
  time?: string;
  venue_name?: string;
  address?: string;
  borough?: string;
  price_min?: number;
  price_max?: number;
}

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
  price_min?: number | null;
  price_max?: number | null;
}

interface EnrichResult {
  category?: string;
  is_free?: boolean | null;
  borough?: string | null;
  description?: string | null;
  address?: string | null;
  venue_name?: string | null;
  start_date?: string | null;   // YYYY-MM-DD (earliest session)
  end_date?: string | null;
  price_min?: number | null;
  price_max?: number | null;
  sessions?: DBSession[] | null; // all sessions extracted from official page
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

async function fetchPage(url: string, timeoutMs = 10_000): Promise<{ text: string; links: string[]; subLinks: string[] }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal, headers: FETCH_HEADERS });
    clearTimeout(timer);
    if (!res.ok) return { text: '', links: [], subLinks: [] };

    const html = await res.text();
    const root = parse(html);

    // External links (for findOfficialUrls) and same-domain sub-links (for follow-up)
    const links: string[] = [];
    const subLinks: string[] = [];
    const baseHost = new URL(url).hostname.replace('www.', '');
    root.querySelectorAll('a[href]').forEach((a) => {
      const href = a.getAttribute('href') ?? '';
      if (!href.startsWith('http')) return;
      try {
        const linkHost = new URL(href).hostname.replace('www.', '');
        if (linkHost !== baseHost) {
          links.push(href);
        } else {
          subLinks.push(href);
        }
      } catch { /* skip malformed */ }
    });

    // Strip noise and extract readable text
    root.querySelectorAll('script, style, nav, footer, header, iframe, noscript').forEach((n) => n.remove());
    const focusSelectors = ['article', 'main', '[class*="event"]', '[class*="content"]', '[id*="event"]', '[id*="content"]'];
    for (const sel of focusSelectors) {
      const node = root.querySelector(sel);
      if (node) {
        const text = node.text.replace(/\s+/g, ' ').trim();
        if (text.length > 200) return { text: text.slice(0, 4000), links, subLinks };
      }
    }
    const text = (root.querySelector('body')?.text ?? root.text).replace(/\s+/g, ' ').trim().slice(0, 4000);
    return { text, links, subLinks };
  } catch {
    return { text: '', links: [], subLinks: [] };
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
    ? 'These are OFFICIAL pages from the event organizer/venue. Extract all fields you can confirm. Set null for anything not explicitly stated.'
    : 'This is an aggregator page (not the official source). Extract all fields you can confirm. Set null for anything not explicitly stated.';

  const prompt = `You are verifying NYC event data from ${sourceLabel} page content. ${strictnessNote}

Extract all sessions (date + time + location + price) found on the page. A "session" is one specific performance/occurrence of the event.

TOP-LEVEL FIELDS (summary):
- "venue_name": primary/first venue. null if not found.
- "address": primary/first full address. null if not found.
- "borough": derived ONLY from primary address. null if not found.
- "is_free": true=free, false=paid, null=not stated.
- "description": 1-2 punchy sentences (max 250 chars). No "Join us", no HTML, no ticket info. Note if multi-venue. null if not enough info.
- "category": only change if clearly wrong. Valid: live_music, art, theater, comedy, workshops, fitness, food, outdoors, nightlife, popups.
- "start_date": YYYY-MM-DD of earliest session (NY local time). null if not found.
- "end_date": YYYY-MM-DD of latest session if multiple. null if single session.
- "price_min": lowest price across all sessions (number, no $). null if not found.
- "price_max": highest price across all sessions. null if same as price_min or not found.

SESSIONS ARRAY — list EVERY distinct session found on the page:
- "sessions": array of objects, each with:
  - "date": YYYY-MM-DD (required — skip session if date not found)
  - "time": e.g. "7:00 PM" (null if not stated)
  - "venue_name": venue for this session (null if same as primary or not stated)
  - "address": full address for this session (null if same as primary)
  - "borough": derived from this session's address (null if same or not found)
  - "price_min": number (null if not stated)
  - "price_max": number, only if explicitly different from price_min (null otherwise)
- If only one session found, still include it as a 1-element array.
- null if no dates at all found on page.

RULES:
- NEVER guess. NEVER infer. NEVER keep old data — null means not on page.
- Return ONLY a JSON object with all 11 fields, no other text.

EXAMPLES:

Example 1 (single session, official):
Page: "...Yilian Cañizares — Saturday, April 19, 2026. Doors 7pm, Show 8pm. Zankel Hall, Carnegie Hall, 881 7th Ave, New York, NY 10019. Tickets $45..."
Current: title="Yilian Cañizares", start_date="2026-04-20"
Answer: {"venue_name":"Zankel Hall, Carnegie Hall","address":"881 7th Ave, New York, NY 10019","borough":"Manhattan","is_free":false,"description":"Cuban-Swiss jazz violinist performs at Carnegie Hall's Zankel Hall. Doors 7pm, show 8pm.","category":"live_music","start_date":"2026-04-19","end_date":null,"price_min":45,"price_max":null,"sessions":[{"date":"2026-04-19","time":"8:00 PM","venue_name":null,"address":null,"borough":null,"price_min":45,"price_max":null}]}

Example 2 (multiple sessions, same venue):
Page: "...Jazz Night — Apr 18 & Apr 25, 2026, 8pm. Blue Note, 131 W 3rd St, New York, NY 10012. Tickets $30–$50..."
Answer: {"venue_name":"Blue Note","address":"131 W 3rd St, New York, NY 10012","borough":"Manhattan","is_free":false,"description":"Live jazz nights at Blue Note in Greenwich Village. Two April performances.","category":"live_music","start_date":"2026-04-18","end_date":"2026-04-25","price_min":30,"price_max":50,"sessions":[{"date":"2026-04-18","time":"8:00 PM","venue_name":null,"address":null,"borough":null,"price_min":30,"price_max":50},{"date":"2026-04-25","time":"8:00 PM","venue_name":null,"address":null,"borough":null,"price_min":30,"price_max":50}]}

Example 3 (multiple sessions, different venues):
Page: "...The Art Show — April 12 at Brooklyn Museum (200 Eastern Pkwy, Brooklyn NY 11238) and April 19 at MoMA (11 W 53rd St, New York NY 10019). Free admission..."
Answer: {"venue_name":"Brooklyn Museum","address":"200 Eastern Pkwy, Brooklyn, NY 11238","borough":"Brooklyn","is_free":true,"description":"Art show touring Brooklyn Museum on Apr 12 and MoMA on Apr 19.","category":"art","start_date":"2026-04-12","end_date":"2026-04-19","price_min":0,"price_max":null,"sessions":[{"date":"2026-04-12","time":null,"venue_name":"Brooklyn Museum","address":"200 Eastern Pkwy, Brooklyn, NY 11238","borough":"Brooklyn","price_min":0,"price_max":null},{"date":"2026-04-19","time":null,"venue_name":"MoMA","address":"11 W 53rd St, New York, NY 10019","borough":"Manhattan","price_min":0,"price_max":null}]}

Example 4 (no useful info):
Page: "...Sign up for our newsletter. Follow us on social media..."
Answer: {"venue_name":null,"address":null,"borough":null,"is_free":null,"description":null,"category":null,"start_date":null,"end_date":null,"price_min":null,"price_max":null,"sessions":null}

Now extract for:
Current data: title="${event.title}", venue="${event.venue_name ?? 'unknown'}", address="${event.address ?? 'unknown'}", borough="${event.borough ?? 'unknown'}", category="${event.category}", is_free=${event.is_free}, start_date="${event.start_date ?? 'unknown'}"

${pagesSection}
Answer:`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = message.content[0].type === 'text' ? message.content[0].text : '';
    console.log(`  [LLM raw] ${raw.trim()}`);

    // Strip markdown code fences if present, then grab the outermost JSON object
    const stripped = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
    const match = stripped.match(/\{[\s\S]*\}/); // greedy — captures full outer object
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

export async function enrichEvents(batchSize = 50): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('[Enrich] ANTHROPIC_API_KEY not set, skipping');
    return;
  }

  console.log('[Enrich] Starting web-verified LLM enrichment...');

  const today = new Date().toISOString().split('T')[0];

  // Paginate through all upcoming events
  let offset = 0;
  let totalUpdated = 0;
  let totalAddressFixed = 0;
  let grandTotal = 0;

  while (true) {
    const { data: events, error } = await supabase
      .from('events')
      .select('id, title, description, venue_name, address, category, is_free, borough, tags, event_url, ticket_url, start_date, end_date, price_min, price_max')
      .gte('start_date', today)
      .order('start_date', { ascending: true })
      .range(offset, offset + batchSize - 1);

    if (error) {
      console.log('[Enrich] Fetch error:', error.message);
      break;
    }
    if (!events || events.length === 0) break;

    grandTotal += events.length;
    console.log(`[Enrich] Batch ${offset}–${offset + events.length - 1} (${events.length} events)...`);

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

    // ── Step 2: Fetch official pages, collect same-domain sub-links ──
    const pageContents: { url: string; text: string }[] = [];
    const officialSubLinks: string[] = [];
    const fetchedUrls = new Set<string>();

    for (const url of uniqueUrls) {
      const { text, subLinks } = await fetchPage(url);
      fetchedUrls.add(url);
      if (text) pageContents.push({ url, text });
      officialSubLinks.push(...subLinks);
    }

    // ── Step 3: Extract data ──────────────────────────────────
    let result: EnrichResult = {};
    let sourceLabel: 'official' | 'aggregator' = 'official';

    if (pageContents.length > 0) {
      try {
        result = await extractFromPages(ev, pageContents, 'official');
      } catch (err) {
        console.warn(`[Enrich] LLM failed for ${ev.id}:`, (err as Error).message);
      }

      // ── Step 3b: If results thin, follow relevant sub-links ──
      // "Thin" = no sessions, no date, no address found
      const isThin = !result.sessions?.length && !result.start_date && !result.address;
      if (isThin && officialSubLinks.length > 0) {
        const EVENT_PATH_RE = /\/(event|tour|show|concert|exhibit|performance|schedule|ticket|book|program|agenda|calendar)/i;
        const candidates = [...new Set(officialSubLinks)]
          .filter((link) => EVENT_PATH_RE.test(link) && !fetchedUrls.has(link))
          .slice(0, 2);

        if (candidates.length > 0) {
          const subContents: { url: string; text: string }[] = [];
          for (const url of candidates) {
            const { text } = await fetchPage(url);
            if (text) subContents.push({ url, text });
          }
          if (subContents.length > 0) {
            try {
              const subResult = await extractFromPages(ev, subContents, 'official');
              // Merge: sub-page fills in what the main page missed
              result = {
                ...result,
                sessions:     subResult.sessions     ?? result.sessions,
                start_date:   subResult.start_date   ?? result.start_date,
                end_date:     subResult.end_date      ?? result.end_date,
                address:      subResult.address      ?? result.address,
                venue_name:   subResult.venue_name   ?? result.venue_name,
                borough:      subResult.borough      ?? result.borough,
                price_min:    subResult.price_min    ?? result.price_min,
                price_max:    subResult.price_max    ?? result.price_max,
                description:  subResult.description  ?? result.description,
                is_free:      subResult.is_free      ?? result.is_free,
                category:     subResult.category     ?? result.category,
              };
              console.log(`  [Sub-links] fetched ${subContents.length} sub-page(s): ${candidates.join(', ')}`);
            } catch (err) {
              console.warn(`[Enrich] Sub-link LLM failed for ${ev.id}:`, (err as Error).message);
            }
          }
        }
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
    // Both official and aggregator now use the same strict prompt, so treat both equally.
    const isOfficial = pageContents.length > 0 || sourceLabel === 'aggregator';
    const corrections: string[] = [];

    // ── Helper: log field corrections ─────────────────────────
    function applyField(field: string, newVal: unknown, oldVal: unknown) {
      if (newVal === undefined) return;
      patch[field] = newVal;
      if (oldVal !== null && oldVal !== undefined && oldVal !== newVal) {
        corrections.push(`${field}: "${String(oldVal).slice(0, 40)}" → "${String(newVal).slice(0, 40)}"`);
      }
    }

    // category
    if (result.category && VALID_CATEGORIES.includes(result.category)) {
      applyField('category', result.category, ev.category);
    }

    // is_free — NOT NULL in DB
    if (typeof result.is_free === 'boolean') {
      applyField('is_free', result.is_free, ev.is_free);
    }

    // sessions — write to event_sessions table, update aggregate fields on events
    if (Array.isArray(result.sessions) && result.sessions.length > 0) {
      const validSessions: DBSession[] = result.sessions
        .filter((s): s is DBSession => typeof s?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.date) && s.date >= today);
      if (validSessions.length > 0) {
        // Upsert into event_sessions table
        const sessionRows = validSessions.map((s) => ({
          event_id: ev.id,
          date: s.date,
          time: s.time ?? null,
          venue_name: s.venue_name ?? null,
          address: s.address ?? null,
          borough: s.borough ?? null,
          price_min: s.price_min ?? null,
          price_max: s.price_max ?? null,
        }));
        const { error: sessErr } = await supabase
          .from('event_sessions')
          .upsert(sessionRows, { onConflict: 'event_id,date' });
        if (sessErr) console.warn(`  [Sessions] upsert error: ${sessErr.message}`);

        // Update aggregate fields on events
        const dates = validSessions.map((s) => s.date).sort();
        applyField('start_date', dates[0], ev.start_date?.slice(0, 10));
        applyField('end_date', dates.length > 1 ? dates[dates.length - 1] : null, ev.end_date);
        if (validSessions.length > 1) {
          corrections.push(`sessions: ${validSessions.length} session(s)`);
        }

        const mins = validSessions.map((s) => s.price_min).filter((p): p is number => p != null);
        const maxs = validSessions.map((s) => s.price_max ?? s.price_min).filter((p): p is number => p != null);
        if (mins.length > 0) {
          const pMin = Math.min(...mins);
          const pMax = maxs.length > 0 ? Math.max(...maxs) : null;
          applyField('price_min', pMin, ev.price_min);
          applyField('price_max', pMax, ev.price_max);
          applyField('is_free', pMin === 0, ev.is_free);
        }

        const first = validSessions[0];
        if (first.venue_name && first.venue_name.length > 2) applyField('venue_name', first.venue_name, ev.venue_name);
        else if (isOfficial && result.venue_name === null) applyField('venue_name', null, ev.venue_name);
        if (first.address && first.address.length > 5) applyField('address', first.address, ev.address);
        else if (isOfficial && result.address === null) applyField('address', null, ev.address);
        if (first.borough && VALID_BOROUGHS.includes(first.borough)) applyField('borough', first.borough, ev.borough);
        else if (first.address) {
          const derived = boroughFromAddress(first.address);
          if (derived) applyField('borough', derived, ev.borough);
        }
      }
    } else {
      // No sessions extracted — correct individual fields

      // address: official overwrites always; aggregator overwrites if the new address is more complete OR if existing is non-NYC
      if (result.address && result.address.length > 5) {
        const existingIsWrong = ev.address && !isNYCAddress(ev.address);
        if (isOfficial || !ev.address || existingIsWrong || result.address.length > (ev.address?.length ?? 0)) {
          applyField('address', result.address, ev.address);
        }
      } else if (isOfficial && result.address === null) {
        applyField('address', null, ev.address);
      }

      // borough — always re-derive from best available address
      const finalAddress = (patch.address as string | null | undefined) ?? ev.address;
      if (finalAddress) {
        const derived = boroughFromAddress(finalAddress);
        if (derived) {
          applyField('borough', derived, ev.borough);
        } else if (isOfficial && result.borough === null) {
          applyField('borough', null, ev.borough);
        } else if (result.borough && VALID_BOROUGHS.includes(result.borough)) {
          applyField('borough', result.borough, ev.borough);
        }
      }

      // venue_name
      if (result.venue_name && result.venue_name.length > 2) {
        applyField('venue_name', result.venue_name, ev.venue_name);
      } else if (isOfficial && result.venue_name === null) {
        applyField('venue_name', null, ev.venue_name);
      }

      // start_date
      if (result.start_date && /^\d{4}-\d{2}-\d{2}$/.test(result.start_date)) {
        applyField('start_date', result.start_date, ev.start_date?.slice(0, 10));
      }
      if (result.end_date && /^\d{4}-\d{2}-\d{2}$/.test(result.end_date)) {
        applyField('end_date', result.end_date, ev.end_date);
      }

      // price
      if (typeof result.price_min === 'number') {
        applyField('price_min', result.price_min, ev.price_min);
        applyField('is_free', result.price_min === 0, ev.is_free);
      }
      if (typeof result.price_max === 'number') {
        applyField('price_max', result.price_max, ev.price_max);
      }
    }

    // description (apply from any source)
    if (result.description && result.description.length > 20) {
      applyField('description', result.description.slice(0, 300).trim(), ev.description);
    } else if (isOfficial && result.description === null) {
      applyField('description', null, ev.description);
    }

    // ── Non-NYC check: if official page confirmed a non-NYC address, delete event ──
    const confirmedAddress = (patch.address as string | undefined) ?? ev.address ?? '';
    if (isOfficial && confirmedAddress && !isNYCAddress(confirmedAddress)) {
      await supabase.from('events').delete().eq('id', ev.id);
      console.log(`  [Deleted] Non-NYC address confirmed by official page: "${confirmedAddress}"`);
      updated++;
      continue;
    }

    // ── Write patch ───────────────────────────────────────────
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
      : sourceLabel === 'aggregator' ? '~ aggregator'
      : '✗ no pages';
    const correctionNote = corrections.length > 0 ? `  CORRECTED: ${corrections.join(' | ')}` : '';
    console.log(`[Enrich] ${ev.title.slice(0, 50)} ${officialNote}${correctionNote}`);

      await new Promise((r) => setTimeout(r, 400));
    }

    totalUpdated += updated;
    totalAddressFixed += addressFixed;
    console.log(`[Enrich] Batch done. Updated: ${updated} (${addressFixed} borough fixes)`);

    if (events.length < batchSize) break; // last batch
    offset += batchSize;
  }

  console.log(`\n[Enrich] Done. Total: ${grandTotal} events processed, ${totalUpdated} updated (${totalAddressFixed} borough fixes)`);
}

// Run directly: npx tsx --env-file=.env lib/ingest/enrich.ts
if (process.argv[1] && process.argv[1].endsWith('enrich.ts')) {
  enrichEvents().catch(console.error);
}

/**
 * collect-names.ts
 *
 * Step 1: Collect event names + source URLs from multiple sources.
 *
 * Dedup logic (no LLM):
 *   - Skip if source_url already exists in local ai_new_events_name_list.json
 *   - Skip if name already exists in Supabase ai_event_name_list (previously processed)
 *
 * Output: output/ai_new_events_name_list.json
 * Fields: id, name, source_url, processed
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { EVENTBRITE_SEED_ORGS } from '../ingest/config';
import { chatText, MODELS } from './openai';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export const DEFAULT_MAX_PER_SOURCE = 20;

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const OUTPUT_DIR  = join(__dirname, 'output');
const OUTPUT_PATH = join(OUTPUT_DIR, 'ai_new_events_name_list.json');

const TOMORROW = new Date(Date.now() + 86400000).toISOString().split('T')[0];
const TOMORROW_ISO = new Date(Date.now() + 86400000).toISOString().split('.')[0] + 'Z';

export interface NameListEntry {
  id: number;
  name: string;
  source_url: string | null;
}

// ── Unified model caller (OpenAI for dedup/cancel) ────────────────────

async function callCollectModel(model: string, prompt: string): Promise<string> {
  return chatText(model, [{ role: 'user', content: prompt }]);
}

// ── LLM cancellation check ────────────────────────────────────────────

async function isCanceled(candidate: Candidate, model: string): Promise<boolean> {
  if (!candidate.source_url) return false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(candidate.source_url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' },
    });
    clearTimeout(timer);
    if (!res.ok) return false;
    const html = await res.text();
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 3000);

    const prompt = `Does the following webpage text indicate that this event has been canceled or postponed? Answer only "yes" or "no".

Event: "${candidate.name}"

Page text:
${text}`;

    const answer = await callCollectModel(model, prompt);
    return answer.toLowerCase().trim().startsWith('yes');
  } catch {
    return false;
  }
}

// ── LLM dedup ─────────────────────────────────────────────────────────

async function isDuplicate(candidate: string, existingNames: string[], model: string): Promise<boolean> {
  if (existingNames.length === 0) return false;
  const list = existingNames.map((n, i) => `  ${i + 1}. ${n}`).join('\n');
  const prompt = `Is the following NYC event the same as any event already in the list? Answer only "yes" or "no".

Candidate: "${candidate}"

Existing list:
${list}

Two names refer to the same event if they describe the same show, performance, or recurring series — even if worded differently.

Do not use web search. Answer "yes" or "no" only.`;
  try {
    const answer = await callCollectModel(model, prompt);
    return answer.toLowerCase().trim().startsWith('yes');
  } catch (err) {
    console.error('[collect] LLM dedup error:', (err as Error).message);
    return false;
  }
}

interface Candidate {
  name: string;
  source_url: string | null;
}

// ── Local JSON helpers ────────────────────────────────────────────────

function loadNameList(): NameListEntry[] {
  if (!existsSync(OUTPUT_PATH)) return [];
  try { return JSON.parse(readFileSync(OUTPUT_PATH, 'utf-8')); } catch { return []; }
}

function saveNameList(list: NameListEntry[]): void {
  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(list, null, 2), 'utf-8');
}

// ── JSON-LD helper ────────────────────────────────────────────────────

function extractJsonLdEvents(html: string): Candidate[] {
  const results: Candidate[] = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1]);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item['@type'] === 'Event' && item.name)
          results.push({ name: item.name.trim(), source_url: item.url ?? null });
        if (Array.isArray(item['@graph'])) {
          for (const node of item['@graph']) {
            if (node['@type'] === 'Event' && node.name)
              results.push({ name: node.name.trim(), source_url: node.url ?? null });
          }
        }
      }
    } catch { }
  }
  return results;
}

// ── Source fetchers (async generators) ───────────────────────────────
// API sources paginate on demand; HTML sources fetch once and yield all.

async function* genNYCForFree(): AsyncGenerator<Candidate> {
  try {
    const res = await fetch('https://www.nycforfree.co/events?format=json', { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return;
    const data = await res.json();
    for (const item of data.upcoming ?? []) {
      const name = (item.title ?? '').replace(/<[^>]+>/g, '').trim();
      const path = item.fullUrl ?? item.url ?? item.link ?? null;
      const source_url = path ? (path.startsWith('http') ? path : `https://www.nycforfree.co${path}`) : null;
      if (name) yield { name, source_url };
    }
  } catch (err) { console.error('[collect] NYCForFree error:', (err as Error).message); }
}

async function* genTicketmaster(): AsyncGenerator<Candidate> {
  const API_KEY = process.env.TICKETMASTER_API_KEY!;
  const segments = ['Music', 'Arts & Theatre', 'Comedy', 'Miscellaneous'];
  const PAGE_SIZE = 50;
  for (const segment of segments) {
    let page = 0;
    while (true) {
      try {
        const params = new URLSearchParams({
          apikey: API_KEY, city: 'New York', stateCode: 'NY',
          size: String(PAGE_SIZE), page: String(page), sort: 'date,asc',
          startDateTime: TOMORROW_ISO,
          classificationName: segment,
        });
        const res = await fetch(`https://app.ticketmaster.com/discovery/v2/events.json?${params}`);
        if (!res.ok) break;
        const json = await res.json();
        const events = json._embedded?.events ?? [];
        for (const ev of events) {
          const venueCity = ev._embedded?.venues?.[0]?.city?.name;
          if (venueCity && venueCity !== 'New York') continue;
          if (ev.name) yield { name: ev.name.trim(), source_url: ev.url ?? null };
        }
        if (events.length < PAGE_SIZE) break;
        page++;
        await new Promise(r => setTimeout(r, 250));
      } catch (err) { console.error(`[collect] Ticketmaster "${segment}" error:`, (err as Error).message); break; }
    }
  }
}

async function* genEventbrite(): AsyncGenerator<Candidate> {
  const TOKEN = process.env.EVENTBRITE_OAUTH_TOKEN!;
  const tomorrow = new Date(TOMORROW_ISO);
  for (const org of EVENTBRITE_SEED_ORGS) {
    try {
      const res = await fetch(
        `https://www.eventbriteapi.com/v3/organizers/${org.id}/events/?expand=venue`,
        { headers: { Authorization: `Bearer ${TOKEN}` } }
      );
      if (!res.ok) continue;
      const json = await res.json();
      if (json.error) continue;
      for (const ev of json.events ?? []) {
        if (!ev.start?.utc || new Date(ev.start.utc) < tomorrow) continue;
        const name = ev.name?.text?.trim();
        if (name) yield { name, source_url: ev.url ?? null };
      }
      await new Promise(r => setTimeout(r, 200));
    } catch (err) { console.error(`[collect] Eventbrite org ${org.id} error:`, (err as Error).message); }
  }
}

async function* genTheSkint(): AsyncGenerator<Candidate> {
  try {
    const res = await fetch('https://www.theskint.com/ongoing-events/', { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return;
    const html = await res.text();

    // Format: ► thru M/D: <b>EVENT NAME</b>: description. <a href="URL">>></a>
    // Extract paragraphs with this pattern
    for (const m of html.matchAll(/►\s*thru\s+([\d\/]+):\s*<b>([^<]+)<\/b>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>/gi)) {
      const endDateStr = m[1].trim();   // e.g. "4/25"
      const name = m[2].replace(/&#8217;/g, "'").replace(/&amp;/g, '&').trim();
      const url = m[3];

      // Parse end date (assume current year, handle month/day)
      const [month, day] = endDateStr.split('/').map(Number);
      if (!month || !day) continue;
      const year = new Date().getFullYear();
      const endDate = new Date(year, month - 1, day).toISOString().split('T')[0];
      if (endDate < TOMORROW) continue;  // already ended

      if (name && url) yield { name, source_url: url };
    }
  } catch (err) { console.error('[collect] TheSkint error:', (err as Error).message); }
}

async function* genResidentAdvisor(): AsyncGenerator<Candidate> {
  const nextMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const PAGE_SIZE = 50;
  let page = 1;
  while (true) {
    try {
      const res = await fetch('https://ra.co/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
        body: JSON.stringify({
          query: `query { eventListings(
            filters: { areas: { eq: 13 }, listingDate: { gte: "${TOMORROW}", lte: "${nextMonth}" } }
            pageSize: ${PAGE_SIZE} page: ${page}
          ) { data { event { title contentUrl } } } }`,
        }),
      });
      if (!res.ok) break;
      const json = await res.json();
      if (json?.errors?.length) { console.error('[collect] ResidentAdvisor GraphQL errors:', json.errors[0]?.message); break; }
      const listings = json?.data?.eventListings?.data ?? [];
      for (const l of listings) {
        const { title, contentUrl } = l?.event ?? {};
        if (title) yield { name: title.trim(), source_url: contentUrl ? `https://ra.co${contentUrl}` : null };
      }
      if (listings.length < PAGE_SIZE) break;
      page++;
    } catch (err) { console.error('[collect] ResidentAdvisor error:', (err as Error).message); break; }
  }
}

// Dice.fm: use the NYC browse page which includes event data in __NEXT_DATA__
// URL: https://dice.fm/browse/new_york-5bbf4db0f06331478e9b2c59

async function* genDice(): AsyncGenerator<Candidate> {
  try {
    const res = await fetch(
      'https://dice.fm/browse/new_york-5bbf4db0f06331478e9b2c59?lng=en',
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    if (!res.ok) return;
    const html = await res.text();
    const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!m) return;
    const data = JSON.parse(m[1]);
    const events: any[] = data?.props?.pageProps?.events ?? [];
    for (const e of events) {
      const name = (e.name ?? '').trim();
      const perm = e.perm_name;
      if (!name) continue;
      yield { name, source_url: perm ? `https://dice.fm/event/${perm}` : null };
    }
  } catch (err) { console.error('[collect] Dice error:', (err as Error).message); }
}
// TODO: consider using LLM-based scraping in the future.

async function* genLuma(): AsyncGenerator<Candidate> {
  let cursor = '';
  while (true) {
    try {
      const res = await fetch(
        `https://api.lu.ma/discover/get-paginated-events?after=${cursor}&city_slug=nyc&pagination_limit=50&start_after=${TOMORROW}`,
        { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } }
      );
      if (!res.ok) break;
      const json = await res.json();
      const entries = json.entries ?? json.events ?? [];
      for (const entry of entries) {
        const name = (entry.event?.name ?? entry.name ?? '').trim();
        const slug = entry.event?.url ?? entry.url ?? null;
        if (name) yield { name, source_url: slug ? `https://lu.ma/${slug}` : null };
      }
      cursor = json.next_cursor ?? '';
      if (!cursor || entries.length === 0) break;
    } catch (err) { console.error('[collect] Luma error:', (err as Error).message); break; }
  }
}

// HTML-only sources — fetch once, yield all
async function* genFromHtml(
  sourceName: string,
  fetchFn: () => Promise<Candidate[]>
): AsyncGenerator<Candidate> {
  try {
    const results = await fetchFn();
    for (const c of results) yield c;
  } catch (err) { console.error(`[collect] ${sourceName} error:`, (err as Error).message); }
}

// Fever removed: site is fully client-side rendered, no public API available.
// TODO: consider using LLM-based scraping in the future.

// ── New Museum ────────────────────────────────────────────────────────

async function* genNewMuseum(): AsyncGenerator<Candidate> {
  const today = new Date().toISOString().split('T')[0];
  const query = `{ exhibitions(first: 50, where: { status: PUBLISH }) {
    nodes { title slug startDate endDate }
  } }`;
  try {
    const res = await fetch('https://admin.newmuseum.org/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'sift-nyc-app/1.0' },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) return;
    const json = await res.json();
    for (const node of json?.data?.exhibitions?.nodes ?? []) {
      if (node.endDate && node.endDate.split('T')[0] < today) continue;
      const name = (node.title ?? '').replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ' ').trim();
      if (!name) continue;
      yield {
        name,
        source_url: node.slug ? `https://www.newmuseum.org/exhibition/${node.slug}/` : null,
      };
    }
  } catch (err) { console.error('[collect] NewMuseum error:', (err as Error).message); }
}

// NYCParks removed: replaced by nycgov source which uses the official NYC Event Calendar API
// and covers all Parks & Recreation events plus Cultural, Free, Street, etc.
// The nycgov API returns 1500+ events with pagination vs ~30 from HTML scraping.

// MoMA removed: www.moma.org is behind Cloudflare bot protection, no scraping possible.
// New Museum removed: newmuseum.org is Next.js with no static event data.
// Brooklyn Museum removed: brooklynmuseum.org is behind Vercel Security Checkpoint.

async function scrapeWhitney(): Promise<Candidate[]> {
  const BASE = 'https://whitney.org';
  const res = await fetch(`${BASE}/events`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) return [];
  const html = await res.text();
  const results: Candidate[] = [];
  const seen = new Set<string>();
  // Each event card: <a href="/events/SLUG">...<h3 ...>NAME</h3>...</a>
  for (const m of html.matchAll(/href="(\/events\/[^"]+)"[\s\S]*?<h3[^>]*>\s*([\s\S]*?)\s*<\/h3>/g)) {
    const url = `${BASE}${m[1]}`;
    const name = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (!name || name.length < 4 || seen.has(url)) continue;
    seen.add(url);
    results.push({ name, source_url: url });
  }
  return results;
}

async function scrapeCozyCratives(): Promise<Candidate[]> {
  const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml',
    'Referer': 'https://cozycreatives.beehiiv.com/',
  };

  // Step 1: get latest post slug from archive
  const archiveRes = await fetch('https://cozycreatives.beehiiv.com/archive', { headers: BROWSER_HEADERS });
  if (!archiveRes.ok) return [];
  const archiveHtml = await archiveRes.text();
  const slugs = [...new Set(archiveHtml.match(/\/p\/([\w-]+)/g) ?? [])].map(s => s.replace('/p/', ''));
  if (slugs.length === 0) return [];

  // Step 2: fetch the latest post and extract event links + names
  const latestUrl = `https://cozycreatives.beehiiv.com/p/${slugs[0]}`;
  const postRes = await fetch(latestUrl, { headers: BROWSER_HEADERS });
  if (!postRes.ok) return [];
  const postHtml = await postRes.text();

  const results: Candidate[] = [];
  const seen = new Set<string>();
  for (const m of postHtml.matchAll(/<a\s+href="(https?:\/\/(?!(?:cozycreatives|beehiiv|fonts|instagram|tiktok|linktr)[^"]*)([^"]+))"[^>]*>(?:<[^>]+>)*([^<]{5,120})(?:<\/[^>]+>)*<\/a>/g)) {
    const url = m[1];
    const name = m[3].replace(/\s+/g, ' ').trim();
    if (!name || seen.has(url)) continue;
    seen.add(url);
    results.push({ name, source_url: url });
  }
  return results;
}

// NYCTourism removed: nycgo.com redirects to nyctourism.com. Event listings are loaded
// dynamically via JavaScript (Next.js RSC), no data in static HTML and no public API.
// TODO: consider using LLM-based scraping in the future.

async function scrapeMeetup(): Promise<Candidate[]> {
  const res = await fetch('https://www.meetup.com/find/?location=us--ny--New+York&source=EVENTS&eventType=inPerson', { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) return [];
  const html = await res.text();
  const results = extractJsonLdEvents(html);
  const nextMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (nextMatch) {
    try {
      const data = JSON.parse(nextMatch[1]);
      for (const ev of data?.props?.pageProps?.events ?? data?.props?.pageProps?.searchResult?.value ?? []) {
        const name = (ev.title ?? ev.name ?? '').trim();
        if (name) results.push({ name, source_url: ev.eventUrl ?? ev.link ?? null });
      }
    } catch { }
  }
  return results;
}


// ── NYCTourism ────────────────────────────────────────────────────────

async function* genNYCTourism(): AsyncGenerator<Candidate> {
  try {
    const sitemapRes = await fetch('https://www.nyctourism.com/server-sitemap.xml', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!sitemapRes.ok) return;
    const xml = await sitemapRes.text();
    const urls = [...xml.matchAll(/<loc>(https:\/\/www\.nyctourism\.com\/events\/[^<]+)<\/loc>/g)]
      .map(m => m[1]);
    for (const url of urls) {
      try {
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!res.ok) continue;
        const html = await res.text();
        for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
          try {
            const d = JSON.parse(m[1]);
            if (d['@type'] === 'Event' && d.name) {
              yield { name: d.name.trim(), source_url: url };
              break;
            }
          } catch { }
        }
      } catch { }
    }
  } catch (err) { console.error('[collect] NYCTourism error:', (err as Error).message); }
}

// ── NYC Gov Event Calendar API ────────────────────────────────────────

const NYC_GOV_CATEGORIES = [
  'Cultural', 'Free', 'Street and Neighborhood',
  'Kids and Family', 'Environment', 'Tours',
  // Excluded: 'Athletic' (recurring fitness classes, not one-time events)
  // Excluded: 'Parks & Recreation' (mostly fitness/sports classes, covered by Athletic)
];

async function* genNYCGov(): AsyncGenerator<Candidate> {
  const API_KEY = process.env.NYC_EVENT_CALENDAR_KEY;
  if (!API_KEY) { console.warn('[collect] NYC_EVENT_CALENDAR_KEY not set, skipping NYCGov'); return; }

  const endDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) =>
    `${String(d.getMonth() + 1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()} 12:00 AM`;

  const baseParams = {
    startDate: fmt(new Date(Date.now() + 86400000)),
    endDate: fmt(endDate),
    categories: NYC_GOV_CATEGORIES.join(','),
  };

  let page = 1;
  const seenUrls = new Set<string>();
  while (true) {
    try {
      const params = new URLSearchParams({ ...baseParams, page: String(page) });
      const res = await fetch(`https://api.nyc.gov/calendar/search?${params}`, {
        headers: { 'Ocp-Apim-Subscription-Key': API_KEY, 'Cache-Control': 'no-cache' },
      });
      if (!res.ok) { console.error(`[collect] NYCGov API error: ${res.status}`); break; }
      const data = await res.json();
      const items: any[] = data?.items ?? [];
      let newInPage = 0;
      for (const item of items) {
        if (item.canceled) continue;
        const name = (item.name ?? '').trim();
        if (!name) continue;
        const url = item.permalink || item.website || null;
        if (url && seenUrls.has(url)) continue; // detect page loop
        if (url) seenUrls.add(url);
        newInPage++;
        yield { name, source_url: url };
      }
      // Break if API returned no new items (page param ignored = infinite loop)
      if (newInPage === 0 || data?.pagination?.isLastPage) break;
      page++;
    } catch (err) { console.error('[collect] NYCGov error:', (err as Error).message); break; }
  }
}

// ── Fever ─────────────────────────────────────────────────────────────

const FEVER_CATEGORIES = [
  'candlelight', 'immersive-experiences', 'fever-originals',
  'culture-art-fashion', 'exhibitions', 'music-events',
  'concerts-festivals', 'nightlife-clubs', 'stand-up', 'food',
];

async function* genFever(): AsyncGenerator<Candidate> {
  const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (compatible; SiftBot/1.0)',
    'Accept': 'text/html,application/xhtml+xml',
  };
  const seen = new Set<string>();
  for (const slug of FEVER_CATEGORIES) {
    try {
      const res = await fetch(`https://feverup.com/en/new-york/${slug}`, { headers: HEADERS });
      if (!res.ok) continue;
      const html = await res.text();
      for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)) {
        try {
          const data = JSON.parse(m[1].trim());
          if (data['@type'] !== 'ItemList' || !Array.isArray(data.itemListElement)) continue;
          for (const item of data.itemListElement) {
            const url = item.url;
            if (!url || seen.has(url)) continue;
            seen.add(url);
            // Fetch event page for the name
            try {
              const er = await fetch(url, { headers: HEADERS });
              if (!er.ok) continue;
              const ehtml = await er.text();
              for (const em of ehtml.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)) {
                try {
                  const ev = JSON.parse(em[1].trim());
                  if (ev['@type'] === 'Event' && ev.name) {
                    yield { name: ev.name.trim(), source_url: url };
                    break;
                  }
                } catch { }
              }
            } catch { }
          }
        } catch { }
      }
    } catch (err) { console.error(`[collect] Fever error (${slug}):`, (err as Error).message); }
  }
}

// ── Partiful Discover ────────────────────────────────────────────────

async function* genPartiful(): AsyncGenerator<Candidate> {
  try {
    const res = await fetch('https://www.partiful.com/discover', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
    });
    if (!res.ok) return;
    const html = await res.text();
    const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!m) return;
    const data = JSON.parse(m[1]);
    const events = data?.props?.pageProps?.events ?? data?.props?.pageProps?.discoverEvents ?? [];
    for (const e of events) {
      const name = (e.title ?? e.name ?? '').trim();
      const slug = e.slug ?? e.id ?? null;
      const url = e.url ?? (slug ? `https://partiful.com/e/${slug}` : null);
      if (name && url) yield { name, source_url: url };
    }
  } catch (err) { console.error('[collect] Partiful error:', (err as Error).message); }
}

// ── Film Forum (JSON-LD ScreeningEvent) ─────────────────────────────

async function* genFilmForum(): AsyncGenerator<Candidate> {
  try {
    const res = await fetch('https://filmforum.org/now-playing', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) return;
    const html = await res.text();
    const candidates = extractJsonLdEvents(html);
    for (const c of candidates) yield c;
    // Fallback: scrape film titles from page if no JSON-LD
    if (candidates.length === 0) {
      for (const m of html.matchAll(/<a\s+href="(\/film\/[^"]+)"[^>]*>[\s\S]*?<h\d[^>]*>\s*([\s\S]*?)\s*<\/h\d>/gi)) {
        const name = m[2].replace(/<[^>]+>/g, '').trim();
        if (name) yield { name, source_url: `https://filmforum.org${m[1]}` };
      }
    }
  } catch (err) { console.error('[collect] FilmForum error:', (err as Error).message); }
}

// ── DICE API ─────────────────────────────────────────────────────────

async function* genDiceAPI(): AsyncGenerator<Candidate> {
  try {
    const res = await fetch(
      'https://events-api.dice.fm/v1/events?page[size]=50&filter[venues][]=New+York&filter[dates][from]=' + TOMORROW,
      { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } }
    );
    if (!res.ok) {
      // Fallback: try the public browse endpoint
      return;
    }
    const json = await res.json();
    const events = json.data ?? json.events ?? [];
    for (const e of events) {
      const name = (e.name ?? e.attributes?.name ?? '').trim();
      const url = e.url ?? e.attributes?.url ?? e.links?.self ?? null;
      if (name) yield { name, source_url: url };
    }
  } catch (err) { console.error('[collect] DICE API error:', (err as Error).message); }
}

// ── Shotgun (House of Yes + other nightlife venues) ─────────────────

async function* genShotgun(): AsyncGenerator<Candidate> {
  const ORG_IDS = [207392]; // House of Yes
  for (const orgId of ORG_IDS) {
    try {
      const res = await fetch(
        `https://shotgun.live/api/v1/organizations/${orgId}/events?status=upcoming`,
        { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } }
      );
      if (!res.ok) continue;
      const json = await res.json();
      const events = json.data ?? json.events ?? json ?? [];
      const items = Array.isArray(events) ? events : [];
      for (const e of items) {
        const name = (e.name ?? e.title ?? '').trim();
        const slug = e.slug ?? e.id ?? null;
        const url = e.url ?? (slug ? `https://shotgun.live/events/${slug}` : null);
        if (name) yield { name, source_url: url };
      }
    } catch (err) { console.error(`[collect] Shotgun org ${orgId} error:`, (err as Error).message); }
  }
}

// ── AI-Powered Event Discovery ──────────────────────────────────────
// Uses the full discovery prompt from prompts/discovery-prompt.md.
// Single call per run with 3-pass approach: fetch → search → verify.

const DISCOVERY_SYSTEM_PROMPT = `You are the editorial curator for **Sift**, a NYC event discovery app. Your job is to surface events that an 18-35 year old NYC professional would actually want to know about, and to ignore everything else.

### Who Sift is for

The Sift user is 18-35, lives in NYC, works a real job, and treats their weekends seriously. They follow accounts like @whatisnewyork, read The Infatuation and Eater NYC, have a Resy account, and text their group chat before they commit to plans. They have taste, disposable income, and limited time. They are not tourists, not students discovering the city for the first time, not corporate happy-hour people, and not the underground-only crowd. They are mainstream-tasteful: Sabrina Carpenter at MSG is as valid as a warehouse DJ set.

The brands, artists, venues, and restaurants below are the **cultural anchors** that define the cluster. You are not limited to these — surface anything that *fits the cluster*. Use them to calibrate, not as a checklist.

#### FASHION & SHOPPING
- **Anchors**: Kith, Aimé Leon Dore (ALD), AMI Paris, COS, Every Other Thursday, Buck Mason, Todd Snyder, Chanel, Stüssy, Carhartt WIP, A.P.C., Rag & Bone, Oak + Fort
- **Adjacent**: Aritzia, & Other Stories, Sézane, Arc'teryx, Dover Street Market, Bode, Awake NY, Story Mfg, Online Ceramics, Noah, Engineered Garments, Norse Projects, Acne Studios, Margiela, Our Legacy, Drake's
- **Event types**: sample sales, brand pop-ups, store openings, capsule launches, NYFW satellite events, designer resale, vintage markets (Artists & Fleas, Brooklyn Flea, Chelsea Flea, Hester Street Fair, Grand Bazaar)

#### MUSIC & NIGHTLIFE
- **Anchor artists**: Fred Again, John Summit, Disco Lines, Dom Dolla, Lorde, Sabrina Carpenter, Empire of the Sun, TV Girl, Disclosure
- **Adjacent artists**: Charli XCX, Bad Bunny, Tyler the Creator, Khruangbin, Kali Uchis, Blood Orange, Bicep, Four Tet, Skrillex, Anyma, Kaytranada, Justice, ODESZA, Diplo, Peggy Gou, Honey Dijon, Mall Grab, FISHER, Chris Stussy
- **Anchor venues**: MSG, Barclays Center, Brooklyn Steel, Forest Hills Stadium, Avant Gardner / The Brooklyn Mirage, Webster Hall, Terminal 5, Knockdown Center, Elsewhere, Baby's All Right, Music Hall of Williamsburg, Bowery Ballroom, Le Poisson Rouge, Public Records, Good Room, House of Yes, Mood Ring, Nowadays, Sultan Room, Racket, Sony Hall, Joe's Pub, Brooklyn Made, TV Eye
- **Event types**: arena/stadium tours, club nights with named DJs, festival lineups, DJ residencies, listening parties, album release shows

#### FITNESS & WELLNESS
- **Anchors**: Barry's, SoulCycle, Equinox, CorePower Yoga, Solidcore
- **Run clubs**: Bandit Running, Tracksmith, NYC Flyers, November Project NYC, Nike Run Club NYC, Brooklyn Track Club
- **Event types**: special pop-up classes, brand-collab fitness events, themed run-club runs, race events, climbing comps, padel tournaments, credible wellness pop-ups

#### FOOD & RESTAURANTS
- **Anchors**: Monkey Bar, Don Angie, San Sabino, Au Cheval, 4 Charles Prime Rib, Nom Wah Tea Parlor, 7th Street Burger
- **Adjacent**: Carbone, Torrisi, Jean's, Bistrot Ha, Semma, Dhamaka, Estela, Lilia, Misi, Bar Pisellino, Via Carota, Ursula, Sunday in Brooklyn, Buvette, Cervo's, Rolo's, Thai Diner, Atomix, Atoboy, Cote
- **Event types**: new restaurant openings covered by Eater / Infatuation / Resy, chef collab dinners, omakase pop-ups, food festivals with credible chef rosters

#### BARS & COCKTAILS
- **Anchors**: Jean's NYC, Jewel Box, Le Dive, Swan Room, Superbueno, Dante, Schmuck
- **Event types**: bar openings, guest bartender takeovers, natural wine tastings, cocktail menu launches, speakeasy openings

#### CULTURE & ARTS
- **Institutions**: MoMA, Whitney, Guggenheim, Met, Brooklyn Museum, New Museum, The Shed, Fotografiska, Neue Galerie, Dia Beacon, Storm King, Noguchi
- **Cinemas**: Metrograph, Film Forum, IFC Center, Nitehawk, Alamo Drafthouse Brooklyn, Angelika, Roxy Cinema
- **Comedy**: Comedy Cellar, Caveat, The Stand, Gotham, Union Hall, The Bell House
- **Event types**: museum exhibition openings, gallery openings, repertory film series, comedy showcases, author events, panel talks

#### SPORTS
- **Teams**: Knicks, Rangers, Yankees, Mets, NYCFC, Liberty, Nets
- **Event types**: marquee home games, playoff games, theme nights, US Open tennis, NYC Marathon

### Quality bar — apply ruthlessly

**8-10 (KEEP)**: Names a recognized brand/artist/chef/venue. Real date, real venue, real ticket/RSVP/source URL. Limited or special.
**6-7 (MAYBE)**: Right vibe, real venue, lesser-known but credible source.
**1-5 (KILL)**: Tourist traps, corporate networking, webinars, generic pub crawls, "DJ TBD," chain venues, wrong demo, no-name fashion, low-quality fitness.

### Critical calibration rules
1. Mainstream is not a downgrade. Lady Gaga at MSG = 9. Whitney Biennial = 10.
2. Niche is not automatically good. Random open mic at unknown bar = 4.
3. Brand recognition is signal. Stüssy sample sale = 8. "Streetwear pop-up" with no brands named = 3.
4. The test: Would a 28-year-old who works in tech/finance/media/fashion/PR text this to their group chat?`;

function buildDiscoveryUserMessage(): string {
  const today = new Date().toISOString().split('T')[0];
  const thirtyDays = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  return `Find upcoming NYC events between ${today} and ${thirtyDays} that fit the Sift user. Work in three passes — cheapest first. Stop as soon as you have 25–40 strong candidates; quality over quantity.

PASS 1 — Deterministic feed fetch (web_fetch only, no web_search).

Fetch these pages directly and extract events:

Music venue calendars:
- https://www.bowerypresents.com/new-york-metro/shows/brooklyn-steel
- https://www.bowerypresents.com/new-york-metro/shows/webster-hall
- https://www.bowerypresents.com/new-york-metro/shows/terminal-5
- https://www.babysallright.com/calendar
- https://www.elsewhere.club/calendar
- https://publicrecords.nyc
- https://knockdown.center/events/
- https://www.houseofyes.org/events
- https://www.avant-gardner.com/shows

Fashion / sample sale aggregators:
- https://www.chicmi.com/new-york/sample-sales/
- https://260samplesale.com/
- https://pulsd.com/new-york/sample-sales

Food:
- https://www.eater.com/new-york
- https://www.theinfatuation.com/new-york/guides/new-nyc-restaurants-openings

Culture:
- https://whitney.org/exhibitions
- https://www.newmuseum.org/exhibitions
- https://metrograph.com/calendar/

PASS 2 — Targeted web_search ONLY for gaps Pass 1 didn't cover. AT MOST 6 searches total.

PASS 3 — Verification: if any candidate source_url is a listicle, fetch the page and extract the direct event link. Drop candidates where you can't find a direct link.

OUTPUT — Return ONLY a valid JSON array. No prose. No markdown fences.

[
  {
    "name": "exact event title as listed on the source",
    "source_url": "https://direct-link-to-event-or-tickets-page"
  }
]

Rules:
- Only events dated ${today} to ${thirtyDays}
- Only NYC five boroughs (Forest Hills Stadium, Dia Beacon, Storm King allowed)
- source_url MUST be an event / tickets / venue page — no listicle URLs
- Music candidates MUST include a named headliner
- Score >= 6 only — drop anything lower
- Return [] if nothing meets the bar`;
}

async function* genAIDiscover(): AsyncGenerator<Candidate> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      console.log(`[collect] AI discover: running single-call 3-pass discovery (attempt ${attempt + 1}/2)...`);
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 8000,
        system: [{ type: 'text', text: DISCOVERY_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        tools: [
          { type: 'web_search_20250305', name: 'web_search' as const },
        ],
        messages: [{ role: 'user', content: buildDiscoveryUserMessage() }],
      });

      const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text');
      const text = textBlocks.map(b => b.text).join('\n');

      const events = extractJsonArray(text);
      console.log(`[collect] AI discover: found ${events.length} candidates`);

      for (const e of events) {
        const name = (e.name ?? '').trim();
        const url = (e.source_url ?? '').trim();
        if (name && url && url.startsWith('http')) yield { name, source_url: url };
      }
      return; // success — don't retry
    } catch (err) {
      console.error(`[collect] AI discover error (attempt ${attempt + 1}/2):`, (err as Error).message);
      if (attempt === 0) {
        console.log('[collect] Retrying AI discover in 10s...');
        await new Promise(r => setTimeout(r, 10000));
      }
    }
  }
  console.error('[collect] AI discover failed after 2 attempts, continuing with other sources');
}

/** Robustly extract a JSON array from LLM output that may contain surrounding text */
function extractJsonArray(text: string): Array<{ name: string; source_url: string }> {
  // Try to find all [...] blocks and parse the largest valid one
  const candidates: string[] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '[') {
      if (depth === 0) start = i;
      depth++;
    } else if (text[i] === ']') {
      depth--;
      if (depth === 0 && start !== -1) {
        candidates.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }

  // Try each candidate from largest to smallest
  candidates.sort((a, b) => b.length - a.length);
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].name) return parsed;
    } catch { /* try next */ }
  }
  return [];
}

// ── Main export ───────────────────────────────────────────────────────

export async function collectAllNames(maxPerSource = DEFAULT_MAX_PER_SOURCE, sourceFilter?: string, collectModel = 'gpt-4o-mini'): Promise<NameListEntry[]> {
  // Load existing local list
  const existing = loadNameList();
  const existingUrls = new Set(existing.map(e => e.source_url).filter(Boolean) as string[]);
  const existingNames = new Set(existing.map(e => e.name.toLowerCase().trim()));

  // Load Supabase names + URLs to skip already-processed events
  const { data: supabaseRows } = await supabase
    .from('ai_event_name_list')
    .select('name, source_url');
  for (const row of supabaseRows ?? []) {
    existingNames.add(row.name.toLowerCase().trim());
    if (row.source_url) existingUrls.add(row.source_url);
  }

  console.log(`[collect] ${existing.length} existing in local list, ${supabaseRows?.length ?? 0} in Supabase`);

  const sources: { name: string; generate: () => AsyncGenerator<Candidate> }[] = [
    { name: 'ticketmaster',   generate: genTicketmaster },
    { name: 'eventbrite',     generate: genEventbrite },
    { name: 'residentadvisor',generate: genResidentAdvisor },
    { name: 'luma',           generate: genLuma },
    { name: 'whitney',        generate: () => genFromHtml('Whitney', scrapeWhitney) },
    { name: 'newmuseum',      generate: genNewMuseum },
    { name: 'nycforfree',     generate: genNYCForFree },
    { name: 'cozycratives',   generate: () => genFromHtml('CozyCratives', scrapeCozyCratives) },
    { name: 'theskint',       generate: genTheSkint },
    { name: 'meetup',         generate: () => genFromHtml('Meetup', scrapeMeetup) },
    { name: 'fever',          generate: genFever },
    { name: 'dice',           generate: genDice },
    { name: 'nyctourism',     generate: genNYCTourism },
    { name: 'nycgov',         generate: genNYCGov },
    { name: 'partiful',       generate: genPartiful },
    { name: 'filmforum',      generate: genFilmForum },
    { name: 'dice_api',       generate: genDiceAPI },
    { name: 'shotgun',        generate: genShotgun },
    { name: 'ai_discover',    generate: genAIDiscover },
  ];

  const activeSources = sourceFilter
    ? sources.filter(s => s.name === sourceFilter)
    : sources;

  if (sourceFilter && activeSources.length === 0) {
    console.error(`[collect] Unknown source: "${sourceFilter}". Valid sources: ${sources.map(s => s.name).join(', ')}`);
    return [];
  }

  let nextId = existing.length > 0 ? Math.max(...existing.map(e => e.id)) + 1 : 1;
  const newEntries: NameListEntry[] = [];

  for (const source of activeSources) {
    console.log(`[collect] Fetching from ${source.name} (max=${maxPerSource})...`);
    let addedFromSource = 0;

    for await (const c of source.generate()) {
      if (addedFromSource >= maxPerSource) break;

      // Require source_url
      if (!c.source_url) {
        console.log(`[collect]   skip (no url): "${c.name}"`);
        continue;
      }

      // Layer 1: URL exact match
      if (existingUrls.has(c.source_url)) {
        console.log(`[collect]   skip (url exists): "${c.name}" (${c.source_url})`);
        continue;
      }

      // Layer 2: LLM dedup
      const dup = await isDuplicate(c.name, [...existingNames], collectModel);
      if (dup) {
        console.log(`[collect]   skip (llm duplicate): "${c.name}" (${c.source_url})`);
        continue;
      }

      // Layer 3: cancellation check
      const canceled = await isCanceled(c, collectModel);
      if (canceled) {
        console.log(`[collect]   skip (canceled): "${c.name}" (${c.source_url})`);
        continue;
      }

      const entry: NameListEntry = { id: nextId++, name: c.name, source_url: c.source_url };
      newEntries.push(entry);
      if (c.source_url) existingUrls.add(c.source_url);
      existingNames.add(c.name.toLowerCase().trim());
      addedFromSource++;
      console.log(`[collect]   added: "${c.name}" (${c.source_url ?? 'no url'})`);
      saveNameList([...existing, ...newEntries]);
    }

    console.log(`[collect] ${source.name}: added ${addedFromSource}. Total new: ${newEntries.length}`);
  }

  console.log(`[collect] Done. ${newEntries.length} new names collected`);
  return newEntries;
}

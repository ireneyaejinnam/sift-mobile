/**
 * LLM enrichment step — uses Claude (Haiku) to improve data accuracy.
 *
 * For each event, fetches the actual official page(s) (event_url + ticket_url)
 * and passes the real content to Claude for verification. Claude only corrects
 * fields it can confirm from the source — unknown fields are left null.
 *
 * Also fixes borough/address mismatches programmatically before LLM step.
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

// Zip code prefix → borough
const ZIP_BOROUGH: [RegExp, string][] = [
  [/\b100\d{2}\b/, 'Manhattan'],
  [/\b101\d{2}\b/, 'Manhattan'],
  [/\b102\d{2}\b/, 'Manhattan'],
  [/\b112\d{2}\b/, 'Brooklyn'],
  [/\b113\d{2}\b/, 'Queens'],
  [/\b114\d{2}\b/, 'Queens'],
  [/\b116\d{2}\b/, 'Queens'],
  [/\b104\d{2}\b/, 'Bronx'],
  [/\b103\d{2}\b/, 'Staten Island'],
];

interface EventRow {
  id: string;
  title: string;
  description?: string | null;
  venue_name?: string | null;
  address?: string | null;
  neighborhood?: string | null;
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

// ── Borough auto-fix from address ────────────────────────────

function boroughFromAddress(address: string): string | null {
  const text = address.toLowerCase();
  if (text.includes('brooklyn')) return 'Brooklyn';
  if (text.includes('queens')) return 'Queens';
  if (text.includes('bronx') || text.includes(', bx')) return 'Bronx';
  if (text.includes('staten island')) return 'Staten Island';
  for (const [re, borough] of ZIP_BOROUGH) {
    if (re.test(address)) return borough;
  }
  // Manhattan ZIP codes or explicit mention
  if (text.includes('manhattan') || text.includes(', ny 10') || text.match(/new york,? ny 10/)) {
    return 'Manhattan';
  }
  return null;
}

// ── Web page fetcher ─────────────────────────────────────────

const FETCH_TIMEOUT = 10_000;
const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function fetchPageText(url: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    const res = await fetch(url, { signal: controller.signal, headers: FETCH_HEADERS });
    clearTimeout(timer);

    if (!res.ok) return '';
    const html = await res.text();

    // Parse and extract meaningful text content
    const root = parse(html);

    // Remove noise nodes
    root.querySelectorAll('script, style, nav, footer, header, iframe, noscript').forEach((n) => n.remove());

    // Prefer article/main/event content blocks
    const focusSelectors = ['article', 'main', '[class*="event"]', '[class*="content"]', '[id*="event"]', '[id*="content"]'];
    for (const sel of focusSelectors) {
      const node = root.querySelector(sel);
      if (node) {
        const text = node.text.replace(/\s+/g, ' ').trim();
        if (text.length > 200) return text.slice(0, 4000);
      }
    }

    // Fallback: full body text
    return (root.querySelector('body')?.text ?? root.text).replace(/\s+/g, ' ').trim().slice(0, 4000);
  } catch {
    return '';
  }
}

// ── LLM enrichment for a single event ───────────────────────

async function enrichOne(event: EventRow, pageTexts: string[]): Promise<EnrichResult> {
  const pagesSection = pageTexts
    .map((t, i) => `--- Page ${i + 1} ---\n${t}`)
    .join('\n\n');

  const prompt = `You are verifying and correcting NYC event data. Use ONLY the official page content below to answer. Do NOT guess or invent information.

Current event data:
- Title: ${event.title}
- Venue: ${event.venue_name ?? 'unknown'}
- Address: ${event.address ?? 'unknown'}
- Borough: ${event.borough ?? 'unknown'}
- Category: ${event.category}
- Is free: ${event.is_free}
- Description: ${event.description?.slice(0, 300) ?? 'none'}

Official page content:
${pagesSection || '(no pages could be fetched)'}

Return a JSON object with ONLY the fields you can confirm from the page content above. Rules:
- "category": one of: ${VALID_CATEGORIES.join(', ')} — only if you can determine it confidently
- "is_free": true or false — only if pricing is explicitly stated
- "borough": one of: ${VALID_BOROUGHS.join(', ')} — derive from the actual address on the page, not assumptions
- "address": the full correct address as it appears on the official page
- "venue_name": correct venue name as it appears on the official page
- "description": 1–2 punchy sentences (max 250 chars) describing what this event actually is. No "Join us", no ticket info, no HTML. If multiple locations, briefly note that.
- If a field cannot be confirmed from the page, set it to null — do NOT include uncertain values
- Return ONLY a JSON object, no other text. Example: {"borough":"Brooklyn","description":"..."}`;

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = message.content[0].type === 'text' ? message.content[0].text : '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return {};

  try {
    return JSON.parse(jsonMatch[0]) as EnrichResult;
  } catch {
    return {};
  }
}

// ── Main ─────────────────────────────────────────────────────

export async function enrichEvents(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('[Enrich] ANTHROPIC_API_KEY not set, skipping');
    return;
  }

  console.log('[Enrich] Starting web-verified LLM enrichment...');

  const { data: events, error } = await supabase
    .from('events')
    .select('id, title, description, venue_name, address, neighborhood, category, is_free, borough, tags, event_url, ticket_url')
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

    // ── Step 1: Fix borough/address mismatch programmatically ──
    if (ev.address) {
      const inferredBorough = boroughFromAddress(ev.address);
      if (inferredBorough && inferredBorough !== ev.borough) {
        patch.borough = inferredBorough;
        addressFixed++;
      }
    }

    // ── Step 2: Fetch official pages ──────────────────────────
    const urls = [...new Set([ev.event_url, ev.ticket_url].filter(Boolean) as string[])];
    const pageTexts: string[] = [];

    for (const url of urls) {
      const text = await fetchPageText(url);
      if (text) pageTexts.push(text);
    }

    // ── Step 3: LLM verification ──────────────────────────────
    let result: EnrichResult = {};
    try {
      result = await enrichOne(ev, pageTexts);
    } catch (err) {
      console.warn(`[Enrich] LLM failed for ${ev.id}:`, (err as Error).message);
    }

    if (result.category && VALID_CATEGORIES.includes(result.category)) {
      patch.category = result.category;
    }
    if (typeof result.is_free === 'boolean') {
      patch.is_free = result.is_free;
      if (result.is_free) patch.price_min = 0;
    }
    // LLM borough only applies if address-based fix didn't already set it
    if (!patch.borough && result.borough && VALID_BOROUGHS.includes(result.borough)) {
      patch.borough = result.borough;
    }
    if (result.borough === null && !patch.borough) {
      // LLM explicitly said unknown — leave existing value, don't overwrite with null
    }
    if (result.description && result.description.length > 20) {
      patch.description = result.description.slice(0, 300).trim();
    }
    if (result.address && result.address.length > 5) {
      // Only overwrite if LLM found a more complete address
      if (!ev.address || result.address.length > ev.address.length) {
        patch.address = result.address;
        // Re-check borough from the corrected address
        const newBorough = boroughFromAddress(result.address);
        if (newBorough) patch.borough = newBorough;
      }
    }
    if (result.venue_name && result.venue_name.length > 2) {
      patch.venue_name = result.venue_name;
    }

    if (Object.keys(patch).length > 0) {
      const { error: updateErr } = await supabase.from('events').update(patch).eq('id', ev.id);
      if (!updateErr) updated++;
      else console.warn(`[Enrich] Update failed for ${ev.id}:`, updateErr.message);
    }

    // Small delay to be polite to external sites and Anthropic rate limits
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`[Enrich] Done. Updated: ${updated} events (${addressFixed} borough fixes from address)`);
}

// Run directly: npx tsx --env-file=.env lib/ingest/enrich.ts
if (process.argv[1] && process.argv[1].endsWith('enrich.ts')) {
  enrichEvents().catch(console.error);
}

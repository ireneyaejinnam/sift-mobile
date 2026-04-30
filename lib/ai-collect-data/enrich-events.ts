/**
 * enrich-events.ts
 *
 * Step 2: Read ai_new_events_name_list.json, enrich each unprocessed name
 * via LLM, append results to output/ai_new_events.json.
 *
 * - Reads/writes local files only (no Supabase)
 * - Marks entries as processed: true in ai_new_events_name_list.json
 * - Default model: gpt-4o-mini (OpenAI Structured Outputs)
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { NameListEntry } from './collect-names';
import { chatJSON, MODELS } from './openai';

const OUTPUT_DIR       = join(__dirname, 'output');
const NAME_LIST_PATH   = join(OUTPUT_DIR, 'ai_new_events_name_list.json');
const EVENTS_PATH      = join(OUTPUT_DIR, 'ai_new_events.json');

// ── File helpers ──────────────────────────────────────────────────────

function loadNameList(): NameListEntry[] {
  if (!existsSync(NAME_LIST_PATH)) return [];
  try { return JSON.parse(readFileSync(NAME_LIST_PATH, 'utf-8')); } catch { return []; }
}


function loadEvents(): any[] {
  if (!existsSync(EVENTS_PATH)) return [];
  try { return JSON.parse(readFileSync(EVENTS_PATH, 'utf-8')); } catch { return []; }
}

function saveNameList(list: NameListEntry[]): void {
  writeFileSync(NAME_LIST_PATH, JSON.stringify(list, null, 2), 'utf-8');
}

function saveEvents(events: any[]): void {
  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(EVENTS_PATH, JSON.stringify(events, null, 2), 'utf-8');
}

// ── Prompt ────────────────────────────────────────────────────────────

async function fetchSourcePageText(sourceUrl?: string | null): Promise<string> {
  if (!sourceUrl) return '';
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(sourceUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html,application/xhtml+xml' },
    });
    clearTimeout(timer);
    if (!res.ok) return '';
    const html = await res.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 8000);
  } catch {
    return '';
  }
}

function buildPrompt(eventName: string, sourceUrl?: string | null, pageText = ''): string {
  const eventLine = sourceUrl
    ? `Event: ${eventName}\nSource URL (where this event was found, not necessarily the official page): ${sourceUrl}`
    : `Event: ${eventName}`;
  const sourceNote = sourceUrl
    ? `Prefer the official event website for all data. Only fall back to the Source URL above if no official page can be found.`
    : '';
  const pageContent = pageText
    ? `\nFetched source page content:\n${pageText}\n`
    : '';
  return `Event Data Spec

Using the event name, source URL, and fetched page content below, provide structured event data for this NYC event. Output exactly one event object. If you do not have enough information to fill the required fields, return an empty events array.

${eventLine}
${sourceNote}
${pageContent}

---
Event fields

source_id (string, required) — Format: ai-{slug}-{YYYY-MM}. Example: "ai-jazz-festival-2026-05"
title (string, required) — Event name as listed on the official source.
category (string, required) — One of: art, live_music, comedy, food, outdoors, nightlife, popups, fitness, theater, workshops
description (string, required) — Write this like The Infatuation or Eater would. 1-2 sentences that make a 27-year-old NYC professional want to go. Be specific about what makes this worth their time — the chef's pedigree, the venue's reputation, the lineup, the one-night-only factor, the brand. No generic hype. No "don't miss this!" or "exciting event!" — just tell them why it's good.
start_date (string, required) — YYYY-MM-DD
end_date (string, optional) — YYYY-MM-DD, only if multi-day
venue_name (string, optional)
address (string, required) — Full address incl. city, state, zip. Use "various places" if multiple.
borough (string, required) — One of: Manhattan, Brooklyn, Queens, Bronx, Staten Island, Various borough
price_min (number, required) — 0 if free
price_max (number, optional)
is_free (boolean, required)
event_url (string, required) — Official page URL
image_url (string, required) — Direct image URL (.jpg/.jpeg/.png/.webp)
ticket_url (string, optional)
tags (string[], optional)
sessions (array, optional) — Use when event has multiple occurrences

Sessions fields: date (YYYY-MM-DD), time (optional), venue_name/address/borough/price_min/price_max (optional, only if differs per session)

---
Rules
- Only upcoming events (start_date or at least one session date must be today or future)
- NYC only — addresses must be in the five boroughs
- is_free: true only if entirely free
- sessions: use instead of splitting into multiple event objects
- Omit any field you cannot confirm
- price_min/price_max: ONLY use prices from the official ticket/event page. If price is not clearly listed, set price_min: 0 and is_free: false (unknown price, not confirmed free).
- start_date: MUST match the official event page exactly. Do not guess or infer dates.
- If you do not have enough information to fill required fields accurately, return an empty events array rather than guessing.

Return ONLY a valid JSON array, no markdown, no explanation.`;
}

// ── JSON Schema for Structured Outputs ────────────────────────────────

const EVENT_SCHEMA = {
  name: 'enrich_events_response',
  schema: {
    type: 'object',
    properties: {
      events: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            source_id:   { type: 'string' },
            title:       { type: 'string' },
            category:    { type: 'string', enum: ['art', 'live_music', 'comedy', 'food', 'outdoors', 'nightlife', 'popups', 'fitness', 'theater', 'workshops'] },
            description: { type: 'string' },
            start_date:  { type: 'string' },
            end_date:    { type: ['string', 'null'] },
            venue_name:  { type: ['string', 'null'] },
            address:     { type: 'string' },
            borough:     { type: 'string', enum: ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island', 'Various borough'] },
            price_min:   { type: 'number' },
            price_max:   { type: ['number', 'null'] },
            is_free:     { type: 'boolean' },
            event_url:   { type: 'string' },
            image_url:   { type: ['string', 'null'] },
            ticket_url:  { type: ['string', 'null'] },
            tags:        { type: ['array', 'null'], items: { type: 'string' } },
            sessions:    { type: ['array', 'null'], items: {
              type: 'object',
              properties: {
                date:       { type: 'string' },
                time:       { type: ['string', 'null'] },
                venue_name: { type: ['string', 'null'] },
                address:    { type: ['string', 'null'] },
                borough:    { type: ['string', 'null'] },
                price_min:  { type: ['number', 'null'] },
                price_max:  { type: ['number', 'null'] },
              },
              required: ['date', 'time', 'venue_name', 'address', 'borough', 'price_min', 'price_max'],
              additionalProperties: false,
            } },
          },
          required: ['source_id', 'title', 'category', 'description', 'start_date', 'end_date', 'venue_name', 'address', 'borough', 'price_min', 'price_max', 'is_free', 'event_url', 'image_url', 'ticket_url', 'tags', 'sessions'],
          additionalProperties: false,
        },
      },
    },
    required: ['events'],
    additionalProperties: false,
  },
} as const;

// ── Model call ────────────────────────────────────────────────────────

async function callModel(model: string, prompt: string): Promise<any[]> {
  const result = await chatJSON<{ events: any[] }>(
    model,
    [
      { role: 'system', content: 'You are a data extraction assistant for NYC events. Use the event name, source URL, and fetched source page content to fill in structured event data. If you lack sufficient information for required fields, return an empty events array.' },
      { role: 'user', content: prompt },
    ],
    EVENT_SCHEMA
  );
  return result.events ?? [];
}

// ── Main export ───────────────────────────────────────────────────────

export async function enrichEvents(model = 'gpt-4o-mini'): Promise<void> {
  const nameList = loadNameList();
  const allEvents = loadEvents();

  // Processed = source_url already appears in ai_new_events.json
  const processedUrls = new Set(allEvents.map((e: any) => e.source_url).filter(Boolean));
  const unprocessed = nameList.filter(e => !e.source_url || !processedUrls.has(e.source_url));

  if (unprocessed.length === 0) {
    console.log('[enrich] All names already processed');
    return;
  }

  console.log(`[enrich] ${unprocessed.length} unprocessed names, model: ${model}`);
  let totalAdded = 0;

  for (let i = 0; i < unprocessed.length; i++) {
    const entry = unprocessed[i];

    console.log(`[enrich] ${i + 1}/${unprocessed.length}: ${entry.name}`);

    try {
      const pageText = await fetchSourcePageText(entry.source_url);
      const events = await callModel(model, buildPrompt(entry.name, entry.source_url, pageText));
      // Attach source_url from name list entry
      const enriched = events.map(ev => ({ ...ev, source_url: entry.source_url }));
      allEvents.push(...enriched);
      totalAdded += enriched.length;
      console.log(`[enrich] Got ${enriched.length} events`);
      saveEvents(allEvents);
    } catch (err) {
      const msg = (err as Error).message;
      console.error(`[enrich] Error for "${entry.name}":`, msg);

      const retryMatch = msg.match(/try again in ([\d.]+)s/i);
      const waitMs = retryMatch ? Math.ceil(parseFloat(retryMatch[1]) * 1000) + 1000 : 15000;
      console.log(`[enrich] Waiting ${waitMs / 1000}s before retry...`);
      await new Promise(r => setTimeout(r, waitMs));
      i--;
      continue;
    }

    if (i + 1 < unprocessed.length) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  console.log(`[enrich] Done. Added ${totalAdded} events. Total in file: ${allEvents.length}`);

  // Remove name list entries that failed to enrich (source_url not in events file)
  const enrichedUrls = new Set(allEvents.map((e: any) => e.source_url).filter(Boolean));
  const before = nameList.length;
  const cleaned = nameList.filter(e => e.source_url && enrichedUrls.has(e.source_url));
  if (cleaned.length < before) {
    saveNameList(cleaned);
    console.log(`[enrich] Removed ${before - cleaned.length} failed entries from name list`);
  }
}

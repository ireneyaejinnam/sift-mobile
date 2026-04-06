/**
 * LLM enrichment step — uses Claude (Haiku) to improve data accuracy.
 *
 * Runs after reclassify, before dedup.
 * Processes events in batches of 20 and asks Claude to:
 *   - Verify/fix category
 *   - Determine is_free from text when unclear
 *   - Identify borough from venue/address when missing
 *   - Clean description (strip HTML artifacts, trim to 300 chars)
 *
 * Only fields Claude is confident about are written back.
 * Events already having good data are left untouched.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const BATCH_SIZE = 20;

const VALID_CATEGORIES = [
  'live_music', 'art', 'theater', 'comedy', 'workshops',
  'fitness', 'food', 'outdoors', 'nightlife', 'popups',
];

const VALID_BOROUGHS = ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island'];

interface EventRow {
  id: string;
  title: string;
  description?: string;
  venue_name?: string;
  address?: string;
  category: string;
  is_free: boolean;
  borough?: string;
  tags?: string[];
}

interface EnrichResult {
  id: string;
  category?: string;
  is_free?: boolean;
  borough?: string;
  description?: string;
}

async function enrichBatch(events: EventRow[]): Promise<EnrichResult[]> {
  const input = events.map((e) => ({
    id: e.id,
    title: e.title,
    description: e.description?.slice(0, 400),
    venue: e.venue_name,
    address: e.address,
    category: e.category,
    is_free: e.is_free,
    borough: e.borough ?? null,
    tags: e.tags,
  }));

  const prompt = `You are a NYC event data quality checker. Given the following events, return a JSON array of corrections.

For each event, only include fields you are confident about:
- "category": re-classify if clearly wrong. Valid values: ${VALID_CATEGORIES.join(', ')}
- "is_free": true/false only if you can determine it from the title or description
- "borough": one of ${VALID_BOROUGHS.join(', ')} — only if determinable from venue name or address
- "description": a clean 1–2 sentence summary (max 200 chars). Remove HTML artifacts, redundant phrases like "Join us for...", ticket info. Keep it punchy and descriptive.

Rules:
- If you're unsure about a field, omit it entirely — do NOT guess
- Always include the "id" field
- Return ONLY a valid JSON array, no other text

Events:
${JSON.stringify(input, null, 2)}`;

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = message.content[0].type === 'text' ? message.content[0].text : '';

  // Extract JSON from response (Claude may wrap in markdown)
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.warn('[Enrich] Could not parse JSON from Claude response');
    return [];
  }

  try {
    const results = JSON.parse(jsonMatch[0]) as EnrichResult[];
    return results.filter((r) => r.id);
  } catch {
    console.warn('[Enrich] JSON parse error');
    return [];
  }
}

export async function enrichEvents(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('[Enrich] ANTHROPIC_API_KEY not set, skipping enrichment');
    return;
  }

  console.log('[Enrich] Starting LLM enrichment...');

  // Fetch events that may need enrichment:
  // - missing borough, OR
  // - description looks like raw HTML / too short, OR
  // - recently ingested (no need to re-enrich old events)
  const { data: events, error } = await supabase
    .from('events')
    .select('id, title, description, venue_name, address, category, is_free, borough, tags')
    .or('borough.is.null,description.is.null')
    .gte('start_date', new Date().toISOString().split('T')[0])
    .limit(500);

  if (error || !events || events.length === 0) {
    console.log('[Enrich] No events to enrich:', error?.message ?? 'empty result');
    return;
  }

  console.log(`[Enrich] Enriching ${events.length} events in batches of ${BATCH_SIZE}...`);

  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < events.length; i += BATCH_SIZE) {
    const batch = events.slice(i, i + BATCH_SIZE) as EventRow[];

    try {
      const results = await enrichBatch(batch);

      for (const result of results) {
        const patch: Record<string, unknown> = {};

        if (result.category && VALID_CATEGORIES.includes(result.category)) {
          patch.category = result.category;
        }
        if (typeof result.is_free === 'boolean') {
          patch.is_free = result.is_free;
          if (result.is_free) patch.price_min = 0;
        }
        if (result.borough && VALID_BOROUGHS.includes(result.borough)) {
          patch.borough = result.borough;
        }
        if (result.description && result.description.length > 20) {
          patch.description = result.description.slice(0, 300).trim();
        }

        if (Object.keys(patch).length > 0) {
          await supabase.from('events').update(patch).eq('id', result.id);
          updated++;
        } else {
          skipped++;
        }
      }

      console.log(`[Enrich] Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${results.length} processed`);

      // Respect API rate limits — small delay between batches
      if (i + BATCH_SIZE < events.length) {
        await new Promise((r) => setTimeout(r, 500));
      }
    } catch (err) {
      console.error(`[Enrich] Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, err);
    }
  }

  console.log(`[Enrich] Done. Updated: ${updated}, No changes: ${skipped}`);
}

// Run directly: npx tsx --env-file=.env lib/ingest/enrich.ts
if (process.argv[1] && process.argv[1].endsWith('enrich.ts')) {
  enrichEvents().catch(console.error);
}

/**
 * generate-hooks.ts
 *
 * Generates AI hook text for events that don't have one yet.
 * Hook text is a punchy 2-sentence pitch in the voice of TimeOut / The Infatuation.
 *
 * Targets:
 *   --target local   Update lib/ai-collect-data/output/ai_new_events.json (default)
 *   --target db      Update events table in Supabase
 *   --target both    Both
 *
 * Other flags:
 *   --limit N        Only process N events (useful for testing)
 *   --dry-run        Print hooks without writing
 *
 * Usage:
 *   npx tsx --env-file=.env lib/ai-collect-data/generate-hooks.ts
 *   npx tsx --env-file=.env lib/ai-collect-data/generate-hooks.ts --target db --limit 50
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { chatJSON } from './openai';

const EVENTS_PATH = join(__dirname, 'output/ai_new_events.json');

const args = process.argv.slice(2);
function getArg(flag: string): string | undefined {
  const eq = args.find(a => a.startsWith(`${flag}=`))?.split('=')[1];
  if (eq) return eq;
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith('--')) return args[idx + 1];
  return undefined;
}

const target = getArg('--target') ?? 'local';
const limitRaw = getArg('--limit');
const limit = limitRaw ? parseInt(limitRaw, 10) : Infinity;
const dryRun = args.includes('--dry-run');

const SYSTEM_PROMPT = `You write event copy for Sift, a curation app for 18–35 NYC professionals.
Voice: TimeOut NY / The Infatuation. Specific, confident, zero generic hype.
Format: exactly 1–2 sentences. No "don't miss", no "exciting", no "join us", no "step into".
Tell them WHY it's worth their Friday night — the name, the venue reputation, the one-night factor, the chef, the lineup, the rarity.
If the event is free, mention it naturally. If it's a recurring show, say what makes this run special.
Output only the hook text, no quotes, no extra commentary.`;

const HOOKS_SCHEMA = {
  name: 'hooks_response',
  schema: {
    type: 'object',
    properties: {
      hooks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            index: { type: 'number' },
            hook_text: { type: 'string' },
          },
          required: ['index', 'hook_text'],
          additionalProperties: false,
        },
      },
    },
    required: ['hooks'],
    additionalProperties: false,
  },
} as const;

function buildEventSummary(event: any, index: number): string {
  const parts = [
    `[${index}] Title: ${event.title}`,
    event.venue_name ? `  Venue: ${event.venue_name}` : null,
    event.borough ? `  Borough: ${event.borough}` : null,
    `  Category: ${event.category}`,
    event.description ? `  Description: ${event.description}` : null,
    event.price_min === 0 || event.is_free ? `  Price: Free` : event.price_min ? `  Price: from $${event.price_min}` : null,
    event.tags?.length ? `  Tags: ${event.tags.join(', ')}` : null,
  ].filter(Boolean);
  return parts.join('\n');
}

async function generateHooksBatch(events: any[]): Promise<Map<number, string>> {
  const results = new Map<number, string>();
  const summaries = events.map((e, i) => buildEventSummary(e, i)).join('\n\n');

  try {
    const response = await chatJSON<{ hooks: Array<{ index: number; hook_text: string }> }>(
      'gpt-4o-mini',
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Write a hook for each event below. Return one hook per event using the index number.\n\n${summaries}` },
      ],
      HOOKS_SCHEMA
    );
    for (const h of response.hooks) {
      if (h.hook_text?.trim()) results.set(h.index, h.hook_text.trim());
    }
  } catch (err) {
    console.error(`  ✗ OpenAI batch error:`, err);
  }
  return results;
}

const BATCH_SIZE = 10;

async function processLocal() {
  const events: any[] = JSON.parse(readFileSync(EVENTS_PATH, 'utf-8'));
  const needsHook = events.filter(e => !e.hook_text).slice(0, limit === Infinity ? undefined : limit);

  console.log(`[local] ${needsHook.length} events need hooks (${events.length} total), batch size: ${BATCH_SIZE}`);
  if (needsHook.length === 0) return;

  let done = 0;
  for (let i = 0; i < needsHook.length; i += BATCH_SIZE) {
    const batch = needsHook.slice(i, i + BATCH_SIZE);
    console.log(`  [batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(needsHook.length / BATCH_SIZE)}] ${batch.length} events`);

    const hookMap = await generateHooksBatch(batch);

    for (let j = 0; j < batch.length; j++) {
      const event = batch[j];
      const hook = hookMap.get(j);
      done++;
      if (hook) {
        if (dryRun) {
          console.log(`    [${done}] ${event.title.slice(0, 50)} → ${hook}`);
        } else {
          event.hook_text = hook;
          console.log(`    [${done}] ${event.title.slice(0, 50)} ✓`);
        }
      } else {
        console.log(`    [${done}] ${event.title.slice(0, 50)} ✗ skipped`);
      }
    }

    if (!dryRun) {
      writeFileSync(EVENTS_PATH, JSON.stringify(events, null, 2), 'utf-8');
    }
    await new Promise(r => setTimeout(r, 500));
  }

  if (!dryRun) {
    console.log(`\n[local] Done. Wrote hooks to ${EVENTS_PATH}`);
  }
}

async function processDB(table: 'events' | 'ai_events') {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  let offset = 0;
  const fetchSize = 50;
  let totalProcessed = 0;

  while (totalProcessed < limit) {
    const remaining = Math.min(fetchSize, limit - totalProcessed);
    const { data, error } = await supabase
      .from(table)
      .select('id, title, description, category, venue_name, borough, price_min, is_free, tags')
      .is('hook_text', null)
      .eq('is_suppressed', false)
      .range(offset, offset + remaining - 1);

    if (error) { console.error(`[${table}] fetch error:`, error.message); break; }
    if (!data || data.length === 0) { console.log(`[${table}] No more events to process.`); break; }

    console.log(`[${table}] Processing ${data.length} events in batches of ${BATCH_SIZE}...`);

    for (let i = 0; i < data.length; i += BATCH_SIZE) {
      const batch = data.slice(i, i + BATCH_SIZE);
      const hookMap = await generateHooksBatch(batch);

      for (let j = 0; j < batch.length; j++) {
        const event = batch[j];
        const hook = hookMap.get(j);
        if (hook) {
          if (dryRun) {
            console.log(`    ${event.title.slice(0, 50)} → ${hook}`);
          } else {
            const { error: updateErr } = await supabase
              .from(table)
              .update({ hook_text: hook })
              .eq('id', event.id);
            if (updateErr) console.log(`    ${event.title.slice(0, 50)} ✗ update failed: ${updateErr.message}`);
            else console.log(`    ${event.title.slice(0, 50)} ✓`);
          }
        } else {
          console.log(`    ${event.title.slice(0, 50)} ✗ skipped`);
        }
        totalProcessed++;
      }
      await new Promise(r => setTimeout(r, 500));
    }

    offset += data.length;
  }

  console.log(`[${table}] Done. Processed ${totalProcessed} events.`);
}

async function main() {
  console.log(`generate-hooks — target: ${target}, limit: ${limit === Infinity ? 'all' : limit}, dry-run: ${dryRun}\n`);

  if (target === 'local' || target === 'both') await processLocal();
  if (target === 'db' || target === 'both') {
    await processDB('events');
  }
}

main().catch(console.error);

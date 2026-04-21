/**
 * generate-hooks.ts
 *
 * Generates AI hook text for events that don't have one yet.
 * Hook text is a punchy 2-sentence pitch in the voice of TimeOut / The Infatuation.
 *
 * Targets:
 *   --target local   Update lib/ai-collect-data/output/ai_new_events.json (default)
 *   --target db      Update events + ai_events tables in Supabase (requires migration 007)
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

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

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

function buildUserMessage(event: any): string {
  const parts = [
    `Title: ${event.title}`,
    event.venue_name ? `Venue: ${event.venue_name}` : null,
    event.borough ? `Borough: ${event.borough}` : null,
    `Category: ${event.category}`,
    event.description ? `Description: ${event.description}` : null,
    event.price_min === 0 || event.is_free ? `Price: Free` : event.price_min ? `Price: from $${event.price_min}` : null,
    event.tags?.length ? `Tags: ${event.tags.join(', ')}` : null,
  ].filter(Boolean);
  return parts.join('\n') + '\n\nWrite the hook.';
}

async function generateHook(event: any): Promise<string | null> {
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserMessage(event) }],
    });
    const text = (msg.content[0] as any).text?.trim();
    return text || null;
  } catch (err) {
    console.error(`  ✗ Claude error for "${event.title}":`, err);
    return null;
  }
}

async function processLocal() {
  const events: any[] = JSON.parse(readFileSync(EVENTS_PATH, 'utf-8'));
  const needsHook = events.filter(e => !e.hook_text).slice(0, limit === Infinity ? undefined : limit);

  console.log(`[local] ${needsHook.length} events need hooks (${events.length} total)`);
  if (needsHook.length === 0) return;

  let done = 0;
  for (const event of needsHook) {
    process.stdout.write(`  [${++done}/${needsHook.length}] ${event.title.slice(0, 50)}...`);
    const hook = await generateHook(event);
    if (hook) {
      if (dryRun) {
        console.log(`\n    → ${hook}`);
      } else {
        event.hook_text = hook;
        console.log(' ✓');
      }
    } else {
      console.log(' ✗ skipped');
    }
    if (!dryRun && done % 10 === 0) {
      writeFileSync(EVENTS_PATH, JSON.stringify(events, null, 2), 'utf-8');
      console.log(`  [saved ${done} so far]`);
    }
    await new Promise(r => setTimeout(r, 400));
  }

  if (!dryRun) {
    writeFileSync(EVENTS_PATH, JSON.stringify(events, null, 2), 'utf-8');
    console.log(`\n[local] Done. Wrote hooks to ${EVENTS_PATH}`);
  }
}

async function processDB(table: 'events' | 'ai_events') {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  let offset = 0;
  const batchSize = 50;
  let totalProcessed = 0;

  while (totalProcessed < limit) {
    const fetchSize = Math.min(batchSize, limit - totalProcessed);
    const { data, error } = await supabase
      .from(table)
      .select('id, title, description, category, venue_name, borough, price_min, is_free, tags')
      .is('hook_text', null)
      .eq('is_suppressed', false)
      .range(offset, offset + fetchSize - 1);

    if (error) { console.error(`[${table}] fetch error:`, error.message); break; }
    if (!data || data.length === 0) { console.log(`[${table}] No more events to process.`); break; }

    console.log(`[${table}] Processing batch of ${data.length}...`);

    for (const event of data) {
      process.stdout.write(`  ${event.title.slice(0, 50)}...`);
      const hook = await generateHook(event);
      if (hook) {
        if (dryRun) {
          console.log(`\n    → ${hook}`);
        } else {
          const { error: updateErr } = await supabase
            .from(table)
            .update({ hook_text: hook })
            .eq('id', event.id);
          if (updateErr) console.log(` ✗ update failed: ${updateErr.message}`);
          else console.log(' ✓');
        }
      } else {
        console.log(' ✗ skipped');
      }
      totalProcessed++;
      await new Promise(r => setTimeout(r, 400));
    }

    await new Promise(r => setTimeout(r, 3000));
    offset += data.length;
  }

  console.log(`[${table}] Done. Processed ${totalProcessed} events.`);
}

async function main() {
  console.log(`generate-hooks — target: ${target}, limit: ${limit === Infinity ? 'all' : limit}, dry-run: ${dryRun}\n`);

  if (target === 'local' || target === 'both') await processLocal();
  if (target === 'db' || target === 'both') {
    await processDB('events');
    await processDB('ai_events');
  }
}

main().catch(console.error);

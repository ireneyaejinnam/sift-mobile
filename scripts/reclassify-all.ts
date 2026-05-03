/**
 * One-time script: re-categorize all events via gpt-4o-mini.
 * Cost: ~$0.20 for ~2000 events.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/reclassify-all.ts
 *   npx tsx --env-file=.env scripts/reclassify-all.ts --dry-run
 */

import { createClient } from '@supabase/supabase-js';
import { chatJSON } from '../lib/ai-collect-data/openai';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const dryRun = process.argv.includes('--dry-run');
const BATCH_SIZE = 20;

const CATEGORY_SCHEMA = {
  name: 'category_response',
  schema: {
    type: 'object',
    properties: {
      categories: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            index: { type: 'number' },
            category: { type: 'string' },
          },
          required: ['index', 'category'],
          additionalProperties: false,
        },
      },
    },
    required: ['categories'],
    additionalProperties: false,
  },
} as const;

const SYSTEM = `You categorize NYC events. For each event, return exactly one category from this list:

- art: gallery exhibitions, museum shows, art fairs, photography exhibits, art openings, film screenings, film festivals
- live_music: concerts, live bands, DJ sets, album releases, jazz clubs, music festivals, tour stops
- comedy: stand-up, improv, comedy shows, roasts, open mics
- food: restaurant openings, food festivals, tastings, supper clubs, chef collabs, food markets
- outdoors: parks events, outdoor festivals, nature walks, kayaking, outdoor screenings (NOT indoor film festivals)
- nightlife: club nights, dance parties, raves, rooftop parties, bar events, lounge nights
- popups: sample sales, brand pop-ups, store openings, launch events, markets, flea markets, one-off experiences, branded activations, free brand events, product launches
- fitness: run clubs, gym events, workout classes, yoga, pilates, cycling, sports events, races
- theater: Broadway shows, off-Broadway plays, musicals, opera, ballet, staged performances ONLY. NOT pop-ups, NOT art shows, NOT immersive brand experiences
- workshops: classes, masterclasses, DIY workshops, lectures, panels, skill-building events

IMPORTANT distinctions:
- Brand pop-ups, launch events, free brand experiences = popups (NOT theater, NOT nightlife)
- Immersive brand experiences = popups (NOT theater)
- Film screenings, film festivals = art (NOT outdoors)
- DJ sets at venues = live_music. Club nights = nightlife. Use context to decide.
- Juice press launch, product launch = popups (NOT nightlife, NOT food)
- Barry's bootcamp, run clubs = fitness (NOT outdoors)
- Gallery at BAH = art (NOT theater)`;

function buildBatchMessage(events: any[]): string {
  return events.map((e, i) => {
    return `[${i}] "${e.title}"${e.venue_name ? ` at ${e.venue_name}` : ''}${e.description ? ` — ${e.description.slice(0, 100)}` : ''}`;
  }).join('\n');
}

async function main() {
  console.log(`[reclassify-all] Starting... dry-run: ${dryRun}`);

  // Fetch all events in batches (PostgREST defaults to 1000 max per query)
  let allEvents: any[] = [];
  let offset = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('events')
      .select('id, title, description, venue_name, category')
      .eq('is_suppressed', false)
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE - 1);
    if (error) { console.error('Fetch error:', error.message); return; }
    if (!data || data.length === 0) break;
    allEvents.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  const events = allEvents;

  if (events.length === 0) {
    console.error('No events found');
    return;
  }

  console.log(`[reclassify-all] ${events.length} events to reclassify`);

  let changed = 0;
  let unchanged = 0;

  for (let i = 0; i < events.length; i += BATCH_SIZE) {
    const batch = events.slice(i, i + BATCH_SIZE);
    console.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(events.length / BATCH_SIZE)}`);

    try {
      const result = await chatJSON<{ categories: Array<{ index: number; category: string }> }>(
        'gpt-4o-mini',
        [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: `Categorize each event:\n\n${buildBatchMessage(batch)}` },
        ],
        CATEGORY_SCHEMA
      );

      for (const c of result.categories) {
        const event = batch[c.index];
        if (!event) continue;

        if (c.category !== event.category) {
          if (dryRun) {
            console.log(`    ${event.title.slice(0, 50)}: ${event.category} → ${c.category}`);
          } else {
            await supabase.from('events').update({ category: c.category }).eq('id', event.id);
          }
          changed++;
        } else {
          unchanged++;
        }
      }
    } catch (err) {
      console.error(`  Batch error:`, (err as Error).message);
    }

    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`[reclassify-all] Done. Changed: ${changed}, Unchanged: ${unchanged}`);
}

main().catch(console.error);

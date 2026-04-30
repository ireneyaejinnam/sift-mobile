/**
 * score-scraped.ts
 *
 * Pulls events from Supabase where source != 'ai' AND vibe_checked = false.
 * Batches 20 events per gpt-4o-mini call with Structured Outputs.
 * Returns { vibe_score 1-10, is_suppressed, reason }.
 *
 * Suppresses if:
 *   - Tourist-only (walking tours, harbor cruises, hop-on-hop-off)
 *   - False/spam listings
 *   - Networking/corporate events
 *   - vibe_score < 4
 *
 * Usage:
 *   npx tsx --env-file=.env lib/ai-collect-data/score-scraped.ts
 *   npx tsx --env-file=.env lib/ai-collect-data/score-scraped.ts --limit 100 --dry-run
 */

import { createClient } from '@supabase/supabase-js';
import { chatJSON } from './openai';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const DEFAULT_LIMIT = 500;
const BATCH_SIZE = 20;

const args = process.argv.slice(2);
const limitArg = args.indexOf('--limit');
const limit = (limitArg !== -1 && args[limitArg + 1])
  ? parseInt(args[limitArg + 1], 10)
  : DEFAULT_LIMIT;
const dryRun = args.includes('--dry-run');

const SCORE_SCHEMA = {
  name: 'vibe_score_response',
  schema: {
    type: 'object',
    properties: {
      scores: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            index: { type: 'number' },
            vibe_score: { type: 'number' },
            is_suppressed: { type: 'boolean' },
            reason: { type: 'string' },
          },
          required: ['index', 'vibe_score', 'is_suppressed', 'reason'],
          additionalProperties: false,
        },
      },
    },
    required: ['scores'],
    additionalProperties: false,
  },
} as const;

const SYSTEM_PROMPT = `You score NYC events 1-10 for Sift, a curation app for 18-35 NYC professionals.

SUPPRESS (score 1-3, is_suppressed: true):
- Tourist traps: walking tours, harbor cruises, hop-on-hop-off, scavenger hunts, Times Square shows, Madame Tussauds
- Corporate/professional: networking mixers, career fairs, real estate seminars, speed networking
- Spam/false: fake listings, MLM events, webinars, virtual events
- Wrong demo: kids/family events, senior fitness, mommy & me
- Generic low-effort: pub crawls, themeless happy hours, "DJ TBD"
- Chain venues with no identity (Dave & Buster's, Bowlero, Hard Rock Cafe)

KEEP (score 6-10, is_suppressed: false):
- Named artists/DJs at real venues
- Brand pop-ups, sample sales with named brands
- Museum exhibitions, gallery openings
- Restaurant openings covered by Eater/Infatuation
- Comedy with named comics at real venues
- Fitness events at known studios/run clubs

Score 4-5: borderline — suppress if generic, keep if has specificity.

The test: Would a 28-year-old who works in tech/finance/media/fashion text this to their group chat?`;

function buildBatchMessage(events: any[]): string {
  return events.map((e, i) => {
    const parts = [
      `[${i}] ${e.title}`,
      e.venue_name ? `  Venue: ${e.venue_name}` : null,
      e.category ? `  Category: ${e.category}` : null,
      e.source ? `  Source: ${e.source}` : null,
      e.description ? `  Desc: ${e.description.slice(0, 200)}` : null,
      e.is_free ? '  Free' : e.price_min ? `  Price: $${e.price_min}` : null,
    ].filter(Boolean);
    return parts.join('\n');
  }).join('\n\n');
}

interface ScoreResult {
  index: number;
  vibe_score: number;
  is_suppressed: boolean;
  reason: string;
}

async function scoreBatch(events: any[]): Promise<ScoreResult[]> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await chatJSON<{ scores: ScoreResult[] }>(
        'gpt-4o-mini',
        [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Score each event:\n\n${buildBatchMessage(events)}` },
        ],
        SCORE_SCHEMA
      );
      return result.scores ?? [];
    } catch (err) {
      console.error(`[score-scraped] Batch error (attempt ${attempt + 1}/2):`, (err as Error).message);
      if (attempt === 0) await new Promise(r => setTimeout(r, 5000));
    }
  }
  console.error('[score-scraped] Skipped batch after 2 attempts:', events.map(e => e.title).join(', '));
  return [];
}

async function main() {
  console.log(`[score-scraped] Starting — limit: ${limit}, dry-run: ${dryRun}`);

  const { data, error } = await supabase
    .from('events')
    .select('id, title, description, category, venue_name, source, price_min, is_free')
    .eq('vibe_checked', false)
    .eq('source_type', 'scraper')
    .limit(limit);

  if (error) {
    console.error('[score-scraped] Fetch error:', error.message);
    return;
  }

  if (!data || data.length === 0) {
    console.log('[score-scraped] No unchecked events found');
    return;
  }

  console.log(`[score-scraped] ${data.length} events to score`);

  let totalScored = 0;
  let totalSuppressed = 0;

  for (let i = 0; i < data.length; i += BATCH_SIZE) {
    const batch = data.slice(i, i + BATCH_SIZE);
    console.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(data.length / BATCH_SIZE)} (${batch.length} events)`);

    const scores = await scoreBatch(batch);

    for (const s of scores) {
      const event = batch[s.index];
      if (!event) continue;

      const suppress = s.is_suppressed || s.vibe_score < 5;

      if (dryRun) {
        console.log(`    ${event.title.slice(0, 50)} → ${s.vibe_score}/10 ${suppress ? 'SUPPRESS' : 'KEEP'} (${s.reason})`);
      } else {
        const { error: updateErr } = await supabase
          .from('events')
          .update({
            vibe_score: s.vibe_score,
            vibe_checked: true,
            is_suppressed: suppress,
          })
          .eq('id', event.id);

        if (updateErr) {
          console.error(`    ${event.title.slice(0, 50)} — update error: ${updateErr.message}`);
        }
      }

      totalScored++;
      if (suppress) totalSuppressed++;
    }

    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`[score-scraped] Done. Scored: ${totalScored}, Suppressed: ${totalSuppressed}`);
}

main().catch(console.error);

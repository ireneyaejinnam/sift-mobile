/**
 * vibe-check-current.ts
 *
 * Fetches unchecked events from Supabase (vibe_checked = false), sends them
 * to Claude Haiku in batches of 20, and writes results directly to the DB:
 *   - vibe_score (1–10)
 *   - vibe_checked = true
 *   - is_suppressed = true  (for score ≤ 3)
 *
 * No JSON files. Run after migration 003_vibe_taste.sql and import-vibe-json.ts.
 *
 * Usage:
 *   npx tsx scripts/vibe-check-current.ts
 *
 * Env required (reads from .env):
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY, ANTHROPIC_API_KEY
 */

import * as fs from 'fs';
import * as path from 'path';

const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const [key, ...rest] = line.split('=');
    if (key && !key.startsWith('#') && rest.length) {
      process.env[key.trim()] = rest.join('=').trim().replace(/^["']|["']$/g, '');
    }
  }
}

import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);
const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ALREADY_EXCLUDED = new Set(['nyc_tourism', 'nyc_gov', 'yelp', 'meetup']);
const BATCH_SIZE = 20;

type EventRow = {
  id: string;
  title: string;
  description?: string | null;
  venue_name?: string | null;
  category: string;
  source: string;
};

async function vibeCheckBatch(events: EventRow[]): Promise<{ id: string; score: number; reason: string }[]> {
  const list = events.map((e, i) =>
    `${i + 1}. Title: ${e.title}\n   Venue: ${e.venue_name ?? 'unknown'}\n   Category: ${e.category}\n   Description: ${(e.description ?? '').slice(0, 150)}`
  ).join('\n\n');

  const prompt = `You are a quality filter for a NYC event discovery app for locals aged 22–40 (Gen Z + Millennials who live in NYC — not tourists, not corporate professionals).

Rate each event 1–10 for quality and demographic fit. Be generous — only suppress clear junk.

SUPPRESS (score 1–3):
- Tourist sightseeing: walking tours, boat/harbor cruises, "best of NYC" landmark tours, Times Square activities
- Corporate/professional: networking mixers, job fairs, career workshops, pitch nights, investor events, real estate seminars, webinars
- Promotional disguised as events: MLM, skincare demos, timeshares, grand openings with no real programming
- Virtual/online-only events listed as in-person

KEEP (score 4–10) — anything a 22–40 NYC local might genuinely attend:
- Live music of ANY size: unknown local acts AND major artists (Lady Gaga at MSG = high score)
- Fashion pop-ups, sample sales, streetwear drops, car meetups, sneaker events
- Food pop-ups, markets, restaurant events, tastings, chef dinners
- Art gallery openings, museum events, immersive experiences
- DJ sets, dance nights, club nights, rooftop parties
- Comedy shows, improv, stand-up, Broadway/Off-Broadway, theater
- Fitness: run clubs, pickleball, cycling, yoga, boxing, sports leagues
- Pro sports games (NBA, MLB, MLS, NHL)
- Film screenings, book launches, panel talks on culture/creativity
- Classes: cooking, ceramics, dance, photography — skill-based and social

Score 8–10: strong venue, clear programming, genuine local appeal
Score 5–7: legitimate but average events
Score 1–3: ONLY tourist traps, corporate filler, and promotional spam

Events:
${list}

Return ONLY a JSON array with one object per event in order:
[{"score": <1-10>, "reason": "<8 words max>"}, ...]`;

  const response = await claude.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = response.content[0].type === 'text' ? response.content[0].text : '';
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) throw new Error(`No JSON array in response: ${raw.slice(0, 200)}`);

  const parsed: { score: number; reason: string }[] = JSON.parse(match[0]);
  return events.map((e, i) => ({
    id: e.id,
    score: parsed[i]?.score ?? 5,
    reason: parsed[i]?.reason ?? '',
  }));
}

async function updateBatch(results: { id: string; score: number }[]) {
  await Promise.all(results.map(({ id, score }) => {
    const update: Record<string, unknown> = { vibe_score: score, vibe_checked: true };
    if (score <= 3) update.is_suppressed = true;
    return supabase.from('events').update(update).eq('id', id);
  }));
}

async function main() {
  const now = new Date().toISOString();

  console.log('[VibeCheck] Fetching unchecked events from Supabase...');
  let allEvents: EventRow[] = [];
  let page = 0;

  while (true) {
    const { data, error } = await supabase
      .from('events')
      .select('id, title, description, venue_name, category, source')
      .eq('vibe_checked', false)
      .eq('is_suppressed', false)
      .or(`start_date.gte.${now},end_date.gte.${now}`)
      .not('source', 'in', `(${[...ALREADY_EXCLUDED].join(',')})`)
      .order('start_date', { ascending: true })
      .range(page * 500, (page + 1) * 500 - 1);

    if (error) { console.error('[VibeCheck] Fetch error:', error.message); break; }
    if (!data?.length) break;
    allEvents = allEvents.concat(data as EventRow[]);
    if (data.length < 500) break;
    page++;
  }

  console.log(`[VibeCheck] ${allEvents.length} unchecked events`);
  console.log(`[VibeCheck] Estimated API calls: ${Math.ceil(allEvents.length / BATCH_SIZE)}\n`);

  if (!allEvents.length) {
    console.log('[VibeCheck] All events already checked. Done.');
    return;
  }

  let checked = 0;
  let suppressed = 0;
  let errors = 0;

  for (let i = 0; i < allEvents.length; i += BATCH_SIZE) {
    const batch = allEvents.slice(i, i + BATCH_SIZE);
    let attempts = 0;

    while (attempts < 3) {
      try {
        const results = await vibeCheckBatch(batch);
        await updateBatch(results);

        for (const r of results) {
          checked++;
          if (r.score <= 3) {
            suppressed++;
            const ev = batch.find(e => e.id === r.id);
            console.log(`  ✗ [${r.score}] "${ev?.title}" — ${r.reason}`);
          } else if (r.score >= 8) {
            const ev = batch.find(e => e.id === r.id);
            console.log(`  ✓ [${r.score}] "${ev?.title}" — ${r.reason}`);
          }
        }
        break;
      } catch (err) {
        const msg = (err as Error).message ?? '';
        if (msg.includes('rate_limit') || msg.includes('529') || msg.includes('overloaded')) {
          attempts++;
          const wait = attempts * 15000;
          console.warn(`  ~ Rate limited, retrying in ${wait / 1000}s...`);
          await new Promise(r => setTimeout(r, wait));
        } else {
          errors++;
          console.error(`  ! Batch failed:`, msg.slice(0, 120));
          // Mark batch as checked with score 5 so we don't retry forever
          await updateBatch(batch.map(e => ({ id: e.id, score: 5 })));
          break;
        }
      }
    }

    const pct = Math.round((Math.min(i + BATCH_SIZE, allEvents.length) / allEvents.length) * 100);
    console.log(`[VibeCheck] Progress: ${Math.min(i + BATCH_SIZE, allEvents.length)}/${allEvents.length} (${pct}%)`);

    if (i + BATCH_SIZE < allEvents.length) {
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  console.log('\n[VibeCheck] ====== Done ======');
  console.log(`  Checked:    ${checked}`);
  console.log(`  Suppressed: ${suppressed}`);
  console.log(`  Errors:     ${errors}`);
}

main().catch(console.error);

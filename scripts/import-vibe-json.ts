/**
 * import-vibe-json.ts
 *
 * One-time migration: pushes existing vibe JSON files → Supabase events table.
 * Run AFTER applying migration 003_vibe_taste.sql.
 *
 * Sources:
 *   lib/ingest/vibe-scores.json      — { [id]: score }  (partial scores from first run)
 *   lib/ingest/vibe-suppressed-ids.json — [id, ...]     (score ≤ 3 events)
 *
 * After this, run vibe-check-current.ts to fill the remaining unchecked events.
 *
 * Usage:
 *   npx tsx scripts/import-vibe-json.ts
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

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const SCORES_PATH     = path.resolve(__dirname, '../lib/ingest/vibe-scores.json');
const SUPPRESSED_PATH = path.resolve(__dirname, '../lib/ingest/vibe-suppressed-ids.json');
const BATCH = 100;

async function batchUpdate(
  rows: { id: string; vibe_score: number; vibe_checked: boolean; is_suppressed?: boolean }[]
) {
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    // Supabase doesn't support bulk updates on non-primary-key fields directly,
    // so we upsert into a temp approach using individual updates in parallel.
    await Promise.all(
      chunk.map(({ id, vibe_score, vibe_checked, is_suppressed }) => {
        const update: Record<string, unknown> = { vibe_score, vibe_checked };
        if (is_suppressed !== undefined) update.is_suppressed = is_suppressed;
        return supabase.from('events').update(update).eq('id', id);
      })
    );
    console.log(`  Updated ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
  }
}

async function main() {
  // Load existing data
  const scoresRaw: Record<string, number> = fs.existsSync(SCORES_PATH)
    ? JSON.parse(fs.readFileSync(SCORES_PATH, 'utf8'))
    : {};

  const suppressedIds: string[] = fs.existsSync(SUPPRESSED_PATH)
    ? JSON.parse(fs.readFileSync(SUPPRESSED_PATH, 'utf8'))
    : [];

  const suppressedSet = new Set(suppressedIds);

  // Merge into a single map
  const allScores = new Map<string, number>();

  // suppressed IDs get score 2 (definitely junk)
  for (const id of suppressedIds) allScores.set(id, 2);

  // exact scores override the default
  for (const [id, score] of Object.entries(scoresRaw)) {
    allScores.set(id, score);
  }

  console.log(`[Import] ${allScores.size} events to update in Supabase`);
  console.log(`  - ${suppressedIds.length} suppressed (score ≤ 3)`);
  console.log(`  - ${Object.keys(scoresRaw).length} with exact scores`);

  const rows = [...allScores.entries()].map(([id, score]) => ({
    id,
    vibe_score: score,
    vibe_checked: true,
    ...(score <= 3 ? { is_suppressed: true } : {}),
  }));

  await batchUpdate(rows);

  console.log('\n[Import] Done. Now run: npx tsx scripts/vibe-check-current.ts');
  console.log('         It will skip already-checked events and fill the rest.');
}

main().catch(console.error);

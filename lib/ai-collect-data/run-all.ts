/**
 * run-all.ts
 *
 * Orchestrates the full AI data collection pipeline:
 *
 *   Step 1  cleanup    — delete expired events from Supabase
 *   Step 2  collect    — fetch event names+URLs, dedup, save to ai_new_events_name_list.json
 *   Step 3  enrich     — enrich each name via LLM, save to ai_new_events.json
 *   Step 4  upsert     — write ai_new_events.json → ai_events + ai_event_sessions in Supabase
 *   Step 2  enrich     — enrich each unprocessed name via LLM, save to ai_new_events.json
 *   Step 3  upsert     — write ai_new_events.json → ai_events + ai_event_sessions in Supabase
 *
 * Usage:
 *   npx tsx --env-file=.env lib/ai-collect-data/run-all.ts [flags]
 *
 * Flags:
 *   --skip-cleanup   skip Step 1
 *   --skip-collect   skip Step 2
 *   --skip-enrich    skip Step 3
 *   --skip-upsert    skip Step 4
 *   --keep-local     keep local JSON files after upsert (default: delete)
 *   --limit N        max events per source (default 20)
 *   --source NAME    only collect from this source (e.g. luma, ticketmaster)
 *   --model MODEL          enrich model (default: gpt-5.4)
 *   --collect-model MODEL  collect dedup/cancel model (default: gpt-4o-mini)
 */

import { cleanupExpiredEvents } from './cleanup-expired';
import { collectAllNames, DEFAULT_MAX_PER_SOURCE } from './collect-names';
import { enrichEvents } from './enrich-events';
import { upsertAiEvents } from './upsert-ai-events';

async function main() {
  const args = process.argv.slice(2);
  const skipCleanup = args.includes('--skip-cleanup');
  const skipCollect = args.includes('--skip-collect');
  const skipEnrich  = args.includes('--skip-enrich');
  const skipUpsert  = args.includes('--skip-upsert');
  const keepLocal   = args.includes('--keep-local');

  const limitIdx = args.indexOf('--limit');
  const limit = (limitIdx !== -1 && args[limitIdx + 1])
    ? parseInt(args[limitIdx + 1], 10) || DEFAULT_MAX_PER_SOURCE
    : DEFAULT_MAX_PER_SOURCE;

  const modelIdx = args.indexOf('--model');
  const model = modelIdx !== -1 && args[modelIdx + 1] ? args[modelIdx + 1] : 'gpt-5.4';

  const collectModelIdx = args.indexOf('--collect-model');
  const collectModel = collectModelIdx !== -1 && args[collectModelIdx + 1] ? args[collectModelIdx + 1] : 'gpt-4o-mini';

  const sourceIdx = args.indexOf('--source');
  const source = sourceIdx !== -1 && args[sourceIdx + 1] ? args[sourceIdx + 1] : undefined;

  const start = Date.now();
  console.log(`\n[run-all] ====== AI Data Collection starting at ${new Date().toISOString()} ======\n`);

  if (!skipCleanup) {
    console.log('[run-all] Step 1: Cleaning up expired events...');
    await cleanupExpiredEvents();
  } else {
    console.log('[run-all] Skipping cleanup (--skip-cleanup)');
  }

  if (!skipCollect) {
    console.log(`[run-all] Step 2: Collecting names (max ${limit} per source${source ? `, source: ${source}` : ''}, collect-model: ${collectModel})...`);
    await collectAllNames(limit, source, collectModel);
  } else {
    console.log('[run-all] Skipping collect (--skip-collect)');
  }

  if (!skipEnrich) {
    console.log(`[run-all] Step 3: Enriching with model: ${model}`);
    await enrichEvents(model);
  } else {
    console.log('[run-all] Skipping enrichment (--skip-enrich)');
  }

  if (!skipUpsert) {
    console.log('[run-all] Step 4: Upserting to Supabase...');
    await upsertAiEvents(keepLocal);
  } else {
    console.log('[run-all] Skipping upsert (--skip-upsert)');
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n[run-all] ====== Pipeline complete in ${elapsed}s ======\n`);
}

main().catch(console.error);

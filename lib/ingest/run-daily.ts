/**
 * run-daily.ts
 *
 * CLI runner for the daily curated ingest pipeline.
 * Replaces the old Vercel cron endpoints (ingest-sources-curated, ingest-geocode, ingest-postprocess).
 * Designed to run as a GitHub Actions step.
 *
 * Usage:
 *   npx tsx --env-file=.env lib/ingest/run-daily.ts
 */

import { ingestDice } from './dice';
import { ingestResidentAdvisor } from './resident-advisor';
import { ingestLuma } from './luma';
import { ingestFever } from './fever';
import { ingestMuseums } from './museums';
import { ingestEventbrite } from './eventbrite';
import { geocodeAllEvents } from './geocode';
import { reclassifyEvents } from './reclassify';
import { deduplicateEvents } from './dedup';
import { cleanupExpired } from './cleanup';

async function run(name: string, fn: () => Promise<void>) {
  const start = Date.now();
  try {
    await fn();
    console.log(`  ✓ ${name} (${((Date.now() - start) / 1000).toFixed(1)}s)`);
  } catch (e) {
    console.error(`  ✗ ${name} failed (${((Date.now() - start) / 1000).toFixed(1)}s):`, e);
  }
}

async function main() {
  const start = Date.now();
  console.log(`\n[daily-ingest] Starting at ${new Date().toISOString()}\n`);

  // Step 1: Curated source scraping
  console.log('[daily-ingest] Step 1: Scraping curated sources...');
  await run('Dice.fm',          ingestDice);
  await run('Resident Advisor', ingestResidentAdvisor);
  await run('Luma',             ingestLuma);
  await run('Fever',            ingestFever);
  await run('Museums',          ingestMuseums);
  await run('Eventbrite',       ingestEventbrite);

  // Step 2: Geocode new events
  console.log('\n[daily-ingest] Step 2: Geocoding...');
  await run('Geocode', geocodeAllEvents);

  // Step 3: Post-processing
  console.log('\n[daily-ingest] Step 3: Post-processing...');
  await run('Reclassify', reclassifyEvents);
  await run('Dedup',      deduplicateEvents);
  await run('Cleanup',    cleanupExpired);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n[daily-ingest] Done in ${elapsed}s\n`);
}

main().catch(console.error);

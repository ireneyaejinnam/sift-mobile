import { ingestTicketmaster } from './ticketmaster';
import { ingestLuma } from './luma';
import { ingestFever } from './fever';
import { ingestEventbrite } from './eventbrite';
import { ingestMuseums } from './museums';
import { ingestDice } from './dice';
import { ingestResidentAdvisor } from './resident-advisor';
import { geocodeAllEvents } from './geocode';
import { reclassifyEvents } from './reclassify';
import { deduplicateEvents } from './dedup';
import { cleanupExpired } from './cleanup';
import { fillMissingPhotos } from './google-places';
import { fetchMissingImages } from './fetchImages';

async function run(name: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    console.error(`[Ingest] ${name} failed:`, e);
  }
}

async function main() {
  const start = Date.now();
  console.log(`\n[Ingest] ====== Full pipeline starting at ${new Date().toISOString()} ======\n`);

  await run('Ticketmaster',     ingestTicketmaster);
  await run('Eventbrite',       ingestEventbrite);
  await run('Museums',          ingestMuseums);
  await run('Dice.fm',          ingestDice);
  await run('Resident Advisor', ingestResidentAdvisor);
  await run('Luma',             ingestLuma);
  await run('Fever',            ingestFever);

  // Post-processing
  for (const [name, fn] of [
    ['Geocode',    geocodeAllEvents],
    ['Reclassify', reclassifyEvents],
    ['Dedup',      deduplicateEvents],
    ['Cleanup',    cleanupExpired],
    ['Photos',     fillMissingPhotos],
    ['Images',     fetchMissingImages],
  ] as [string, () => Promise<void>][]) {
    try { await fn(); } catch (e) { console.error(`[Ingest] ${name} failed:`, e); }
  }

  const elapsed = ((Date.now() - start) / 1000 / 60).toFixed(1);
  console.log(`\n[Ingest] ====== Pipeline complete (7 sources) in ${elapsed}min ======\n`);
}

main().catch(console.error);

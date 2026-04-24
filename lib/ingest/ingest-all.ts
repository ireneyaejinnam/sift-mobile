import { ingestTicketmaster } from './ticketmaster';
import { ingestLuma } from './luma';
import { ingestFever } from './fever';
import { ingestEventbrite } from './eventbrite';
import { ingestNYCParks } from './nyc-parks';
import { ingestMuseums } from './museums';
import { ingestPopups } from './popups';
import { ingestNYCForFree } from './nycforfree';
import { ingestCozyCretaives } from './cozycreatives';
import { ingestNYCTourism } from './nyctourism';
import { ingestMeetup } from './meetup';
import { ingestYelp } from './yelp';
import { ingestDice } from './dice';
import { ingestResidentAdvisor } from './resident-advisor';
import { ingestNYCGov } from './nycgov';
import { ingestTheSkint } from './theskint';
import { geocodeAllEvents } from './geocode';
import { reclassifyEvents } from './reclassify';
import { deduplicateEvents } from './dedup';
import { cleanupExpired } from './cleanup';
import { fillMissingPhotos } from './google-places';
import { fetchMissingImages } from './fetchImages';
import { DISABLED_SOURCES } from './config';

async function run(name: string, source: string, fn: () => Promise<void>) {
  if (DISABLED_SOURCES.has(source)) {
    console.log(`[Ingest] Skipping ${name} (disabled)`);
    return;
  }
  try {
    await fn();
  } catch (e) {
    console.error(`[Ingest] ${name} failed:`, e);
  }
}

async function main() {
  const start = Date.now();
  console.log(`\n[Ingest] ====== Full pipeline starting at ${new Date().toISOString()} ======\n`);

  await run('Ticketmaster',     'ticketmaster',     ingestTicketmaster);
  await run('Eventbrite',       'eventbrite',       ingestEventbrite);
  await run('NYC Parks',        'nyc_parks',        ingestNYCParks);
  await run('Museums',          'museums',          ingestMuseums);
  await run('Popups',           'popups',           ingestPopups);
  await run('NYCForFree',       'nyc_for_free',     ingestNYCForFree);
  await run('CozyCratives',     'cozy_creatives',   ingestCozyCretaives);
  await run('NYCTourism',       'nyc_tourism',      ingestNYCTourism);
  await run('Meetup',           'meetup',           ingestMeetup);
  await run('Yelp',             'yelp',             ingestYelp);
  await run('Dice.fm',          'dice',             ingestDice);
  await run('Resident Advisor', 'resident_advisor', ingestResidentAdvisor);
  await run('NYC.gov',          'nyc_gov',          ingestNYCGov);
  await run('The Skint',        'the_skint',        ingestTheSkint);
  await run('Luma',             'luma',             ingestLuma);
  await run('Fever',            'fever',            ingestFever);

  // Post-processing (no source gate — always runs)
  for (const [name, fn] of [
    ['Geocode',    geocodeAllEvents],
    ['Reclassify', reclassifyEvents],
    ['Dedup',      deduplicateEvents],
    ['Cleanup',    cleanupExpired],
    ['Photos',     fillMissingPhotos],    // Google Places — venue-specific photos
    ['Images',     fetchMissingImages],   // Unsplash fallback — catches anything Google missed
  ] as [string, () => Promise<void>][]) {
    try { await fn(); } catch (e) { console.error(`[Ingest] ${name} failed:`, e); }
  }

  const elapsed = ((Date.now() - start) / 1000 / 60).toFixed(1);
  console.log(`\n[Ingest] ====== Pipeline complete (16 sources) in ${elapsed}min ======\n`);
}

main().catch(console.error);

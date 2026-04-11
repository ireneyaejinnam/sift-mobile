import { ingestTicketmaster } from './ticketmaster';
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
import { enrichEvents } from './enrich';
import { deduplicateEvents, mergeRecurringEvents } from './dedup';
import { fetchMissingImages } from './fetchImages';
import { cleanupExpired, cleanupNonNYC } from './cleanup';

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

  // Existing sources
  await run('Ticketmaster',       ingestTicketmaster);
  await run('Eventbrite',         ingestEventbrite);
  await run('NYC Parks',          ingestNYCParks);
  await run('Museums',            ingestMuseums);
  await run('Popups',             ingestPopups);
  await run('NYCForFree',         ingestNYCForFree);
  await run('CozyCratives',      ingestCozyCretaives);
  await run('NYCTourism',         ingestNYCTourism);

  // New sources
  await run('Meetup',             ingestMeetup);
  await run('Yelp',               ingestYelp);
  await run('Dice.fm',            ingestDice);
  await run('Resident Advisor',   ingestResidentAdvisor);
  await run('NYC.gov',            ingestNYCGov);
  await run('The Skint',          ingestTheSkint);

  // Post-processing
  await run('Geocode',            geocodeAllEvents);
  await run('Reclassify',         reclassifyEvents);
  await run('Dedup',              deduplicateEvents);    // remove cross-source duplicates first
  await run('Merge Recurring',    mergeRecurringEvents); // group recurring into sessions
  await run('Enrich (LLM)',       enrichEvents);         // verify from official pages last
  await run('Fetch Images',       fetchMissingImages);
  await run('Cleanup Expired',    cleanupExpired);
  await run('Cleanup Non-NYC',    cleanupNonNYC);

  const elapsed = ((Date.now() - start) / 1000 / 60).toFixed(1);
  console.log(`\n[Ingest] ====== Pipeline complete (14 sources) in ${elapsed}min ======\n`);
}

main().catch(console.error);

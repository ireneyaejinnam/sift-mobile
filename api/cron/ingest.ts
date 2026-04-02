import { ingestTicketmaster } from '../../lib/ingest/ticketmaster';
import { ingestEventbrite } from '../../lib/ingest/eventbrite';
import { ingestNYCParks } from '../../lib/ingest/nyc-parks';
import { ingestMuseums } from '../../lib/ingest/museums';
import { ingestPopups } from '../../lib/ingest/popups';
import { ingestNYCForFree } from '../../lib/ingest/nycforfree';
import { ingestCozyCretaives } from '../../lib/ingest/cozycreatives';
import { ingestNYCTourism } from '../../lib/ingest/nyctourism';
import { ingestMeetup } from '../../lib/ingest/meetup';
import { ingestYelp } from '../../lib/ingest/yelp';
import { ingestDice } from '../../lib/ingest/dice';
import { ingestResidentAdvisor } from '../../lib/ingest/resident-advisor';
import { ingestNYCGov } from '../../lib/ingest/nycgov';
import { ingestTheSkint } from '../../lib/ingest/theskint';
import { geocodeAllEvents } from '../../lib/ingest/geocode';
import { reclassifyEvents } from '../../lib/ingest/reclassify';
import { deduplicateEvents } from '../../lib/ingest/dedup';
import { cleanupExpired } from '../../lib/ingest/cleanup';

async function run(name: string, fn: () => Promise<void>) {
  try { await fn(); }
  catch (e) { console.error(`[Cron] ${name} failed:`, e); }
}

export default async function handler(req: Request): Promise<Response> {
  // Verify the request is from Vercel Cron
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const start = Date.now();
  console.log('[Cron] Ingest pipeline starting (14 sources)...');

  // Existing sources
  await run('Ticketmaster', ingestTicketmaster);
  await run('Eventbrite',   ingestEventbrite);
  await run('NYC Parks',    ingestNYCParks);
  await run('Museums',      ingestMuseums);
  await run('Popups',       ingestPopups);
  await run('NYCForFree',   ingestNYCForFree);
  await run('CozyCratives', ingestCozyCretaives);
  await run('NYCTourism',   ingestNYCTourism);

  // New sources
  await run('Meetup',            ingestMeetup);
  await run('Yelp',              ingestYelp);
  await run('Dice.fm',           ingestDice);
  await run('Resident Advisor',  ingestResidentAdvisor);
  await run('NYC.gov',           ingestNYCGov);
  await run('The Skint',         ingestTheSkint);

  // Post-processing
  await run('Geocode',      geocodeAllEvents);
  await run('Reclassify',   reclassifyEvents);
  await run('Dedup',        deduplicateEvents);
  await run('Cleanup',      cleanupExpired);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[Cron] Done in ${elapsed}s`);

  return new Response(JSON.stringify({ ok: true, elapsed }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

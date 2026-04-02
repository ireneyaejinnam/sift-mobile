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

async function run(name: string, fn: () => Promise<void>) {
  try { await fn(); }
  catch (e) { console.error(`[Cron] ${name} failed:`, e); }
}

export default async function handler(req: Request): Promise<Response> {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const start = Date.now();
  console.log('[Cron] Ingest sources batch 2 (12 sources)...');

  await run('NYC Parks',    ingestNYCParks);
  await run('Museums',      ingestMuseums);
  await run('Popups',       ingestPopups);
  await run('NYCForFree',   ingestNYCForFree);
  await run('CozyCratives', ingestCozyCretaives);
  await run('NYCTourism',   ingestNYCTourism);
  await run('Meetup',       ingestMeetup);
  await run('Yelp',         ingestYelp);
  await run('Dice.fm',      ingestDice);
  await run('Resident Advisor', ingestResidentAdvisor);
  await run('NYC.gov',      ingestNYCGov);
  await run('The Skint',    ingestTheSkint);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[Cron] Batch 2 done in ${elapsed}s`);

  return new Response(JSON.stringify({ ok: true, batch: 2, elapsed }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

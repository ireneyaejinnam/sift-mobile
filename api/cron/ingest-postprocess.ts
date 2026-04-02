import { geocodeAllEvents } from '../../lib/ingest/geocode';
import { reclassifyEvents } from '../../lib/ingest/reclassify';
import { deduplicateEvents } from '../../lib/ingest/dedup';
import { cleanupExpired } from '../../lib/ingest/cleanup';

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
  console.log('[Cron] Post-processing (geocode, reclassify, dedup, cleanup)...');

  await run('Geocode',    geocodeAllEvents);
  await run('Reclassify', reclassifyEvents);
  await run('Dedup',      deduplicateEvents);
  await run('Cleanup',    cleanupExpired);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[Cron] Post-processing done in ${elapsed}s`);

  return new Response(JSON.stringify({ ok: true, stage: 'postprocess', elapsed }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

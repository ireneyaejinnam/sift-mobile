import { ingestEventbrite } from '../../lib/ingest/eventbrite';

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
  console.log('[Cron] Ingest batch 2 (Eventbrite)...');

  await run('Eventbrite', ingestEventbrite);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[Cron] Batch 2 done in ${elapsed}s`);

  return new Response(JSON.stringify({ ok: true, batch: 2, elapsed }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

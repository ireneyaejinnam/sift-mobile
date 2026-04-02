import { ingestTicketmaster } from '../../lib/ingest/ticketmaster';

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
  console.log('[Cron] Ingest batch 1 (Ticketmaster)...');

  await run('Ticketmaster', ingestTicketmaster);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[Cron] Batch 1 done in ${elapsed}s`);

  return new Response(JSON.stringify({ ok: true, batch: 1, elapsed }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

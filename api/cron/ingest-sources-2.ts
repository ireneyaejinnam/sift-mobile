import { ingestEventbrite } from '../../lib/ingest/eventbrite';

async function run(name: string, fn: () => Promise<void>) {
  try { await fn(); }
  catch (e) { console.error(`[Cron] ${name} failed:`, e); }
}

export default async function handler(req: any, res: any) {
  const authHeader = req.headers['authorization'] as string | undefined;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const start = Date.now();
  console.log('[Cron] Ingest batch 2 (Eventbrite)...');

  await run('Eventbrite', ingestEventbrite);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[Cron] Batch 2 done in ${elapsed}s`);

  return res.status(200).json({ ok: true, batch: 2, elapsed });
}

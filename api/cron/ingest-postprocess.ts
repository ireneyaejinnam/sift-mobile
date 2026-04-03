import { reclassifyEvents } from '../../lib/ingest/reclassify';
import { deduplicateEvents } from '../../lib/ingest/dedup';
import { cleanupExpired } from '../../lib/ingest/cleanup';

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
  console.log('[Cron] Post-processing (reclassify, dedup, cleanup)...');

  await run('Reclassify', reclassifyEvents);
  await run('Dedup',      deduplicateEvents);
  await run('Cleanup',    cleanupExpired);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[Cron] Post-processing done in ${elapsed}s`);

  return res.status(200).json({ ok: true, stage: 'postprocess', elapsed });
}

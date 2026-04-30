/**
 * Cron: ingest-sources-curated
 * Schedule: daily at 07:00 UTC
 *
 * Runs ONLY curated, high-signal scrapers:
 *   - Dice.fm (concerts, club nights)
 *   - Resident Advisor (electronic music)
 *   - Luma (community events, run clubs)
 *   - Fever (immersive, candlelight, pop-ups)
 *   - Museums (Whitney, New Museum)
 *   - Eventbrite (curated org IDs only)
 */

import { ingestDice } from '../../lib/ingest/dice';
import { ingestResidentAdvisor } from '../../lib/ingest/resident-advisor';
import { ingestLuma } from '../../lib/ingest/luma';
import { ingestFever } from '../../lib/ingest/fever';
import { ingestMuseums } from '../../lib/ingest/museums';
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
  console.log('[Cron] Curated source ingest starting...');

  await run('Dice.fm',            ingestDice);
  await run('Resident Advisor',   ingestResidentAdvisor);
  await run('Luma',               ingestLuma);
  await run('Fever',              ingestFever);
  await run('Museums',            ingestMuseums);
  await run('Eventbrite',         ingestEventbrite);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[Cron] Curated ingest done in ${elapsed}s`);

  return res.status(200).json({ ok: true, stage: 'curated-ingest', elapsed });
}

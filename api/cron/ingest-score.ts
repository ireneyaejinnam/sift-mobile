/**
 * Cron: ingest-score
 * Schedule: removed from vercel.json — no longer runs automatically
 *
 * Steps:
 *   1. Apply event_overrides (suppress / relabel only)
 *   2. Update social_signal counts from event_social_links
 *   3. HEAD-check Eventbrite links and suppress dead ones
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export default async function handler(req: any, res: any) {
  const authHeader = req.headers['authorization'] as string | undefined;
  if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const start = Date.now();
  console.log('[Score] Starting...');

  await applyOverrides();
  await updateSocialSignals();
  await validateEventbriteLinks();

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[Score] Done in ${elapsed}s`);

  return res.status(200).json({ ok: true, elapsed });
}

// Apply editorial overrides: suppress and relabel only.
async function applyOverrides() {
  const { data: overrides } = await supabase
    .from('event_overrides')
    .select('event_id, override_type, override_data');

  if (!overrides?.length) return;

  for (const o of overrides) {
    if (o.override_type === 'suppress') {
      await supabase.from('events')
        .update({ is_suppressed: true })
        .eq('id', o.event_id);
    } else if (o.override_type === 'relabel' && o.override_data) {
      await supabase.from('events')
        .update(o.override_data)
        .eq('id', o.event_id);
    }
  }
}

// Update social_signal = number of linked social posts per event.
async function updateSocialSignals() {
  const { data } = await supabase
    .from('event_social_links')
    .select('event_id');

  if (!data?.length) return;

  const counts: Record<string, number> = {};
  for (const row of data) {
    counts[row.event_id] = (counts[row.event_id] ?? 0) + 1;
  }

  for (const [eventId, count] of Object.entries(counts)) {
    await supabase.from('events')
      .update({ social_signal: count })
      .eq('id', eventId);
  }
}

// HEAD-check Eventbrite links and suppress 404/410 events.
async function validateEventbriteLinks() {
  const today = new Date().toISOString().split('T')[0];
  const { data } = await supabase
    .from('events')
    .select('id, ticket_url')
    .eq('source', 'eventbrite')
    .eq('is_suppressed', false)
    .gte('start_date', today)
    .limit(50);

  for (const event of data ?? []) {
    if (!event.ticket_url) continue;
    try {
      const res = await fetch(event.ticket_url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(3000),
      });
      if (res.status === 404 || res.status === 410) {
        await supabase.from('events').update({ is_suppressed: true }).eq('id', event.id);
      }
    } catch {
      // Timeout — leave as-is
    }
  }
}


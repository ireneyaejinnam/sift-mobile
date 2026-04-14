/**
 * cleanup-expired.ts
 *
 * Deletes expired events from Supabase ai_events (and cascades to ai_event_sessions).
 * An event is expired when end_date < today, or start_date < today if end_date is null.
 *
 * Usage:
 *   npx tsx --env-file=.env lib/ai-collect-data/cleanup-expired.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function cleanupExpiredEvents(): Promise<void> {
  const today = new Date().toISOString().split('T')[0];

  // Collect source_urls of expired events before deleting
  const { data: expiredByEndDate } = await supabase
    .from('ai_events')
    .select('source_url')
    .not('end_date', 'is', null)
    .lt('end_date', today);

  const { data: expiredByStartDate } = await supabase
    .from('ai_events')
    .select('source_url')
    .is('end_date', null)
    .lt('start_date', today);

  const expiredUrls = [
    ...(expiredByEndDate ?? []),
    ...(expiredByStartDate ?? []),
  ]
    .map(e => e.source_url)
    .filter((url): url is string => !!url);

  // Delete expired events
  const { data: endDateDeleted, error: e1 } = await supabase
    .from('ai_events')
    .delete()
    .not('end_date', 'is', null)
    .lt('end_date', today)
    .select('id');

  if (e1) console.error('[cleanup] Error deleting by end_date:', e1.message);

  const { data: startDateDeleted, error: e2 } = await supabase
    .from('ai_events')
    .delete()
    .is('end_date', null)
    .lt('start_date', today)
    .select('id');

  if (e2) console.error('[cleanup] Error deleting by start_date:', e2.message);

  const total = (endDateDeleted?.length ?? 0) + (startDateDeleted?.length ?? 0);
  console.log(`[cleanup] Deleted ${total} expired events`);

  // Delete matching entries from ai_event_name_list
  if (expiredUrls.length > 0) {
    const { error: nameErr } = await supabase
      .from('ai_event_name_list')
      .delete()
      .in('source_url', expiredUrls);

    if (nameErr) console.error('[cleanup] Error deleting name list entries:', nameErr.message);
    else console.log(`[cleanup] Deleted ${expiredUrls.length} entries from ai_event_name_list`);
  }
}

if (require.main === module) cleanupExpiredEvents().catch(console.error);

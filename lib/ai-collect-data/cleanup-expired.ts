/**
 * cleanup-expired.ts
 *
 * Deletes expired events from the unified events table (both ai_discovery and scraper).
 * Cascades to event_sessions.
 * An event is expired when end_date < today, or start_date < today if end_date is null.
 *
 * Also cleans up ai_event_name_list entries for expired AI-discovered events.
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

  // Collect source_urls of expired AI-discovered events (for name list cleanup)
  const { data: expiredAiByEndDate } = await supabase
    .from('events')
    .select('source_url')
    .eq('source_type', 'ai_discovery')
    .not('end_date', 'is', null)
    .lt('end_date', today);

  const { data: expiredAiByStartDate } = await supabase
    .from('events')
    .select('source_url')
    .eq('source_type', 'ai_discovery')
    .is('end_date', null)
    .lt('start_date', today);

  const expiredUrls = [
    ...(expiredAiByEndDate ?? []),
    ...(expiredAiByStartDate ?? []),
  ]
    .map(e => e.source_url)
    .filter((url): url is string => !!url);

  // Delete ALL expired events (both ai_discovery and scraper)
  const { data: endDateDeleted, error: e1 } = await supabase
    .from('events')
    .delete()
    .not('end_date', 'is', null)
    .lt('end_date', today)
    .select('id');

  if (e1) console.error('[cleanup] Error deleting by end_date:', e1.message);

  const { data: startDateDeleted, error: e2 } = await supabase
    .from('events')
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

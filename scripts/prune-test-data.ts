/**
 * Delete expired events from test_events (and their sessions via CASCADE).
 * An event is expired if all its sessions are in the past,
 * or if it has no sessions and its end_date (or start_date) is in the past.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/prune-test-data.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

async function main() {
  const today = new Date().toISOString().split('T')[0];

  // Find event IDs where every session date is in the past
  const { data: expiredSessions } = await supabase
    .from('test_event_sessions')
    .select('event_id')
    .lt('date', today);

  const { data: anySessions } = await supabase
    .from('test_event_sessions')
    .select('event_id')
    .gte('date', today);

  const hasUpcoming = new Set((anySessions ?? []).map((s: any) => s.event_id));
  const fullyExpiredFromSessions = [...new Set(
    (expiredSessions ?? [])
      .map((s: any) => s.event_id)
      .filter((id: string) => !hasUpcoming.has(id))
  )];

  // Also find events with no sessions whose end_date/start_date is in the past
  const { data: allEvents } = await supabase
    .from('test_events')
    .select('id, start_date, end_date');

  const { data: allSessions } = await supabase
    .from('test_event_sessions')
    .select('event_id');

  const eventIdsWithSessions = new Set((allSessions ?? []).map((s: any) => s.event_id));

  const expiredNoSession = (allEvents ?? [])
    .filter((e: any) => !eventIdsWithSessions.has(e.id))
    .filter((e: any) => (e.end_date ?? e.start_date) < today)
    .map((e: any) => e.id);

  const toDelete = [...new Set([...fullyExpiredFromSessions, ...expiredNoSession])];

  if (toDelete.length === 0) {
    console.log('No expired events found.');
    return;
  }

  console.log(`Deleting ${toDelete.length} expired event(s)...`);

  const { error } = await supabase
    .from('test_events')
    .delete()
    .in('id', toDelete);

  if (error) {
    console.error('Error deleting events:', error.message);
    process.exit(1);
  }

  console.log(`Done. ${toDelete.length} event(s) deleted (sessions removed via CASCADE).`);
}

main().catch(console.error);

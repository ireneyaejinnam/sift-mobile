/**
 * Ingest health check (EPIC 4 / Q3).
 *
 * The ingest scrapers swallow their own errors (so one dead source doesn't kill
 * the run) and the jobs otherwise always exit 0 — meaning a silently-broken
 * pipeline never shows up as a failed workflow. This aggregate gate makes real
 * problems visible: it exits NONZERO when
 *   - the freshest event is older than STALE_HOURS, or
 *   - fewer than MIN_NEW_EVENTS were inserted in the last 24h.
 * A nonzero exit turns the workflow red → GitHub's native failure notification
 * (plus the `if: failure()` issue step in the workflow).
 *
 * Run as the final step of each ingest workflow: npx tsx lib/ingest/health-check.ts
 */
import { createClient } from '@supabase/supabase-js';

const STALE_HOURS = 48;
const MIN_NEW_EVENTS = 5;
const HOUR_MS = 3.6e6;

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.error('[health] Missing SUPABASE_URL / SUPABASE_SERVICE_KEY');
    process.exit(1);
  }
  const supabase = createClient(url, key);

  // Freshest event by created_at (the real timestamptz column).
  const { data: newest, error: e1 } = await supabase
    .from('events')
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (e1) {
    console.error('[health] newest-event query failed:', e1.message);
    process.exit(1);
  }
  const newestAt = newest?.created_at ? new Date(newest.created_at) : null;
  const ageHours = newestAt ? (Date.now() - newestAt.getTime()) / HOUR_MS : Infinity;

  // New events inserted in the last 24h.
  const since = new Date(Date.now() - 24 * HOUR_MS).toISOString();
  const { count, error: e2 } = await supabase
    .from('events')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', since);
  if (e2) {
    console.error('[health] new-event count failed:', e2.message);
    process.exit(1);
  }
  const newCount = count ?? 0;

  console.log(
    `[health] freshest event ${Number.isFinite(ageHours) ? ageHours.toFixed(1) + 'h' : 'none'} old; ` +
    `${newCount} new in last 24h`
  );

  const problems: string[] = [];
  if (ageHours > STALE_HOURS) {
    problems.push(`stale — freshest event is ${ageHours.toFixed(1)}h old (> ${STALE_HOURS}h)`);
  }
  if (newCount < MIN_NEW_EVENTS) {
    problems.push(`low yield — only ${newCount} new events in 24h (< ${MIN_NEW_EVENTS})`);
  }

  if (problems.length > 0) {
    console.error('[health] FAIL:\n  - ' + problems.join('\n  - '));
    process.exit(1);
  }
  console.log('[health] OK');
}

main().catch((e) => {
  console.error('[health] unexpected error:', e);
  process.exit(1);
});

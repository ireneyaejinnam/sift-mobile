/**
 * Coverage audit helper (EPIC 4 / Q4).
 *
 * Lists Sift's deck-eligible events for a date window, grouped by category and
 * source — the "what Sift has" side. The other side (hand-listing ~40–60 events
 * you'd expect for that NYC weekend, then computing coverage % and diagnosing
 * misses as never-scraped / filtered / wrongly-deduped) is manual; record the
 * result in RECOVERY_NOTES.md.
 *
 * Run: npx tsx scripts/coverage-audit.ts 2026-08-01 2026-08-03
 */
import { createClient } from '@supabase/supabase-js';

// Mirrors the deck's curation gate (getEvents.fetchAllUpcoming).
const EXCLUDED_SOURCES = ['nyc_tourism', 'nyc_gov', 'yelp', 'meetup', 'nyc_parks'];

async function main() {
  const [from, to] = process.argv.slice(2);
  if (!from || !to) {
    console.error('Usage: npx tsx scripts/coverage-audit.ts <from YYYY-MM-DD> <to YYYY-MM-DD>');
    process.exit(1);
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_KEY');
    process.exit(1);
  }
  const supabase = createClient(url, key);

  // Deck-eligible events overlapping [from, to]: start on/before `to`, and
  // (end on/after `from` OR start on/after `from`).
  const { data, error } = await supabase
    .from('events')
    .select('id, title, category, source, start_date, end_date, vibe_score')
    .neq('is_suppressed', true)
    .eq('publication_status', 'public')
    .not('source', 'in', `(${EXCLUDED_SOURCES.join(',')})`)
    .or('vibe_score.gte.5,vibe_score.is.null')
    .lte('start_date', to)
    .or(`end_date.gte.${from},start_date.gte.${from}`)
    .limit(2000);
  if (error) {
    console.error('[coverage] query error:', error.message);
    process.exit(1);
  }
  const events = data ?? [];

  const byCat = new Map<string, number>();
  const bySrc = new Map<string, number>();
  for (const e of events) {
    byCat.set(e.category, (byCat.get(e.category) ?? 0) + 1);
    bySrc.set(e.source, (bySrc.get(e.source) ?? 0) + 1);
  }

  const pad = (s: string, n: number) => s.padEnd(n);
  console.log(`\nDeck-eligible events for ${from}..${to}: ${events.length}\n`);
  console.log('By category:');
  [...byCat.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${pad(k, 14)} ${v}`));
  console.log('\nBy source:');
  [...bySrc.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${pad(k, 18)} ${v}`));
  console.log(
    '\nNext (manual): hand-list ~40–60 events you expect for this window (Time Out / Eventbrite /\n' +
    'venue calendars), compute coverage % = (Sift has) / (expected), and label each miss\n' +
    'never-scraped / filtered / wrongly-deduped. Record in RECOVERY_NOTES.md.'
  );
}

main().catch((e) => {
  console.error('[coverage] unexpected error:', e);
  process.exit(1);
});

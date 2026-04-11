import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

/**
 * Remove events whose address is clearly outside NYC.
 * Matches addresses with non-NY state codes (e.g. DC, CA, TX).
 */
export async function cleanupNonNYC(): Promise<void> {
  // Fetch events that have an address with a US state code that isn't NY
  const { data, error } = await supabase
    .from('events')
    .select('id, title, address, borough')
    .not('address', 'is', null)
    .limit(5000);

  if (error || !data) {
    console.error('[Cleanup] Non-NYC fetch error:', error?.message);
    return;
  }

  const NON_NYC_STATE = /,\s*([A-Z]{2})\s*\d{5}/;
  const NON_NYC_CITY = /\b(?:washington\s*,?\s*d\.?c\.?|los angeles|chicago|boston|miami|seattle|houston|dallas|philadelphia|atlanta|denver|phoenix|portland|san francisco|las vegas|austin|nashville|new orleans)\b/i;

  const toDelete: string[] = [];
  for (const ev of data) {
    const addr = ev.address as string;
    const stateMatch = addr.match(NON_NYC_STATE);
    if (stateMatch && stateMatch[1] !== 'NY') {
      toDelete.push(ev.id);
      continue;
    }
    if (NON_NYC_CITY.test(addr)) {
      toDelete.push(ev.id);
    }
  }

  if (toDelete.length === 0) {
    console.log('[Cleanup] No non-NYC events found.');
    return;
  }

  for (let i = 0; i < toDelete.length; i += 50) {
    await supabase.from('events').delete().in('id', toDelete.slice(i, i + 50));
  }
  console.log(`[Cleanup] Removed ${toDelete.length} non-NYC events`);
}

export async function cleanupExpired(): Promise<void> {
  // Delete events whose end_date (or start_date if no end_date) passed more than 24h ago
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { error: endErr, count: endCount } = await supabase
    .from('events')
    .delete({ count: 'exact' })
    .not('end_date', 'is', null)
    .lt('end_date', cutoff);

  const { error: startErr, count: startCount } = await supabase
    .from('events')
    .delete({ count: 'exact' })
    .is('end_date', null)
    .lt('start_date', cutoff);

  if (endErr) console.error('[Cleanup] end_date delete error:', endErr.message);
  if (startErr) console.error('[Cleanup] start_date delete error:', startErr.message);

  const total = (endCount ?? 0) + (startCount ?? 0);
  console.log(`[Cleanup] Removed ${total} expired events`);
}

async function main() {
  await cleanupExpired();
}


if (require.main === module) {
  main().catch(console.error);
}

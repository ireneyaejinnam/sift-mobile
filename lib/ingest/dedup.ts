import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// ── Cross-source duplicate removal ───────────────────────────

export async function deduplicateEvents(): Promise<void> {
  console.log('[Dedup] Scanning for cross-source duplicates...');

  const { data, error } = await supabase
    .from('events')
    .select('id, title, source, start_date, venue_name, description, image_url')
    .order('start_date', { ascending: true })
    .limit(5000);

  if (error) {
    console.error('[Dedup] Fetch error:', error.message);
    return;
  }

  const events = data ?? [];
  const toDelete = new Set<string>();

  // Group by date (YYYY-MM-DD) + normalized venue
  const groups = new Map<string, typeof events>();
  for (const ev of events) {
    if (toDelete.has(ev.id)) continue;
    const dateKey = (ev.start_date ?? '').slice(0, 10);
    const venueKey = (ev.venue_name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
    if (!dateKey || !venueKey) continue;
    const key = `${dateKey}::${venueKey}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(ev);
  }

  let dupCount = 0;
  for (const group of groups.values()) {
    if (group.length < 2) continue;

    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        if (a.source === b.source) continue;
        if (toDelete.has(a.id) || toDelete.has(b.id)) continue;

        const titleA = a.title.toLowerCase().replace(/[^a-z0-9 ]/g, '');
        const titleB = b.title.toLowerCase().replace(/[^a-z0-9 ]/g, '');
        if (!isSimilar(titleA, titleB)) continue;

        const scoreA = dataScore(a);
        const scoreB = dataScore(b);
        const dropId = scoreA >= scoreB ? b.id : a.id;
        toDelete.add(dropId);
        dupCount++;
      }
    }
  }

  if (toDelete.size > 0) {
    const ids = Array.from(toDelete);
    for (let i = 0; i < ids.length; i += 50) {
      const { error: delErr } = await supabase.from('events').delete().in('id', ids.slice(i, i + 50));
      if (delErr) console.error('[Dedup] Delete error:', delErr.message);
    }
    console.log(`[Dedup] Removed ${toDelete.size} cross-source duplicates (${dupCount} pairs)`);
  } else {
    console.log('[Dedup] No cross-source duplicates found.');
  }
}

// ── Recurring event merge ────────────────────────────────────
// Same title + venue appearing on multiple dates → merge into one
// event with available_dates[], keeping the richest record.

export async function mergeRecurringEvents(): Promise<void> {
  console.log('[Dedup] Scanning for recurring events to merge...');

  const { data, error } = await supabase
    .from('events')
    .select('id, title, source, source_id, start_date, venue_name, description, image_url, available_dates, category, borough, address')
    .gte('start_date', new Date().toISOString().split('T')[0])
    .order('start_date', { ascending: true })
    .limit(5000);

  if (error) {
    console.error('[Dedup] Fetch error:', error.message);
    return;
  }

  const events = data ?? [];

  // Group by source + normalized title + normalized venue
  type EventRecord = typeof events[number];
  const groups = new Map<string, EventRecord[]>();

  for (const ev of events) {
    const titleKey = ev.title.toLowerCase().replace(/[^a-z0-9 ]/g, '').slice(0, 40).trim();
    const venueKey = (ev.venue_name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
    // Only merge within the same source to avoid cross-source false positives
    const key = `${ev.source}::${titleKey}::${venueKey}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(ev);
  }

  let merged = 0;

  for (const group of groups.values()) {
    if (group.length < 2) continue;

    // Collect all dates from the group
    const allDates = new Set<string>();
    for (const ev of group) {
      const d = (ev.start_date ?? '').slice(0, 10);
      if (d) allDates.add(d);
      for (const d2 of (ev.available_dates ?? [])) {
        const trimmed = (d2 ?? '').slice(0, 10);
        if (trimmed) allDates.add(trimmed);
      }
    }

    // Keep the richest record
    const keeper = group.reduce((best, ev) => dataScore(ev) >= dataScore(best) ? ev : best, group[0]);
    const toDelete = group.filter((ev) => ev.id !== keeper.id).map((ev) => ev.id);

    const sortedDates = Array.from(allDates).sort();

    // Update keeper with merged dates
    await supabase
      .from('events')
      .update({ available_dates: sortedDates })
      .eq('id', keeper.id);

    // Delete the rest
    for (let i = 0; i < toDelete.length; i += 50) {
      const { error: delErr } = await supabase
        .from('events')
        .delete()
        .in('id', toDelete.slice(i, i + 50));
      if (delErr) console.error('[Dedup] Merge delete error:', delErr.message);
    }

    merged += toDelete.length;
  }

  if (merged > 0) {
    console.log(`[Dedup] Merged ${merged} recurring event duplicates`);
  } else {
    console.log('[Dedup] No recurring events to merge.');
  }
}

// ── Helpers ──────────────────────────────────────────────────

function dataScore(ev: { description?: string | null; image_url?: string | null }): number {
  return (ev.description ? ev.description.length : 0) + (ev.image_url ? 50 : 0);
}

function isSimilar(a: string, b: string): boolean {
  if (a === b) return true;
  const stopWords = new Set(['the', 'a', 'an', 'at', 'in', 'on', 'of', 'and', 'with']);
  const wordsA = new Set(a.split(' ').filter(w => w.length > 2 && !stopWords.has(w)));
  const wordsB = new Set(b.split(' ').filter(w => w.length > 2 && !stopWords.has(w)));
  if (wordsA.size === 0 || wordsB.size === 0) return false;
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return intersection / union > 0.6;
}

// ── Entry points ─────────────────────────────────────────────

async function main() {
  await deduplicateEvents();
  await mergeRecurringEvents();
}

if (require.main === module || (process.argv[1] && process.argv[1].endsWith('dedup.ts'))) {
  main().catch(console.error);
}

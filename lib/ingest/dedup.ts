import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function deduplicateEvents(): Promise<void> {
  console.log('[Dedup] Scanning for cross-source duplicates...');

  // Fetch all events grouped by date + venue for comparison
  // We do this in JS rather than SQL since pg_trgm may not be enabled
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

  // Within each group, flag duplicate titles across different sources
  let dupCount = 0;
  for (const group of groups.values()) {
    if (group.length < 2) continue;

    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        if (a.source === b.source) continue;
        if (toDelete.has(a.id) || toDelete.has(b.id)) continue;

        // Simple similarity: normalized title overlap
        const titleA = a.title.toLowerCase().replace(/[^a-z0-9 ]/g, '');
        const titleB = b.title.toLowerCase().replace(/[^a-z0-9 ]/g, '');
        if (!isSimilar(titleA, titleB)) continue;

        // Keep the one with more data; drop the other
        const scoreA = dataScore(a);
        const scoreB = dataScore(b);
        const dropId = scoreA >= scoreB ? b.id : a.id;
        toDelete.add(dropId);
        dupCount++;
      }
    }
  }

  if (toDelete.size === 0) {
    console.log('[Dedup] No duplicates found.');
    return;
  }

  // Delete in batches
  const ids = Array.from(toDelete);
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const { error: delErr } = await supabase.from('events').delete().in('id', batch);
    if (delErr) console.error('[Dedup] Delete error:', delErr.message);
  }

  console.log(`[Dedup] Removed ${toDelete.size} duplicates (${dupCount} pairs found)`);
}

/** Score an event by how much data it has — prefer the richer record. */
function dataScore(ev: { description?: string; image_url?: string }): number {
  return (ev.description ? ev.description.length : 0) + (ev.image_url ? 50 : 0);
}

/** Check if two title strings are similar enough to be the same event. */
function isSimilar(a: string, b: string): boolean {
  if (a === b) return true;
  // Check if one contains the other (after stripping common words)
  const stopWords = new Set(['the', 'a', 'an', 'at', 'in', 'on', 'of', 'and', 'with']);
  const wordsA = new Set(a.split(' ').filter(w => w.length > 2 && !stopWords.has(w)));
  const wordsB = new Set(b.split(' ').filter(w => w.length > 2 && !stopWords.has(w)));
  if (wordsA.size === 0 || wordsB.size === 0) return false;
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return intersection / union > 0.6; // >60% word overlap = likely duplicate
}

async function main() {
  await deduplicateEvents();
}


if (require.main === module) {
  main().catch(console.error);
}

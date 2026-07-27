/**
 * Pure title-similarity used by cross-source dedup (word-set Jaccard).
 *
 * Extracted from dedup.ts so it can be imported under node/vitest/tsx without
 * dedup.ts's module-level Supabase client (which throws at import when env is
 * unset). dedup.ts re-uses `isSimilar` from here; the eval harness uses the
 * raw `jaccardSimilarity` for a threshold sweep.
 */

const STOP_WORDS = new Set(['the', 'a', 'an', 'at', 'in', 'on', 'of', 'and', 'with']);

/** Normalize a raw title the way the dedup caller does before comparison. */
export function normalizeTitle(title: string): string {
  return (title ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, '');
}

/**
 * Word-set Jaccard over filtered tokens (drop stopwords + words ≤ 2 chars).
 * Assumes inputs are already normalized. Returns 0..1 (1 for exact match).
 */
export function jaccardSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const wordsA = new Set(a.split(' ').filter((w) => w.length > 2 && !STOP_WORDS.has(w)));
  const wordsB = new Set(b.split(' ').filter((w) => w.length > 2 && !STOP_WORDS.has(w)));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  const intersection = [...wordsA].filter((w) => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return intersection / union;
}

/** True if two ALREADY-NORMALIZED titles exceed the similarity threshold. */
export function isSimilar(a: string, b: string, threshold = 0.6): boolean {
  if (a === b) return true;
  return jaccardSimilarity(a, b) > threshold;
}

/** Convenience: normalize raw titles then compare (eval / external callers). */
export function titlesSimilar(a: string, b: string, threshold = 0.6): boolean {
  return isSimilar(normalizeTitle(a), normalizeTitle(b), threshold);
}

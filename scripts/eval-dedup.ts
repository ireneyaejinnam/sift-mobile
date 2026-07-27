/**
 * Dedup similarity eval (EPIC 4 / Q5).
 *
 * Precision/recall of the cross-source title-Jaccard dedup at the production
 * threshold (0.6), plus a small sweep so we can see whether 0.6 is well-placed.
 * Labels are self-authored — a regression signal, not ground truth. (D1 already
 * suggested dedup is unlikely to be the deck-dry cause; this quantifies it.)
 *
 * Run: npm run eval:dedup
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { normalizeTitle, jaccardSimilarity } from '../lib/ingest/similarity';

interface Pair { a: string; b: string; same: boolean; note?: string }

function metricsAt(pairs: Pair[], threshold: number) {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (const p of pairs) {
    const na = normalizeTitle(p.a);
    const nb = normalizeTitle(p.b);
    const predSame = na === nb || jaccardSimilarity(na, nb) > threshold;
    if (p.same && predSame) tp++;
    else if (!p.same && predSame) fp++;
    else if (p.same && !predSame) fn++;
    else tn++;
  }
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1, tp, fp, fn, tn };
}

function main() {
  const data: { pairs: Pair[] } = JSON.parse(
    readFileSync(resolve(__dirname, '../data/eval/dedup-pairs.json'), 'utf8')
  );
  const pairs = data.pairs;
  const pos = pairs.filter((p) => p.same).length;
  console.log(`\nDedup eval — ${pairs.length} pairs (${pos} same / ${pairs.length - pos} different)\n`);
  console.log('threshold  precision  recall   F1');
  console.log('-'.repeat(42));
  for (const t of [0.4, 0.5, 0.6, 0.7, 0.8]) {
    const m = metricsAt(pairs, t);
    console.log(
      `  ${t.toFixed(2)}       ${m.precision.toFixed(3)}     ${m.recall.toFixed(3)}   ${m.f1.toFixed(3)}` +
      (t === 0.6 ? '   ← prod' : '')
    );
  }
  const at = metricsAt(pairs, 0.6);
  console.log(
    `\nAt prod 0.6: P=${at.precision.toFixed(3)} R=${at.recall.toFixed(3)} F1=${at.f1.toFixed(3)} ` +
    `(tp=${at.tp} fp=${at.fp} fn=${at.fn} tn=${at.tn})`
  );
  // Show the misses so labeling gaps are legible.
  const misses = pairs.filter((p) => {
    const na = normalizeTitle(p.a), nb = normalizeTitle(p.b);
    const predSame = na === nb || jaccardSimilarity(na, nb) > 0.6;
    return predSame !== p.same;
  });
  if (misses.length) {
    console.log(`\nMisclassified at 0.6 (${misses.length}):`);
    for (const m of misses) console.log(`  [${m.same ? 'FN' : 'FP'}] "${m.a}" vs "${m.b}"${m.note ? ` — ${m.note}` : ''}`);
  }
}

main();

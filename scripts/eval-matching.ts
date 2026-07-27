/**
 * Social-matcher eval (EPIC 4 / Q6).
 *
 * Precision/recall of computeSimilarity at the accept threshold (> 0.5). The
 * matcher weights title 50% + date 30% + venue 20% and runs against a broad
 * ±7-day candidate query with no venue pre-filter — unlike cross-source dedup,
 * which pre-buckets by exact date+venue and so can rely on title alone. Labels
 * are self-authored. Run: npm run eval:matching
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { computeSimilarity } from '../lib/social/match';

interface Pair {
  extracted: { title: string; startDate?: string; venue?: string };
  candidate: { title: string; start_date: string; venue_name?: string | null };
  same: boolean;
  note?: string;
}

function metricsAt(pairs: Pair[], threshold: number) {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (const p of pairs) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const score = computeSimilarity(p.extracted as any, p.candidate);
    const pred = score > threshold;
    if (p.same && pred) tp++;
    else if (!p.same && pred) fp++;
    else if (p.same && !pred) fn++;
    else tn++;
  }
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1, tp, fp, fn, tn };
}

function main() {
  const data: { pairs: Pair[] } = JSON.parse(
    readFileSync(resolve(__dirname, '../data/eval/match-pairs.json'), 'utf8')
  );
  const pairs = data.pairs;
  const pos = pairs.filter((p) => p.same).length;
  console.log(`\nSocial-matcher eval — ${pairs.length} pairs (${pos} same / ${pairs.length - pos} different)\n`);
  console.log('threshold  precision  recall   F1');
  console.log('-'.repeat(42));
  for (const t of [0.3, 0.4, 0.5, 0.6, 0.7]) {
    const m = metricsAt(pairs, t);
    console.log(
      `  ${t.toFixed(2)}       ${m.precision.toFixed(3)}     ${m.recall.toFixed(3)}   ${m.f1.toFixed(3)}` +
      (t === 0.5 ? '   ← prod' : '')
    );
  }
  const at = metricsAt(pairs, 0.5);
  console.log(
    `\nAt prod 0.5: P=${at.precision.toFixed(3)} R=${at.recall.toFixed(3)} F1=${at.f1.toFixed(3)} ` +
    `(tp=${at.tp} fp=${at.fp} fn=${at.fn} tn=${at.tn})`
  );
}

main();

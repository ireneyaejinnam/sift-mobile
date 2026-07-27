/**
 * Offline recommender eval harness (R2).
 *
 * Loads hand-labeled (taste, candidates, relevantIds) triples from
 * data/eval/relevance.json, ranks each candidate set with the production
 * scorer (computeEventScore), and reports P@5 + nDCG@5 per scenario and overall.
 *
 * Run: npm run eval   (tsx scripts/eval-recommender.ts)
 *
 * Limitation: relevance labels are self-authored, not from user data — treat
 * the numbers as a regression signal for scoring changes, not ground truth.
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { computeEventScore, type TasteContext } from "../src/lib/eventScore";
import type { SiftEvent } from "../src/types/event";

const K = 5;

interface TripleTaste {
  categoryWeights?: Record<string, number>;
  tagWeights?: Record<string, number>;
  boroughWeights?: Record<string, number>;
  pricePreference?: { ceiling: number | null; freeBoost: number };
  interactionCount?: number;
}
interface Triple {
  id: string;
  scenario: string;
  taste: TripleTaste;
  dateRangeActive?: boolean;
  candidateIds?: string[];
  relevantIds: string[];
}
interface Dataset { events: SiftEvent[]; triples: Triple[]; }

function rankCandidates(events: SiftEvent[], t: Triple): string[] {
  const categoryWeights = t.taste.categoryWeights ?? {};
  const scored = events.map((event) => {
    const cw = categoryWeights[event.category] ?? 1.0;
    const ctx: TasteContext = {
      categoryWeight: cw,
      tagWeights: t.taste.tagWeights ?? {},
      boroughWeights: t.taste.boroughWeights ?? {},
      pricePreference: t.taste.pricePreference ?? { ceiling: null, freeBoost: 0 },
      interactionCount: t.taste.interactionCount ?? 0,
    };
    // clone so the scorer's __scoreExplanation side effect doesn't leak across triples
    const score = computeEventScore({ ...event }, cw, 1.0, ctx, t.dateRangeActive ?? false);
    return { id: event.id, score };
  });
  // deterministic: score desc, tie-break by id asc
  scored.sort((a, b) => (b.score - a.score) || a.id.localeCompare(b.id));
  return scored.map((s) => s.id);
}

function precisionAtK(ranked: string[], relevant: Set<string>): number {
  const top = ranked.slice(0, K);
  const hits = top.filter((id) => relevant.has(id)).length;
  return hits / Math.min(K, relevant.size || K);
}

function ndcgAtK(ranked: string[], relevant: Set<string>): number {
  const dcg = ranked.slice(0, K).reduce((acc, id, i) => acc + (relevant.has(id) ? 1 / Math.log2(i + 2) : 0), 0);
  const ideal = Math.min(K, relevant.size);
  let idcg = 0;
  for (let i = 0; i < ideal; i++) idcg += 1 / Math.log2(i + 2);
  return idcg === 0 ? 0 : dcg / idcg;
}

function mean(xs: number[]): number { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; }

function main() {
  const path = resolve(__dirname, "../data/eval/relevance.json");
  const data: Dataset = JSON.parse(readFileSync(path, "utf8"));
  const eventsById = new Map(data.events.map((e) => [e.id, e]));

  const perScenario: Record<string, { p: number[]; n: number[] }> = {};
  const allP: number[] = [];
  const allN: number[] = [];

  for (const t of data.triples) {
    const candidates = t.candidateIds
      ? (t.candidateIds.map((id) => eventsById.get(id)).filter(Boolean) as SiftEvent[])
      : data.events;
    const ranked = rankCandidates(candidates, t);
    const relevant = new Set(t.relevantIds);
    const p = precisionAtK(ranked, relevant);
    const n = ndcgAtK(ranked, relevant);
    (perScenario[t.scenario] ??= { p: [], n: [] }).p.push(p);
    perScenario[t.scenario].n.push(n);
    allP.push(p);
    allN.push(n);
  }

  const pad = (s: string, w: number) => s.padEnd(w);
  console.log(`\nRecommender eval — ${data.triples.length} triples, K=${K}\n`);
  console.log(`${pad("scenario", 28)} ${pad("n", 4)} ${pad("P@5", 8)} nDCG@5`);
  console.log("-".repeat(56));
  for (const [scenario, m] of Object.entries(perScenario)) {
    console.log(
      `${pad(scenario, 28)} ${pad(String(m.p.length), 4)} ${pad(mean(m.p).toFixed(3), 8)} ${mean(m.n).toFixed(3)}`
    );
  }
  console.log("-".repeat(56));
  console.log(
    `${pad("OVERALL", 28)} ${pad(String(allP.length), 4)} ${pad(mean(allP).toFixed(3), 8)} ${mean(allN).toFixed(3)}\n`
  );
}

main();

import type { SiftEvent } from "@/types/event";

/**
 * Pure event-scoring logic, isolated from `getEvents.ts` so it can be imported
 * under plain Node (vitest / eval harness) without pulling the supabase /
 * AsyncStorage / expo-crypto import chain. Production ranking imports
 * `computeEventScore` via `@/lib/getEvents` (which re-exports from here).
 */

/** Taste context for multi-dimensional scoring */
export interface TasteContext {
  categoryWeight: number;
  tagWeights: Record<string, number>;
  boroughWeights: Record<string, number>;
  pricePreference: { ceiling: number | null; freeBoost: number };
  interactionCount: number;
}

export const DEFAULT_TASTE: TasteContext = {
  categoryWeight: 1.0,
  tagWeights: {},
  boroughWeights: {},
  pricePreference: { ceiling: null, freeBoost: 0 },
  interactionCount: 0,
};

/**
 * Compute event score for feed ranking.
 *
 * Personalized: quality × 0.20 + taste × 0.50 + timing × 0.15 + completeness × 0.10 + novelty × 0.05
 * Cold-start:   quality × 0.40 + timing × 0.30 + completeness × 0.20 + novelty × 0.10 (no taste term)
 * Taste: category 35% + tags 35% + borough 15% + price 15% (freeBoost folded into price)
 *
 * finalScore = confidence × personalized + (1 − confidence) × coldStart,
 * where confidence ramps 0→1 over ~20 interactions.
 */
export function computeEventScore(
  event: SiftEvent,
  categoryWeight = 1.0,
  impressionPenalty = 1.0,
  taste: TasteContext = DEFAULT_TASTE,
  dateRangeActive = false
): number {
  // Quality: vibe 1–10 → 0–1, unchecked = 0.5 neutral
  const quality = event.vibeScore != null ? (event.vibeScore - 1) / 9 : 0.5;

  // ── Taste score (multi-dimensional) ──
  const categoryAffinity = Math.min(Math.max((categoryWeight - 0.3) / 1.7, 0), 1.0);

  // Tag affinity: average weight of matching tags (neutral = 0.5)
  let tagAffinity = 0.5;
  if (event.tags && event.tags.length > 0 && Object.keys(taste.tagWeights).length > 0) {
    const tagScores = event.tags
      .map((t) => taste.tagWeights[t])
      .filter((w): w is number => w != null);
    if (tagScores.length > 0) {
      tagAffinity = Math.min(
        (tagScores.reduce((a, b) => a + b, 0) / tagScores.length) / 2.5,
        1.0
      );
    }
  }

  // Borough affinity
  let boroughAffinity = 0.5;
  if (event.borough && Object.keys(taste.boroughWeights).length > 0) {
    const bw = taste.boroughWeights[event.borough];
    if (bw != null) boroughAffinity = Math.min(bw / 2.0, 1.0);
  }

  // Price affinity
  let priceAffinity = 0.5;
  if (event.price === 0 && taste.pricePreference.freeBoost > 0) {
    priceAffinity = Math.min(0.5 + taste.pricePreference.freeBoost * 0.25, 1.0);
  } else if (taste.pricePreference.ceiling != null && event.price != null) {
    priceAffinity = event.price <= taste.pricePreference.ceiling ? 0.7 : 0.3;
  }

  const tasteScore =
    categoryAffinity * 0.35 +
    tagAffinity * 0.35 +
    boroughAffinity * 0.15 +
    priceAffinity * 0.15;

  // Timing: flat when user selected a date range (all events equally valid),
  // otherwise smoother decay curve
  let timing: number;
  if (dateRangeActive) {
    timing = 1.0; // user told us their dates — don't penalize later events in range
  } else {
    const daysUntil = event.daysLeft ?? 30;
    timing =
      daysUntil <= 0  ? 0
      : daysUntil <= 3  ? 1.0
      : daysUntil <= 7  ? 0.85
      : daysUntil <= 14 ? 0.7
      : daysUntil <= 30 ? 0.45
      : 0.25;
  }

  // Completeness: rewards rich event data
  const completeness =
    (event.imageUrl ? 0.4 : 0) +
    (event.description && event.description.length > 20 ? 0.3 : 0) +
    (event.location ? 0.2 : 0) +
    (event.priceLabel && event.priceLabel !== "See tickets" ? 0.1 : 0);

  const novelty = impressionPenalty;

  // Social proof: linked TikTok/IG post count → 0..1 (saturates at 5 posts).
  // Added as a small additive bonus (not part of the core weight budget) so it
  // nudges trending events up without disturbing the R4-tuned weights.
  const social = Math.min((event.socialSignal ?? 0) / 5, 1);
  const SOCIAL_WEIGHT = 0.05;

  const personalizedScore =
    quality * 0.20 + tasteScore * 0.50 + timing * 0.15 + completeness * 0.10 + novelty * 0.05 +
    social * SOCIAL_WEIGHT;

  // Cold start blending: confidence ramps 0→1 over ~20 interactions.
  // (R4) The old code floored confidence to 0.5 whenever categoryWeight ≠ 1.0.
  // That double-counted the quiz signal — categoryAffinity already carries it
  // into tasteScore — so the floor is removed; confidence is the pure ramp.
  const confidence = Math.min(1, taste.interactionCount / 20);
  const coldStartScore =
    quality * 0.40 + timing * 0.30 + completeness * 0.20 + novelty * 0.10 +
    social * SOCIAL_WEIGHT;

  const finalScore = confidence * personalizedScore + (1 - confidence) * coldStartScore;

  // Attach explanation for debugging / future user-facing labels.
  // `components` uses each term's confidence-blended EFFECTIVE weight so the
  // values sum to finalScore (personalized + cold-start weights, blended by
  // confidence — cold-start drops the taste term to 0).
  const inv = 1 - confidence;
  (event as any).__scoreExplanation = {
    finalScore: +finalScore.toFixed(3),
    confidence: +confidence.toFixed(2),
    components: {
      quality: +(quality * (confidence * 0.20 + inv * 0.40)).toFixed(3),
      taste: +(tasteScore * (confidence * 0.50)).toFixed(3),
      timing: +(timing * (confidence * 0.15 + inv * 0.30)).toFixed(3),
      completeness: +(completeness * (confidence * 0.10 + inv * 0.20)).toFixed(3),
      novelty: +(novelty * (confidence * 0.05 + inv * 0.10)).toFixed(3),
      social: +(social * SOCIAL_WEIGHT).toFixed(3),
    },
    tasteBreakdown: {
      category: +(categoryAffinity * 0.35).toFixed(3),
      tags: +(tagAffinity * 0.35).toFixed(3),
      borough: +(boroughAffinity * 0.15).toFixed(3),
      price: +(priceAffinity * 0.15).toFixed(3),
    },
  };

  return finalScore;
}

import type { EventCategory } from "@/types/event";
import type { TasteProfile } from "./tasteProfile";

/**
 * Human-readable persona derived from taste weights. Pure and dependency-free
 * (type-only imports) so it's safe to call from render and easy to unit-test.
 */
export interface TasteInsight {
  /** Enough signal to state a persona with any confidence. */
  confident: boolean;
  topCategories: EventCategory[]; // liked categories, strongest first
  topTags: string[]; // liked tags, strongest first
  topBorough: string | null; // most-favored borough (if any)
  lovesFree: boolean; // strong free-event lean
  interactionCount: number;
}

const INSIGHT_CONFIDENCE_MIN = 5; // meaningful interactions before we claim a persona
const LIKE_THRESHOLD = 1.05; // weight above neutral (1.0) that counts as "into it"

function rank<T extends string>(weights: Partial<Record<T, number>>, limit: number): T[] {
  return (Object.entries(weights) as [T, number][])
    .filter(([, w]) => (w ?? 0) > LIKE_THRESHOLD)
    .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
    .slice(0, limit)
    .map(([k]) => k);
}

/**
 * Below the confidence threshold, `confident` is false and callers should show a
 * "keep swiping" placeholder rather than over-claiming a persona.
 */
export function getTasteInsight(profile: TasteProfile): TasteInsight {
  const topCategories = rank(profile.categoryWeights, 3);
  const topTags = rank(profile.tagWeights, 4);
  const topBorough = rank(profile.boroughWeights, 1)[0] ?? null;
  const lovesFree = profile.pricePreference.freeBoost >= 1.3;

  return {
    confident: profile.interactionCount >= INSIGHT_CONFIDENCE_MIN && topCategories.length > 0,
    topCategories,
    topTags,
    topBorough,
    lovesFree,
    interactionCount: profile.interactionCount,
  };
}

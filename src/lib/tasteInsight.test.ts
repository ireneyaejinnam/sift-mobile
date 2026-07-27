import { describe, it, expect } from "vitest";
import { getTasteInsight } from "./tasteInsight";
import type { TasteProfile } from "./tasteProfile";

function makeProfile(overrides: Partial<TasteProfile> = {}): TasteProfile {
  return {
    categoryWeights: {},
    tagWeights: {},
    boroughWeights: {},
    pricePreference: { ceiling: null, freeBoost: 1.0 },
    likedIds: [],
    dislikedIds: [],
    interactionCount: 0,
    ...overrides,
  };
}

describe("getTasteInsight", () => {
  it("is not confident below the interaction threshold", () => {
    const insight = getTasteInsight(
      makeProfile({ categoryWeights: { music: 1.8 }, interactionCount: 3 })
    );
    expect(insight.confident).toBe(false);
  });

  it("is not confident when no category clears the like threshold", () => {
    const insight = getTasteInsight(
      makeProfile({ categoryWeights: { music: 1.0, comedy: 0.8 }, interactionCount: 20 })
    );
    expect(insight.confident).toBe(false);
    expect(insight.topCategories).toEqual([]);
  });

  it("ranks top categories/tags/borough by weight, strongest first", () => {
    const insight = getTasteInsight(
      makeProfile({
        categoryWeights: { music: 1.9, comedy: 1.4, food: 1.1, fitness: 0.9 },
        tagWeights: { jazz: 2.0, standup: 1.5, brunch: 1.06, boring: 1.0 },
        boroughWeights: { Brooklyn: 1.7, Manhattan: 1.2, Queens: 1.0 },
        pricePreference: { ceiling: null, freeBoost: 1.4 },
        interactionCount: 12,
      })
    );
    expect(insight.confident).toBe(true);
    expect(insight.topCategories).toEqual(["music", "comedy", "food"]); // capped at 3, >1.05
    expect(insight.topTags).toEqual(["jazz", "standup", "brunch"]); // "boring" (1.0) excluded
    expect(insight.topBorough).toBe("Brooklyn");
    expect(insight.lovesFree).toBe(true);
  });

  it("reports lovesFree false when freeBoost is modest", () => {
    const insight = getTasteInsight(
      makeProfile({
        categoryWeights: { arts: 1.6 },
        pricePreference: { ceiling: null, freeBoost: 1.1 },
        interactionCount: 10,
      })
    );
    expect(insight.lovesFree).toBe(false);
    expect(insight.topBorough).toBeNull();
  });
});

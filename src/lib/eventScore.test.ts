import { describe, it, expect } from "vitest";
import { computeEventScore, type TasteContext } from "@/lib/eventScore";
import type { SiftEvent } from "@/types/event";

/** Minimal event fixture; overrides let each test isolate one dimension.
 *  Defaults are deliberately "empty": no image, empty description, no location,
 *  priceLabel "Free" → completeness = 0.1; vibeScore undefined → quality 0.5. */
function makeEvent(overrides: Partial<SiftEvent> = {}): SiftEvent {
  return {
    id: "e1", title: "t", category: "music", description: "", location: "",
    address: "", borough: "Manhattan", startDate: "2026-08-01", time: "7:00 PM",
    price: 0, priceLabel: "Free", link: "", tags: [], ...overrides,
  };
}

function taste(overrides: Partial<TasteContext> = {}): TasteContext {
  return {
    categoryWeight: 1.0, tagWeights: {}, boroughWeights: {},
    pricePreference: { ceiling: null, freeBoost: 0 }, interactionCount: 0, ...overrides,
  };
}

/** Read the confidence the scorer used (attached to the event as a side effect). */
function confidenceOf(event: SiftEvent): number {
  return (event as any).__scoreExplanation.confidence;
}

describe("computeEventScore — cold-start confidence (R4: no floor)", () => {
  it("interactionCount=0 → confidence 0 (pure cold-start)", () => {
    const e = makeEvent();
    computeEventScore(e, 1.0, 1.0, taste({ interactionCount: 0 }));
    expect(confidenceOf(e)).toBe(0);
  });

  it("confidence depends only on interactionCount, NOT on categoryWeight (floor removed)", () => {
    const withWeight = makeEvent();
    computeEventScore(withWeight, 2.0, 1.0, taste({ interactionCount: 0 }));
    const withoutWeight = makeEvent();
    computeEventScore(withoutWeight, 1.0, 1.0, taste({ interactionCount: 0 }));
    // Both 0 — a non-default categoryWeight no longer floors confidence to 0.5.
    expect(confidenceOf(withWeight)).toBe(0);
    expect(confidenceOf(withoutWeight)).toBe(0);
  });

  it("confidence is the interaction ramp regardless of categoryWeight (9 → 0.45)", () => {
    const a = makeEvent();
    computeEventScore(a, 2.0, 1.0, taste({ interactionCount: 9 }));
    const b = makeEvent();
    computeEventScore(b, 1.0, 1.0, taste({ interactionCount: 9 }));
    expect(confidenceOf(a)).toBe(0.45);
    expect(confidenceOf(b)).toBe(0.45);
  });

  it("interactionCount=20 → confidence saturates at 1.0", () => {
    const e = makeEvent();
    computeEventScore(e, 1.0, 1.0, taste({ interactionCount: 20 }));
    expect(confidenceOf(e)).toBe(1);
  });
});

describe("computeEventScore — taste sub-scores", () => {
  it("empty tagWeights → neutral tag affinity (0.5 → tasteBreakdown.tags 0.175)", () => {
    const e = makeEvent({ tags: ["jazz", "dj"] });
    computeEventScore(e, 1.0, 1.0, taste({ tagWeights: {} }));
    expect((e as any).__scoreExplanation.tasteBreakdown.tags).toBeCloseTo(0.5 * 0.35, 3);
  });

  it("vibeScore null and vibeScore 5.5 both yield quality 0.5 (identical score)", () => {
    const nullVibe = computeEventScore(makeEvent({ vibeScore: undefined }));
    const midVibe = computeEventScore(makeEvent({ vibeScore: 5.5 }));
    expect(nullVibe).toBeCloseTo(midVibe, 6);
  });
});

describe("computeEventScore — social proof (A-ord 4)", () => {
  it("a trending event scores higher than an identical non-trending one", () => {
    const trending = computeEventScore(makeEvent({ socialSignal: 8 }));
    const plain = computeEventScore(makeEvent({ socialSignal: 0 }));
    expect(trending).toBeGreaterThan(plain);
  });

  it("boost saturates at 5 posts and is worth exactly 0.05 at full strength", () => {
    const s0 = computeEventScore(makeEvent({ socialSignal: 0 }));
    const s5 = computeEventScore(makeEvent({ socialSignal: 5 }));
    const s50 = computeEventScore(makeEvent({ socialSignal: 50 }));
    expect(s5 - s0).toBeCloseTo(0.05, 6);
    expect(s50).toBeCloseTo(s5, 6);
  });
});

describe("computeEventScore — timing", () => {
  // At confidence 0 (cold-start): finalScore = 0.5*0.40 + timing*0.30 + 0.1*0.20 + 1.0*0.10
  //                                          = 0.32 + 0.30*timing
  const expected = (timing: number) => 0.32 + 0.3 * timing;

  it.each([
    [0, 0.0],
    [3, 1.0],
    [7, 0.85],
    [14, 0.7],
    [30, 0.45],
  ])("daysLeft=%i → timing weight %f", (daysLeft, timing) => {
    const score = computeEventScore(makeEvent({ daysLeft }), 1.0, 1.0, taste({ interactionCount: 0 }));
    expect(score).toBeCloseTo(expected(timing), 3);
  });

  it("dateRangeActive=true → timing flat 1.0 regardless of daysLeft", () => {
    const score = computeEventScore(
      makeEvent({ daysLeft: 30 }), 1.0, 1.0, taste({ interactionCount: 0 }), true
    );
    expect(score).toBeCloseTo(expected(1.0), 3);
  });
});

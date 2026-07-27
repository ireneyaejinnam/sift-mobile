import { describe, it, expect } from "vitest";
import { emptyNav, canGoBack, advance, goBack, type DeckNav } from "./deckHistory";

describe("deckHistory", () => {
  it("cannot go back from an empty history", () => {
    expect(canGoBack(emptyNav<string>())).toBe(false);
  });

  it("neutral/hard dismisses push onto the back stack; going does not", () => {
    let nav = emptyNav<string>();
    ({ nav } = advance(nav, "A", "neutral"));
    ({ nav } = advance(nav, "B", "hard"));
    expect(nav.back.map((e) => e.item)).toEqual(["A", "B"]);
    ({ nav } = advance(nav, "C", "going"));
    expect(nav.back.map((e) => e.item)).toEqual(["A", "B"]); // going not recorded
  });

  it("serves fresh when no forward cards are queued", () => {
    const { restore } = advance(emptyNav<string>(), "A", "neutral");
    expect(restore).toBeNull();
  });

  it("go back then re-decide returns to the exact card you were on", () => {
    // Frontier is C; A and B were dismissed to get here.
    let nav: DeckNav<string> = { back: [{ item: "A", action: "neutral" }, { item: "B", action: "neutral" }], forward: [] };

    // Go back from C → shows B, queues C forward.
    const back1 = goBack(nav, "C")!;
    nav = back1.nav;
    expect(back1.reverse.item).toBe("B");
    expect(nav.forward).toEqual(["C"]);

    // Re-decide B → restores C (not a fresh card).
    const adv = advance(nav, "B", "neutral");
    nav = adv.nav;
    expect(adv.restore).toBe("C");
    expect(nav.forward).toEqual([]);
  });

  it("supports multi-level back and walking forward again", () => {
    let nav: DeckNav<string> = { back: [{ item: "A", action: "neutral" }, { item: "B", action: "hard" }], forward: [] };

    const b1 = goBack(nav, "C")!; nav = b1.nav;   // show B, forward [C]
    expect(b1.reverse.item).toBe("B");
    const b2 = goBack(nav, "B")!; nav = b2.nav;   // show A, forward [C, B]
    expect(b2.reverse.item).toBe("A");
    expect(nav.forward).toEqual(["C", "B"]);
    expect(canGoBack(nav)).toBe(false);

    // Re-decide A → restore B; re-decide B → restore C.
    let r = advance(nav, "A", "neutral"); nav = r.nav;
    expect(r.restore).toBe("B");
    r = advance(nav, "B", "neutral"); nav = r.nav;
    expect(r.restore).toBe("C");
    expect(nav.forward).toEqual([]);
  });

  it("go back from a null current (end card) queues nothing forward", () => {
    const nav: DeckNav<string> = { back: [{ item: "A", action: "neutral" }], forward: [] };
    const res = goBack(nav, null)!;
    expect(res.reverse.item).toBe("A");
    expect(res.nav.forward).toEqual([]);
  });

  it("goBack returns null when nothing to reverse", () => {
    expect(goBack(emptyNav<string>(), "X")).toBeNull();
  });
});

/**
 * Back/forward navigation for the discovery deck.
 *
 * The deck serves cards forward off a cursor. This models a browser-style
 * history on top of that so "Go back" returns to a previous card and re-deciding
 * it walks you forward to exactly the card you were on — instead of skipping to a
 * brand-new one.
 *
 * Only the reversible dismisses (neutral "Not now", hard "Not interested") go on
 * the back stack; a "going" swipe advances but is never reversible via back.
 * Pure and generic (T = event) so the transition logic is unit-testable.
 */

export type DeckAction = "neutral" | "hard";

export interface NavEntry<T> {
  item: T;
  action: DeckAction;
}

export interface DeckNav<T> {
  /** Reversible dismissed cards, oldest first (top = most recent). */
  back: NavEntry<T>[];
  /** Cards displaced by "Go back", to restore on the next advance (top last). */
  forward: T[];
}

export function emptyNav<T>(): DeckNav<T> {
  return { back: [], forward: [] };
}

export function canGoBack<T>(nav: DeckNav<T>): boolean {
  return nav.back.length > 0;
}

/**
 * The user left `current` via `action`. Neutral/hard pushes onto the back stack;
 * "going" doesn't (not reversible). If a forward card is queued, it is restored;
 * otherwise the caller should serve a fresh card.
 */
export function advance<T>(
  nav: DeckNav<T>,
  current: T,
  action: DeckAction | "going"
): { nav: DeckNav<T>; restore: T | null } {
  const back = action === "going" ? nav.back : [...nav.back, { item: current, action }];
  if (nav.forward.length > 0) {
    const restore = nav.forward[nav.forward.length - 1];
    return { nav: { back, forward: nav.forward.slice(0, -1) }, restore };
  }
  return { nav: { back, forward: [] }, restore: null };
}

/**
 * Step back to the most recent reversible card. `current` (the card on screen)
 * is queued forward so re-deciding the restored card returns to it. `current`
 * may be null (e.g. an end card) — then nothing is queued forward.
 */
export function goBack<T>(
  nav: DeckNav<T>,
  current: T | null
): { nav: DeckNav<T>; reverse: NavEntry<T> } | null {
  if (nav.back.length === 0) return null;
  const reverse = nav.back[nav.back.length - 1];
  const forward = current != null ? [...nav.forward, current] : nav.forward;
  return { nav: { back: nav.back.slice(0, -1), forward }, reverse };
}

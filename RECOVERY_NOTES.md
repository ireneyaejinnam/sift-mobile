# Recovery Notes

Running notes from the Phase 2 recovery work (diagnostics + hardening).

## Recommender — the live scoring path

Production Discover ranking is:

- **`getEvents.computeEventScore`** ([src/lib/getEvents.ts](src/lib/getEvents.ts)) — the composite per-event score (quality / taste / timing / completeness / novelty, blended with a cold-start confidence ramp).
- **`eventRecommendations.getAllCandidates` / `getNextCandidate`** ([src/lib/eventRecommendations.ts](src/lib/eventRecommendations.ts)) — candidate selection + fallback tiers.

`src/lib/recommend.ts` is **not** part of ranking. As of EPIC 2 / H1, its dead recommendation exports (`getRecommendations`, `getRecommendationsFromDB`, `rankEvents`, `getGuestRecommendations`, and the `ScoredEvent` type) and their private helpers were deleted. It now contains only the **live session-pricing helpers** `scoreSession` and `getBudgetMax`, used by the Going date sheet ([src/components/events/GoingDateSheet.tsx](src/components/events/GoingDateSheet.tsx)) and event detail pricing ([src/components/events/EventDetail.tsx](src/components/events/EventDetail.tsx)).

## Debug score explanation

`__scoreExplanation` (attached to events by `computeEventScore`) is a debug-only bag. Only its `tasteBreakdown` field is read (by `getMatchReason` in discover). As of H2, its `components` weights are the confidence-blended effective weights so they sum to `finalScore`.

## Confidence-floor reach (R1)

The cold-start confidence floor in `computeEventScore` fires **only when `categoryWeight !== 1.0`** — i.e. the user has non-empty `category_weights`. It then forces `confidence ≥ 0.5`, giving the taste-heavy personalized score at least half weight even at 0 interactions.

- **Server-side reach today ≈ 0%.** D2 found **0 rows** in `user_taste_profiles` — the taste-setter was buried in Settings and taste didn't persist for guests (pre-EPIC-1). So server-side, essentially no user has non-default `category_weights`, and the floor never engages.
- **Caveat:** taste also lived in on-device AsyncStorage, which D2 cannot see — a swiping user could have local weights that trigger the floor in their own client. Server analytics understate reach.
- **Re-measurement plan:** after EPIC 1 (anon auth persists taste) + R3 (first-run surfacing) ship and users engage, re-run D2's Q2 (`% non-empty category_weights`) and Q3 (floor-fires cross-tab: `has_weights AND interaction_count<10`) and report the delta. That cell is the exact population the floor governs.

## Similarity evals (EPIC 4 Q5/Q6)

- **Dedup** (`npm run eval:dedup`, 40 labeled title pairs): at prod threshold **0.6 → P=0.875, R=0.700, F1=0.778**. Sweep shows 0.5 has best F1 (0.800); 0.6 is precision-leaning. Misses are accents/abbreviations/synonyms (alnum-strip + Jaccard weaknesses). Since dedup pre-buckets by exact date+venue (so title alone discriminates) and D1 said dedup isn't the deck-dry cause, **0.6 is fine — no change**. `isSimilar` extracted to `lib/ingest/similarity.ts` (pure, testable).
- **Social matcher** (`npm run eval:matching`, 26 pairs): at prod **> 0.5 → P=0.700, R=1.000, F1=0.824**. Recall-perfect; the 6 FPs are same-venue+same-date different-event pairs (date .3 + venue .2 already ≥ 0.5). Acceptable for a **user-confirmed** submit-event suggestion; raising to ~0.65 trades recall for precision if false suggestions become a problem.

## Ordering pipeline (post-rework, EPIC 4/5 Part A)

The deck audit found 24 transformations between DB and card, 8 redundant/conflicting/dead. Rationalized into ONE documented pipeline (`fetchAllUpcoming` → `rankFeedBatch` → serve):

1. **DB fetch** (`fetchAllUpcoming`) — curation filters (is_suppressed, public, excluded sources, vibe≥5|null) + `VIBE_SUPPRESSED` blocklist. Stable `(start_date, id)` order, **paginated** via `.range()` (offset). Category filter now matches **category OR tags**. No score-sort here (removed the double-scoring).
2. **`rankFeedBatch`** (shared by initial load + pagination top-ups, `discover.tsx`) — hidden-events filter → distance/borough → date-range → quiz-category hard filter → composite score (`applyPrefs` = `computeEventScore`) → optional exploration wildcards (flag-gated, **off**) → match reasons → dedup.
3. **Composite score** (`eventScore.ts`) — personalized (quality .20 / taste .50 / timing .15 / completeness .10 / novelty .05 / **social +.05**) blended with cold-start by a confidence ramp (floor removed, R4). socialSignal now a small additive boost.
4. **Serve time** (`nextSlotUpdate`) — single diversity pass (`isOverRepresented`: >1 same category in last 4 served is deferred). Continuous top-up until the DB is exhausted, then the end/done card.

**Removed distortions:** the 500-soonest truncation (now paginated), double score-sort, the conflicting live re-sort (now re-ranks only the unserved tail via the same ranker), the 70/category cap, the redundant second diversity pass, dead `injectExploreSlots` (now flag-gated) and dead `isSiftPick`.

## Recommender eval baseline (R2)

`npm run eval` (harness: `scripts/eval-recommender.ts`, labels: `data/eval/relevance.json`, 15 self-labeled triples, K=5). Baseline before any R4 change:

| scenario | n | P@5 | nDCG@5 |
|---|---|---|---|
| cold-start | 3 | 0.917 | 0.906 |
| floor-case | 3 | 0.111 | 0.156 |
| quiz-category | 3 | 0.500 | 0.339 |
| single-vs-conflicting | 3 | 0.506 | 0.578 |
| free-vs-paid | 3 | 0.383 | 0.519 |
| **OVERALL** | **15** | **0.483** | **0.500** |

Labels are self-authored (a regression signal, not ground truth). Note the low **floor-case** score: at 0 interactions a single category pick barely outranks high-quality items — evidence the scorer is *not* strongly over-boosting a lone quiz signal. R4's floor change is measured against this table.

## R4 — dropped the confidence floor (measured)

Change: removed the `(categoryWeight !== 1.0 && rawConfidence < 0.5) ? 0.5` special-case in `computeEventScore`; `confidence = min(1, interactionCount/20)` (pure ramp). Rationale: the quiz signal is already carried by `categoryAffinity` inside `tasteScore`; the floor double-counted it. One lever changed; re-ran `npm run eval`:

| scenario | P@5 before → after | nDCG@5 before → after |
|---|---|---|
| cold-start | 0.917 → 0.917 | 0.906 → 0.906 |
| floor-case | 0.111 → **0.389** | 0.156 → **0.357** |
| quiz-category | 0.500 → 0.500 | 0.339 → 0.339 |
| single-vs-conflicting | 0.506 → 0.506 | 0.578 → 0.578 |
| free-vs-paid | 0.383 → 0.383 | 0.519 → 0.519 |
| **OVERALL** | **0.483 → 0.539** | **0.500 → 0.540** |

Result: overall improved, floor-case improved markedly, **no scenario regressed** → change kept. Removing the floor at 0 interactions lets pure cold-start (quality/timing) surface the strong category matches rather than the half-taste blend diluting them. R6 tests updated to pin the new invariant (confidence depends only on `interactionCount`, not `categoryWeight`).

## Confidence distribution (D2, measured 2026-07-28)

Live query against `user_event_interactions`:

| metric | value |
|--------|-------|
| `user_taste_profiles` rows | **0** (taste-setter still buried; no server-side taste data) |
| users with ≥1 interaction | **15** |
| interaction counts (sorted) | 1, 1, 5, 7, 10, 16, 28, 30, 34, 37, 56, 58, 64, 111, 318 |
| median interactions | **30** |
| users at full confidence (≥20 interactions) | **9 / 15 (60%)** |
| users still in cold-start ramp (<20) | **6 / 15 (40%)** |

Confidence values (`min(1, interactionCount/20)`): 0.05, 0.05, 0.25, 0.35, 0.50, 0.80, 1.00 ×9.

**Convergence finding:** 60% of interacting users have reached full personalization confidence, meaning the scorer is running at full taste weight (50%) for the majority. However, **0 users have server-side taste profiles** — the taste-setter was buried in Settings (pre-EPIC 5 surfacing) and taste didn't persist for guests (pre-EPIC 1 anon auth). The confidence ramp works mechanically, but the taste signal it's amplifying comes entirely from implicit interaction weights (category/tag/borough/price bumps from swipes), not from explicit preference-setting. This means:

1. The onboarding taste flow removal (which was designed to reduce friction) didn't actually disable personalization — interaction-based taste learning carries the signal.
2. But the `categoryWeight` floor removal (R4) was the right call: with 0 explicit profiles, the floor was boosting an empty signal.
3. The real win will be when EPIC 1 (anon auth) + the taste banner (Profile) drive explicit taste data into `user_taste_profiles` — then the 50% taste weight will blend both explicit and implicit signals.

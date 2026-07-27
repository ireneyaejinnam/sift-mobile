# Sift Mobile App Audit

**Date:** 2026-07-15
**Source path:** `/Users/ireneyaejinnam/Downloads/startup-studio/sift-mobile`
**Branch:** `app-features`
**Auditor:** Claude Opus 4.6 (LOG ONLY -- no changes made)

---

## 1. Recommendation Engine

### Files implementing ranking/scoring

| File | Purpose |
|------|---------|
| `src/lib/getEvents.ts` | Primary scoring function (`computeEventScore`), Supabase fetch + taste-weighted sort |
| `src/lib/recommend.ts` | Legacy onboarding-quiz scorer (`scoreEvent`, `scoreSession`, `rankEvents`, `getRecommendations`, `getRecommendationsFromDB`, `diversify`) |
| `src/lib/eventRecommendations.ts` | Quiz-filter based candidate selection (`getEventCandidates`, `getAllCandidates`, `getNextCandidate`) |
| `src/lib/tasteProfile.ts` | Taste vector: load/save/bump/drop signals, cold-start hydration |
| `src/lib/interactions.ts` | Server-side interaction tracking (impressions, skips, saves, going, shares, hide logic) |

### Primary scoring function (verbatim)

From `src/lib/getEvents.ts:240-345`:

```typescript
export function computeEventScore(
  event: SiftEvent,
  categoryWeight = 1.0,
  impressionPenalty = 1.0,
  taste: TasteContext = DEFAULT_TASTE,
  dateRangeActive = false
): number {
  // Quality: vibe 1-10 -> 0-1, unchecked = 0.5 neutral
  const quality = event.vibeScore != null ? (event.vibeScore - 1) / 9 : 0.5;

  // -- Taste score (multi-dimensional) --
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

  // Timing
  let timing: number;
  if (dateRangeActive) {
    timing = 1.0;
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

  // Completeness
  const completeness =
    (event.imageUrl ? 0.4 : 0) +
    (event.description && event.description.length > 20 ? 0.3 : 0) +
    (event.location ? 0.2 : 0) +
    (event.priceLabel && event.priceLabel !== "See tickets" ? 0.1 : 0);

  const novelty = impressionPenalty;

  const personalizedScore =
    quality * 0.20 + tasteScore * 0.50 + timing * 0.15 + completeness * 0.10 + novelty * 0.05;

  // Cold start blending
  const rawConfidence = Math.min(1, taste.interactionCount / 20);
  const confidence = (categoryWeight !== 1.0 && rawConfidence < 0.5) ? 0.5 : rawConfidence;
  const coldStartScore = quality * 0.40 + timing * 0.30 + completeness * 0.20 + novelty * 0.10;

  const finalScore = confidence * personalizedScore + (1 - confidence) * coldStartScore;

  return finalScore;
}
```

**NOTE:** The actual deployed weights differ from MEMORY.md's stated formula. Documented: `quality 25% + taste 40% + timing 20% + completeness 10% + novelty 5%`. Actual code: `quality 20% + taste 50% + timing 15% + completeness 10% + novelty 5%`. And taste sub-weights: documented `borough 15% + price 15%` vs actual `borough 15% + price 15%` (match). Documented `category 35% + tags 35%` vs actual `category 35% + tags 35%` (match).

### Top-level ranking function signature

```typescript
// src/lib/getEvents.ts:240
export function computeEventScore(
  event: SiftEvent,
  categoryWeight?: number,        // default 1.0
  impressionPenalty?: number,      // default 1.0
  taste?: TasteContext,            // default DEFAULT_TASTE
  dateRangeActive?: boolean        // default false
): number
```

### User context shape (TasteContext)

```typescript
// src/lib/getEvents.ts:216-222
export interface TasteContext {
  categoryWeight: number;
  tagWeights: Record<string, number>;
  boroughWeights: Record<string, number>;
  pricePreference: { ceiling: number | null; freeBoost: number };
  interactionCount: number;
}
```

### Candidate event shape (SiftEvent)

```typescript
// src/types/event.ts:36-64
export interface SiftEvent {
  id: string;
  title: string;
  category: EventCategory;
  imageUrl?: string;
  description: string;
  location: string;
  address: string;
  borough: BoroughName;
  startDate: string;
  endDate?: string;
  time: string;
  price: number;
  priceLabel: string;
  link: string;
  matchReason?: string;
  endingSoon?: boolean;
  daysLeft?: number;
  tags: string[];
  ticketUrl?: string;
  eventUrl?: string;
  onSaleDate?: string;
  sessions?: EventSession[];
  locationsVary?: boolean;
  vibeScore?: number;
  socialSignal?: number;
  hookText?: string;
  publicationStatus?: string;
}
```

### Taste vector source and shape

From `src/lib/tasteProfile.ts:19-28`:

```typescript
export type TasteProfile = {
  categoryWeights: Partial<Record<EventCategory, number>>;  // 0.3-2.0
  tagWeights: Record<string, number>;                       // 0.2-2.5
  boroughWeights: Record<string, number>;                   // 0.3-2.0
  pricePreference: { ceiling: number | null; freeBoost: number };
  likedIds: string[];          // last 100
  dislikedIds: string[];       // last 100
  interactionCount: number;    // total for cold start confidence
  seededFromHistory?: boolean;
};
```

Stored in AsyncStorage (`sift_taste_profile_v2`) and Supabase (`user_taste_profiles` table). Loaded via `loadTasteProfile()`, updated on every swipe via `recordEventLike/Dislike/Save/Going`.

Signal strengths:
- Swipe right (like): category +0.10, tag +0.08, borough +0.06
- Swipe left (dislike): category -0.05, tag -0.04, borough -0.03
- Save: category +0.12
- Going: category +0.15

### Test coverage for scoring

**NONE.** No test files found for scoring, recommendations, or taste profile. The only `.test.` reference in the codebase is in `lib/ingest/reclassify.ts` (the word "test" in variable names) and `package-lock.json`. No `jest`, `vitest`, or `__tests__` directories exist. `package.json` has zero test scripts.

---

## 2. Data Model (Supabase)

### Tables with columns + types

**events** (main):
| Column | Type |
|--------|------|
| id | uuid PK |
| source | text |
| source_id | text |
| title | text |
| description | text |
| category | text |
| start_date | text |
| end_date | text |
| venue_name | text |
| address | text |
| neighborhood | text |
| borough | text |
| latitude | numeric |
| longitude | numeric |
| price_min | numeric |
| price_max | numeric |
| is_free | boolean |
| currency | text |
| ticket_url | text |
| event_url | text |
| image_url | text |
| on_sale_date | text |
| tags | text[] |
| expires_at | text |
| created_at | timestamptz |
| quality_score | float |
| source_tier | float |
| curator_boost | float |
| is_suppressed | boolean |
| social_signal | int |
| vibe_tags | text[] |
| vibe_score | smallint |
| vibe_checked | boolean |
| hook_text | text |
| publication_status | text |
| contributed_by | text |

**event_sessions**:
| Column | Type |
|--------|------|
| id | uuid PK |
| event_id | uuid FK -> events |
| date | date |
| time | text |
| venue_name | text |
| address | text |
| borough | text |
| price_min | numeric |
| price_max | numeric |
| created_at | timestamptz |

**user_profiles**:
| Column | Type |
|--------|------|
| user_id | uuid PK FK -> auth.users |
| display_name | text |
| interests | text[] |
| borough | text |
| neighborhood | text |
| travel_range | text |
| vibe | text |
| budget | text |
| free_days | text[] |
| free_time | text[] |
| created_at | timestamptz |
| updated_at | timestamptz |

**saved_events**: id (uuid), user_id (uuid FK), event_id (text), list_name (text), event_title (text), event_start_date (text), event_end_date (text), saved_at (timestamptz). Unique(user_id, event_id).

**going_events**: id (uuid), user_id (uuid FK), event_id (text), event_title (text), event_date (text), event_end_date (text), marked_at (timestamptz), committed (boolean), committed_at (timestamptz). Unique(user_id, event_id).

**custom_lists**: id (uuid), user_id (uuid FK), name (text), sort_order (integer), created_at (timestamptz). Unique(user_id, name).

**user_plan_event_orders**: id (uuid), user_id (uuid FK), plan_date (date), event_id (text), sort_order (integer), created_at (timestamptz). Unique(user_id, plan_date, event_id).

**user_taste_profiles**: user_id (uuid PK FK), category_weights (jsonb), tag_weights (jsonb), borough_weights (jsonb), price_preference (jsonb), liked_event_ids (text[]), disliked_event_ids (text[]), interaction_count (int), updated_at (timestamptz).

**user_event_interactions**: user_id (text), event_id (uuid FK), impression_count (int), skip_count (int), save_count (int), going_count (int), share_count (int), permanently_hidden (boolean), neutral_skip_count (int), suppressed_until (timestamptz), last_seen_at (timestamptz), last_action_at (timestamptz), created_at (timestamptz). PK(user_id, event_id).

**event_contributors**: event_id (uuid FK), user_id (text), source (text), created_at (timestamptz). PK(event_id, user_id).

**social_post_submissions**: id (uuid PK), url (text), platform (text), submitted_by (text), submitted_at (timestamptz), caption (text), thumbnail_url (text), author_handle (text), author_followers (int), like_count (int), view_count (int), external_link (text), manual_notes (text), extracted_* columns, status (text), match_confidence (float), match_event_id (uuid FK), reject_reason (text), reviewed_by (text), reviewed_at (timestamptz), created_event_id (uuid FK).

**event_social_links**: id (uuid PK), event_id (uuid FK), submission_id (uuid FK), platform (text), post_url (text), like_count (int), view_count (int), attached_at (timestamptz). Unique(event_id, submission_id).

**event_overrides**: id (uuid PK), event_id (uuid FK), override_type (text), boost_value (float), override_data (jsonb), note (text), applied_by (text), applied_at (timestamptz). Unique(event_id, override_type).

**ai_event_name_list**: id (uuid PK), name (text unique), source_url (text unique), sources (text[]), processed (boolean), created_at (timestamptz).

**ai_events**: id (uuid PK), source_id (text unique), source (text), title (text), category (text), description (text), start_date (date), end_date (date), venue_name (text), address (text), borough (text), price_min (numeric), price_max (numeric), is_free (boolean), event_url (text), image_url (text), ticket_url (text), on_sale_date (text), tags (text[]), vibe_score (numeric), is_suppressed (boolean), hook_text (text), created_at (timestamptz), updated_at (timestamptz).

**ai_event_sessions**: id (uuid PK), event_id (uuid FK -> ai_events), date (date), time (text), venue_name (text), address (text), borough (text), price_min (numeric), price_max (numeric), created_at (timestamptz).

**analytics** (referenced in track.ts but no migration found -- likely created manually): event_type (text), user_id (text), event_id (text), metadata (jsonb), created_at (timestamptz).

### Interaction tracking table + columns

Table: `user_event_interactions`
Columns: `user_id` (text), `event_id` (uuid), `skip_count` (int), `save_count` (int), `going_count` (int), `share_count` (int), `impression_count` (int), `permanently_hidden` (boolean), `neutral_skip_count` (int), `suppressed_until` (timestamptz).

### Interaction insert/upsert (verbatim)

From `src/lib/interactions.ts:106-120`:

```typescript
const row: Record<string, any> = {
  user_id: userId,
  event_id: eventId,
  [field]: currentCount,
  last_action_at: now,
  ...extraFields,
};

if (shouldHide) {
  row.permanently_hidden = true;
}

await db()
  .from("user_event_interactions")
  .upsert(row, { onConflict: "user_id,event_id" });
```

---

## 3. Analytics (Amplitude)

### Every tracked event

| Event Name | File:Line | Properties |
|------------|-----------|------------|
| `app_open` | `app/(tabs)/discover.tsx:177` | `{ has_profile }` |
| `onboarding_started` | `app/(onboarding)/flow.tsx:101` | none |
| `onboarding_step_1_complete` | `app/(onboarding)/flow.tsx:235` | `{ interests }` |
| `onboarding_step_2_complete` | `app/(onboarding)/flow.tsx:148` | `{ borough, neighborhood, travelRange }` |
| `onboarding_complete` | `app/(onboarding)/flow.tsx:152` | `{ interests, borough, budget }` |
| `sign_up_started` | `app/(auth)/signin.tsx:63` | none |
| `sign_up_completed` | `app/(auth)/signin.tsx:88` | `{ method: "email" }` |
| `sign_in_completed` | `app/(auth)/signin.tsx:100` | `{ method: "email" }` |
| `guest_started` | `app/(auth)/gate.tsx:51` | none |
| `first_event_viewed` | `app/event/[id].tsx:121` | `{ event_id, category }` |
| `recommendations_viewed` | `app/(tabs)/discover.tsx:685` | `{ count, source, ... }` |
| `card_tap` | `app/(tabs)/discover.tsx:1380` | `{ event_id, category }` |
| `event_saved` | `app/(tabs)/discover.tsx:1388` | `{ event_id }` |
| `event_going` | `app/(tabs)/discover.tsx:1018,1447`, `src/components/events/EventCard.tsx:190,521` | `{ event_id, source? }` |
| `ticket_click` | `app/event/[id].tsx:281`, `src/components/events/EventCard.tsx:435`, `src/components/events/EventDetail.tsx:491` | `{ event_id, ticket_url }` |
| `share_tap` | `app/(tabs)/discover.tsx:1392` | `{ event_id }` |
| `shared_link_opened` | `app/event/[id].tsx:105`, `app/_layout.tsx:32` | `{ event_id, has_profile? / has_app? }` |
| `calendar_export` | `app/event/[id].tsx:311,318`, `app/(tabs)/discover.tsx:980,987`, `app/(tabs)/plan.tsx:429,635`, `src/components/events/EventCard.tsx:129,136`, `src/components/events/EventDetail.tsx:99,106` | `{ event_id?, method, event_count? }` |
| `plan_created` | `app/(tabs)/plan.tsx:266` | `{ event_count }` |
| `feedback_submitted` | `src/components/feedback/InAppFeedback.tsx:62,72` | `{ rating?, comment? }` |
| `external_event_extracted` | `app/add-event.tsx:126` | `{ title, url }` |
| `external_event_added` | (defined in type, not found fired in code) | -- |
| `share_intent_received` | `app/_layout.tsx:68` | `{ url }` |
| `onboarding_step_3_complete` | (defined in type, not found fired in code) | -- |
| `onboarding_step_4_complete` | (defined in type, not found fired in code) | -- |

### Is there an event for tapping through to an external ticket/event link?

**YES.** `ticket_click` is fired in 3 locations:
- `app/event/[id].tsx:281`
- `src/components/events/EventCard.tsx:435`
- `src/components/events/EventDetail.tsx:491`

Properties: `{ event_id, ticket_url }`.

**However**, the "View event" / "Check it out" button (non-ticket URLs) in `EventDetail.tsx:511` is **NOT instrumented** -- it calls `WebBrowser.openBrowserAsync(url)` without any `track()` call.

---

## 4. Monetization Surface

### Does the app link out to ticket purchase?

**YES.** The app links out to ticket vendors (Eventbrite, RA, Ticketmaster, Dice, SeatGeek, StubHub, AXS, Fever, etc.) using `ticketUrl` on events.

### Where in the UI does the link live?

1. **EventCard** footer (`src/components/events/EventCard.tsx:432-443`) -- "Get tickets" button, gated by `isTicketVendorUrl(event.ticketUrl)`.
2. **EventDetail** body (`src/components/events/EventDetail.tsx:488-506`) -- "Get tickets" button, same gate.
3. **event/[id].tsx deep link page** (`app/event/[id].tsx:279-283`) -- "Get tickets" button.
4. **EventDetail "View event" fallback** (`src/components/events/EventDetail.tsx:511`) -- opens `eventUrl || link || ticketUrl` for non-ticket-vendor events.

### Is the tap instrumented?

- "Get tickets" tap: **YES** -- fires `ticket_click` with `{ event_id, ticket_url }`.
- "View event" / "Check it out" tap: **NO** -- no analytics event fired.
- The `markCommitted()` function is also called on ticket tap, setting `committed=true` + `committed_at` on the `going_events` row.

---

## 5. Event Ingest / Scrapers

### Sources

| Source | Module File |
|--------|------------|
| Dice.fm | `lib/ingest/dice.ts` |
| Resident Advisor | `lib/ingest/resident-advisor.ts` |
| Luma | `lib/ingest/luma.ts` |
| Fever | `lib/ingest/fever.ts` |
| Museums (MoMA, Whitney, New Museum, Brooklyn Museum) | `lib/ingest/museums.ts` |
| Eventbrite (curated organizer list, ~50 orgs) | `lib/ingest/eventbrite.ts` |
| Ticketmaster | `lib/ingest/ticketmaster.ts` |
| AI Discovery (Claude + OpenAI enrichment) | `lib/ai-collect-data/run-all.ts` |

Supporting modules: `lib/ingest/normalize.ts`, `lib/ingest/upsert.ts`, `lib/ingest/geocode.ts`, `lib/ingest/reclassify.ts`, `lib/ingest/dedup.ts`, `lib/ingest/cleanup.ts`, `lib/ingest/fetchImages.ts`.

### How is ingest triggered?

**GitHub Actions**, 2 workflows:

1. **Curated Scraper Ingest** (`.github/workflows/daily-ingest.yml`):
   - Cron: `0 7 */3 * *` (every 3 days at 07:00 UTC)
   - Runs: `npx tsx lib/ingest/run-daily.ts` then `npx tsx lib/ai-collect-data/score-scraped.ts`
   - Env secrets: SUPABASE_URL, SUPABASE_SERVICE_KEY, EVENTBRITE_OAUTH_TOKEN, GOOGLE_PLACES_API_KEY, OPENAI_API_KEY

2. **AI Event Discovery** (`.github/workflows/ai-discovery.yml`):
   - Cron: `0 11 */3 * *` (every 3 days at 11:00 UTC)
   - Runs: `npx tsx lib/ai-collect-data/run-all.ts` then `score-scraped.ts`
   - Additional secrets: ANTHROPIC_API_KEY, TAVILY_API_KEY, UNSPLASH_ACCESS_KEY, TICKETMASTER_API_KEY

Legacy Vercel cron endpoints exist (`api/cron/ingest-sources-curated.ts`, `api/cron/ingest-geocode.ts`, `api/cron/ingest-postprocess.ts`) but appear superseded by the GH Actions pipeline.

### Where does it run?

GitHub Actions (ubuntu-latest, Node 20). Timeout: 45min (scraper), 90min (AI discovery).

### Staleness or failure alerting?

**NONE.** No alerting, no Slack/email notifications, no health checks. Failures are logged to stdout and silently caught by the `run()` wrapper in `run-daily.ts`. No monitoring for whether the GH Action actually ran or succeeded.

---

## 6. Event Matching / Dedup

### Cross-source dedup

File: `lib/ingest/dedup.ts`

**`deduplicateEvents()`** -- groups by date+normalized venue, compares with `isSimilar()`:

```typescript
function isSimilar(a: string, b: string): boolean {
  if (a === b) return true;
  const stopWords = new Set(['the', 'a', 'an', 'at', 'in', 'on', 'of', 'and', 'with']);
  const wordsA = new Set(a.split(' ').filter(w => w.length > 2 && !stopWords.has(w)));
  const wordsB = new Set(b.split(' ').filter(w => w.length > 2 && !stopWords.has(w)));
  if (wordsA.size === 0 || wordsB.size === 0) return false;
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return intersection / union > 0.6;  // Jaccard threshold: 0.6
}
```

**`mergeRecurringEvents()`** -- same title+venue across dates -> merge into one event, reassign sessions.

**Data quality score for keeper selection:**
```typescript
function dataScore(ev: { description?: string | null; image_url?: string | null }): number {
  return (ev.description ? ev.description.length : 0) + (ev.image_url ? 50 : 0);
}
```

### Social/user-submitted event matching

File: `lib/social/match.ts`

**`matchToExistingEvent()`** -- matches user-submitted events against DB.

**`computeSimilarity()` (verbatim):**

```typescript
function computeSimilarity(
  extracted: ExtractedEvent,
  candidate: { title: string; start_date: string; venue_name?: string | null },
  overrideCandDate?: string
): number {
  const normExtTitle = normalize(extracted.title);
  const normCandTitle = normalize(candidate.title);

  // Title: best of 3 methods
  const titleSim = Math.max(
    jaccardWords(normExtTitle, normCandTitle),
    trigramDice(normExtTitle, normCandTitle),
    tokenContainment(normExtTitle, normCandTitle)
  );

  // Date: fuzzy
  let dateSim = 0.0;
  const candDateStr = overrideCandDate ?? candidate.start_date;
  if (extracted.startDate && candDateStr) {
    const extDate = new Date(extracted.startDate + 'T12:00:00Z').getTime();
    const candDate = new Date(candDateStr.slice(0, 10) + 'T12:00:00Z').getTime();
    const daysDiff = Math.abs(extDate - candDate) / (1000 * 60 * 60 * 24);
    if (daysDiff === 0) dateSim = 1.0;
    else if (daysDiff <= 2) dateSim = 0.7;
    else if (daysDiff <= 5) dateSim = 0.3;
  }

  // Venue: word Jaccard with exact match bonus
  let venueSim = 0.0;
  if (extracted.venue && candidate.venue_name) {
    const normExtVenue = normalize(extracted.venue);
    const normCandVenue = normalize(candidate.venue_name);
    if (normExtVenue === normCandVenue) {
      venueSim = 1.0;
    } else {
      venueSim = Math.max(
        jaccardWords(normExtVenue, normCandVenue),
        tokenContainment(normExtVenue, normCandVenue)
      );
    }
  }

  return titleSim * 0.5 + dateSim * 0.3 + venueSim * 0.2;
}
```

**Threshold constants:**
- Dedup Jaccard threshold: `> 0.6` (`lib/ingest/dedup.ts:198`)
- Match acceptance threshold: `> 0.5` (`lib/social/match.ts:125`)
- Token containment min words: `3` (`lib/social/match.ts:215`)
- Date fuzzy: exact=1.0, <=2 days=0.7, <=5 days=0.3, else=0.0
- Match weights: title 50%, date 30%, venue 20%

### Test or eval set for matching?

**NONE.** No test files, no eval datasets, no golden sets for dedup or matching.

---

## 7. UI Surface

### Screens/routes and navigation structure

```
app/
  index.tsx              -> Redirect to (auth)/gate
  _layout.tsx            -> Root Stack (GestureHandler + Providers)
  [...unmatched].tsx     -> Catch-all 404

  (auth)/
    gate.tsx             -> Welcome/landing screen (Guest or Sign In)
    signin.tsx           -> Email sign-in / sign-up

  (onboarding)/
    flow.tsx             -> 4-step onboarding quiz (interests, location, budget, vibe)

  (tabs)/
    _layout.tsx          -> Bottom tab navigator (Discover, Plan, Profile)
    discover.tsx         -> Main swipe discovery surface (~1400 lines)
    plan.tsx             -> Plan/itinerary builder (going events by date)
    profile.tsx          -> User profile, saved lists, settings links

  event/[id].tsx         -> Deep-linked event detail page
  add-event.tsx          -> Add event from shared URL (share intent)
  settings.tsx           -> Settings (change password, delete account, links)
  change-password.tsx    -> Change password form
```

### Main discovery/swipe surface

**`app/(tabs)/discover.tsx`** -- this is the primary swipe card interface. ~1450 lines. Contains:
- Quiz flow (category selection, date range, vibe)
- Card stack with gesture-driven swiping (right=going, left=not now, down=not interested)
- Event detail modal (bottom sheet)
- Save/going/share sheets
- Results filter bar
- Undo functionality
- Skeleton loading states + gesture tutorial overlay

---

## 8. Repo Health

### TypeScript errors (`npx tsc --noEmit`)

14 errors total, all in ingest modules (not in the app itself):

```
lib/ai-collect-data/upsert-ai-events.ts(139,38): error TS2345
lib/ingest/eventbrite.ts(18,11): error TS7022
lib/ingest/eventbrite.ts(22,11): error TS7022
lib/ingest/eventbrite.ts(31,11): error TS7022
lib/ingest/resident-advisor.ts(88,11): error TS2322
lib/ingest/resident-advisor.ts(89,33): error TS2339
lib/ingest/resident-advisor.ts(91,11): error TS2322
lib/ingest/resident-advisor.ts(92,11): error TS2322
lib/ingest/resident-advisor.ts(93,33): error TS2339
lib/ingest/resident-advisor.ts(94,30): error TS2339
lib/ingest/resident-advisor.ts(95,43): error TS2339
lib/ingest/resident-advisor.ts(95,65): error TS2339
lib/ingest/resident-advisor.ts(96,42): error TS2345
lib/ingest/resident-advisor.ts(104,11): error TS2322
```

All errors are in server-side scraper code (`lib/ingest/`), not in the React Native app source. The app code type-checks cleanly.

### Git contributors (`git shortlog -sn --all`)

```
65  Irene Nam
45  Jary Tolentino
42  yijie-cheng
 7  jag2430
```

### Last commit date

```
Wed May 6 03:36:09 2026 -0400
```

**~70 days stale** (last commit May 6, audit date July 15).

### CI

No CI pipeline for the app itself. The only GitHub Actions are the two ingest workflows (`daily-ingest.yml`, `ai-discovery.yml`). No lint, no type-check, no test CI.

### Test scripts in package.json

**NONE.** The `scripts` section contains only:
```json
{
  "start": "expo start",
  "android": "expo run:android",
  "ios": "expo run:ios",
  "web": "expo start --web",
  "build:web": "expo export --platform web"
}
```

No `test`, `lint`, `typecheck`, or `ci` scripts.

---

## Summary of Notable Findings

1. **Zero test coverage** -- no unit tests, no integration tests, no test scripts, no test framework installed.
2. **Zero CI for app code** -- no lint, typecheck, or test automation on push/PR.
3. **Repo 70 days stale** -- last commit May 6, 2026.
4. **Scoring formula drift** -- MEMORY.md documents `quality 25%` but code uses `quality 20%` / `taste 50%` (not 40%).
5. **3 defined analytics events never fired** -- `external_event_added`, `onboarding_step_3_complete`, `onboarding_step_4_complete` are defined in the `AnalyticsEventType` union but have no `track()` calls.
6. **"View event" tap not instrumented** -- `EventDetail.tsx:511` opens external URLs without tracking.
7. **No ingest failure alerting** -- scraper failures are caught and logged but never surfaced.
8. **14 TS errors in ingest code** -- `resident-advisor.ts` and `eventbrite.ts` have type errors that would fail strict checks.
9. **`@anthropic-ai/sdk` in both deps and devDeps** -- listed at `^0.87.0` (deps) and `^0.82.0` (devDeps), version conflict.
10. **`analytics` table has no migration** -- referenced in `track.ts` Supabase insert but no SQL migration found; likely created manually.

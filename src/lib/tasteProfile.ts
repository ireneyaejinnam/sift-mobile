/**
 * tasteProfile.ts
 *
 * Hybrid user taste profile:
 *   - Always cached in AsyncStorage (instant, works offline)
 *   - Synced to Supabase for logged-in users (persists across devices)
 *   - Self-authenticates via supabase.auth — no userId param needed
 *
 * Category weights (0.3–2.0) are multipliers on the base event score.
 * 1.0 = neutral. >1.0 = user likes this category. <1.0 = user avoids it.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import type { EventCategory } from "@/types/event";

const STORAGE_KEY = "sift_taste_profile_v1";

export type TasteProfile = {
  categoryWeights: Partial<Record<EventCategory, number>>;
  likedIds: string[];     // last 100 liked (going / saved)
  dislikedIds: string[];  // last 100 disliked (dismissed)
  seededFromHistory?: boolean; // true once existing saves/going are factored in
};

const WEIGHT_BUMP = 0.25;
const WEIGHT_DROP = 0.15;
const WEIGHT_MIN  = 0.3;
const WEIGHT_MAX  = 2.0;
const MAX_IDS     = 100;

// ── Auth helper ───────────────────────────────────────────────────────────────

async function getCurrentUserId(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

// ── Load ─────────────────────────────────────────────────────────────────────

export async function loadTasteProfile(): Promise<TasteProfile> {
  const userId = await getCurrentUserId();

  if (userId && supabase) {
    try {
      const { data } = await supabase
        .from("user_taste_profiles")
        .select("category_weights, liked_event_ids, disliked_event_ids")
        .eq("user_id", userId)
        .single();

      if (data) {
        const profile: TasteProfile = {
          categoryWeights: (data.category_weights as Partial<Record<EventCategory, number>>) ?? {},
          likedIds: (data.liked_event_ids as string[]) ?? [],
          dislikedIds: (data.disliked_event_ids as string[]) ?? [],
        };
        // Keep local cache in sync
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(profile)).catch(() => {});
        return profile;
      }
    } catch {}
  }

  // Guest or Supabase miss — use AsyncStorage
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as TasteProfile;
  } catch {}

  return { categoryWeights: {}, likedIds: [], dislikedIds: [] };
}

// ── Save ─────────────────────────────────────────────────────────────────────

async function saveProfile(profile: TasteProfile): Promise<void> {
  // Always keep local cache in sync
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(profile)).catch(() => {});

  const userId = await getCurrentUserId();
  if (userId && supabase) {
    void supabase.from("user_taste_profiles").upsert({
      user_id: userId,
      category_weights: profile.categoryWeights,
      liked_event_ids: profile.likedIds,
      disliked_event_ids: profile.dislikedIds,
      updated_at: new Date().toISOString(),
    });
  }
}

// ── Record interactions ───────────────────────────────────────────────────────

/**
 * Event-level signal — the user swiped right/left on a specific event.
 * Updates only likedIds/dislikedIds. Does NOT change category weights,
 * because "I'm not going to this particular concert" doesn't mean
 * "I dislike the whole concert category."
 */
export async function recordEventLike(eventId: string): Promise<TasteProfile> {
  const profile = await loadTasteProfile();
  profile.likedIds = [eventId, ...profile.likedIds.filter(id => id !== eventId)].slice(0, MAX_IDS);
  profile.dislikedIds = profile.dislikedIds.filter(id => id !== eventId);
  await saveProfile(profile);
  return profile;
}

export async function recordEventDislike(eventId: string): Promise<TasteProfile> {
  const profile = await loadTasteProfile();
  profile.dislikedIds = [eventId, ...profile.dislikedIds.filter(id => id !== eventId)].slice(0, MAX_IDS);
  profile.likedIds = profile.likedIds.filter(id => id !== eventId);
  await saveProfile(profile);
  return profile;
}

/**
 * Reverse a prior dislike (e.g. when the user taps Undo after an accidental
 * left swipe). Removes the id from dislikedIds so the event can resurface.
 */
export async function undoEventDislike(eventId: string): Promise<TasteProfile> {
  const profile = await loadTasteProfile();
  profile.dislikedIds = profile.dislikedIds.filter(id => id !== eventId);
  await saveProfile(profile);
  return profile;
}

/**
 * Category-level signal — user tapped "More like this" / "Not my thing"
 * explicitly. Updates only the category weight. Does NOT touch the id lists.
 */
export async function tuneUpCategory(category: EventCategory): Promise<TasteProfile> {
  const profile = await loadTasteProfile();
  profile.categoryWeights[category] = Math.min(
    WEIGHT_MAX,
    (profile.categoryWeights[category] ?? 1.0) + WEIGHT_BUMP
  );
  await saveProfile(profile);
  return profile;
}

export async function tuneDownCategory(category: EventCategory): Promise<TasteProfile> {
  const profile = await loadTasteProfile();
  profile.categoryWeights[category] = Math.max(
    WEIGHT_MIN,
    (profile.categoryWeights[category] ?? 1.0) - WEIGHT_DROP
  );
  await saveProfile(profile);
  return profile;
}

/**
 * @deprecated Use recordEventLike + tuneUpCategory separately.
 * Kept for backwards compat with any out-of-date callers.
 */
export async function recordLike(
  eventId: string,
  category: EventCategory
): Promise<TasteProfile> {
  const profile = await loadTasteProfile();

  profile.likedIds = [eventId, ...profile.likedIds.filter(id => id !== eventId)].slice(0, MAX_IDS);
  profile.dislikedIds = profile.dislikedIds.filter(id => id !== eventId);
  profile.categoryWeights[category] = Math.min(
    WEIGHT_MAX,
    (profile.categoryWeights[category] ?? 1.0) + WEIGHT_BUMP
  );

  await saveProfile(profile);
  return profile;
}

/**
 * @deprecated Use recordEventDislike + tuneDownCategory separately.
 */
export async function recordDislike(
  eventId: string,
  category: EventCategory
): Promise<TasteProfile> {
  const profile = await loadTasteProfile();

  profile.dislikedIds = [eventId, ...profile.dislikedIds.filter(id => id !== eventId)].slice(0, MAX_IDS);
  profile.likedIds = profile.likedIds.filter(id => id !== eventId);
  profile.categoryWeights[category] = Math.max(
    WEIGHT_MIN,
    (profile.categoryWeights[category] ?? 1.0) - WEIGHT_DROP
  );

  await saveProfile(profile);
  return profile;
}

// ── Migrate guest profile on login ───────────────────────────────────────────

export async function migrateToSupabase(): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId || !supabase) return;

  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    const local = JSON.parse(raw) as TasteProfile;
    if (!local.likedIds.length && !local.dislikedIds.length) return;

    const { data: remote } = await supabase
      .from("user_taste_profiles")
      .select("category_weights, liked_event_ids, disliked_event_ids")
      .eq("user_id", userId)
      .single();

    const remoteWeights = (remote?.category_weights as Partial<Record<EventCategory, number>>) ?? {};
    const merged: TasteProfile = {
      // Remote weights win on conflict (device they logged into previously is authoritative)
      categoryWeights: { ...local.categoryWeights, ...remoteWeights },
      likedIds: [...new Set([...(remote?.liked_event_ids ?? []), ...local.likedIds])].slice(0, MAX_IDS),
      dislikedIds: [...new Set([...(remote?.disliked_event_ids ?? []), ...local.dislikedIds])].slice(0, MAX_IDS),
    };

    await saveProfile(merged);
  } catch {}
}

// ── Build weights from real-time session signals ──────────────────────────────

/**
 * Merges stored taste profile weights with real-time session signals
 * (going/saved = positive, dismissed = negative).
 */
export function buildWeightsFromHistory(opts: {
  goingCategories: EventCategory[];
  savedCategories: EventCategory[];
  dismissedCategories: EventCategory[];
  storedWeights?: Partial<Record<EventCategory, number>>;
}): Partial<Record<EventCategory, number>> {
  const weights: Partial<Record<EventCategory, number>> = { ...opts.storedWeights };

  for (const cat of opts.goingCategories) {
    weights[cat] = Math.min(WEIGHT_MAX, (weights[cat] ?? 1.0) + WEIGHT_BUMP * 2);
  }
  for (const cat of opts.savedCategories) {
    weights[cat] = Math.min(WEIGHT_MAX, (weights[cat] ?? 1.0) + WEIGHT_BUMP);
  }
  for (const cat of opts.dismissedCategories) {
    weights[cat] = Math.max(WEIGHT_MIN, (weights[cat] ?? 1.0) - WEIGHT_DROP);
  }

  return weights;
}

// ── Hydrate from existing saves/going ─────────────────────────────────────────

// DB category → frontend EventCategory
const DB_TO_FRONTEND: Record<string, EventCategory> = {
  art:        "arts",
  live_music: "music",
  comedy:     "comedy",
  outdoors:   "outdoors",
  fitness:    "fitness",
  food:       "food",
  nightlife:  "nightlife",
  theater:    "theater",
  workshops:  "workshops",
  popups:     "popups",
};

/**
 * Seeds taste profile weights from the user's full save/going history.
 * Runs once — skipped if `seededFromHistory` is already true.
 * Call on app load after savedEvents and goingEvents are available.
 */
export async function hydrateTasteProfile(
  savedEventIds: string[],
  goingEventIds: string[]
): Promise<TasteProfile | null> {
  if (!supabase) return null;
  if (!savedEventIds.length && !goingEventIds.length) return null;

  const profile = await loadTasteProfile();
  if (profile.seededFromHistory) return null; // already done

  const allIds = [...new Set([...savedEventIds, ...goingEventIds])];
  if (!allIds.length) return null;

  try {
    const SOURCE = process.env.EXPO_PUBLIC_EVENTS_SOURCE;
    const USE_TEST = process.env.EXPO_PUBLIC_USE_TEST_DATA === "true";
    const eventsTable = SOURCE ? `${SOURCE}_events` : USE_TEST ? "test_events" : "events";

    const { data } = await supabase
      .from(eventsTable)
      .select("id, category")
      .in("id", allIds);

    if (!data?.length) return null;

    const categoryMap = new Map(
      data.map((e) => [e.id as string, DB_TO_FRONTEND[e.category as string]])
    );

    const goingSet = new Set(goingEventIds);

    for (const id of allIds) {
      const cat = categoryMap.get(id);
      if (!cat) continue;
      const bump = goingSet.has(id) ? WEIGHT_BUMP * 2 : WEIGHT_BUMP;
      profile.categoryWeights[cat] = Math.min(
        WEIGHT_MAX,
        (profile.categoryWeights[cat] ?? 1.0) + bump
      );
    }

    profile.seededFromHistory = true;
    await saveProfile(profile);
    return profile;
  } catch {
    return null;
  }
}

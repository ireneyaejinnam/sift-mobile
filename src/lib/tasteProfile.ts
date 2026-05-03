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

const STORAGE_KEY = "sift_taste_profile_v2";

export type TasteProfile = {
  categoryWeights: Partial<Record<EventCategory, number>>;
  tagWeights: Record<string, number>;
  boroughWeights: Record<string, number>;
  pricePreference: { ceiling: number | null; freeBoost: number };
  likedIds: string[];     // last 100 liked (going / saved)
  dislikedIds: string[];  // last 100 disliked (dismissed)
  interactionCount: number; // total meaningful interactions for cold start confidence
  seededFromHistory?: boolean;
};

const WEIGHT_BUMP = 0.25;
const WEIGHT_DROP = 0.15;
const WEIGHT_MIN  = 0.3;
const WEIGHT_MAX  = 2.0;
const TAG_BUMP    = 0.08;
const TAG_DROP    = 0.04;
const TAG_MIN     = 0.2;
const TAG_MAX     = 2.5;
const BOROUGH_BUMP = 0.06;
const BOROUGH_DROP = 0.03;
const MAX_IDS     = 100;
const MAX_TAGS    = 50; // cap tag weights map size

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

// ── Defaults & migration from v1 ─────────────────────────────────────────────

function ensureDefaults(partial: any): TasteProfile {
  const likedIds = partial.likedIds ?? [];
  const dislikedIds = partial.dislikedIds ?? [];
  // Derive interactionCount from history if missing (v1 migration / hydrated profiles)
  const interactionCount = partial.interactionCount > 0
    ? partial.interactionCount
    : likedIds.length + dislikedIds.length;
  return {
    categoryWeights: partial.categoryWeights ?? {},
    tagWeights: partial.tagWeights ?? {},
    boroughWeights: partial.boroughWeights ?? {},
    pricePreference: partial.pricePreference ?? { ceiling: null, freeBoost: 0 },
    likedIds,
    dislikedIds,
    interactionCount,
    seededFromHistory: partial.seededFromHistory,
  };
}

// ── Load ─────────────────────────────────────────────────────────────────────

export async function loadTasteProfile(): Promise<TasteProfile> {
  const userId = await getCurrentUserId();

  if (userId && supabase) {
    try {
      const { data } = await supabase
        .from("user_taste_profiles")
        .select("category_weights, tag_weights, borough_weights, price_preference, liked_event_ids, disliked_event_ids, interaction_count")
        .eq("user_id", userId)
        .single();

      if (data) {
        const profile = ensureDefaults({
          categoryWeights: data.category_weights,
          tagWeights: data.tag_weights,
          boroughWeights: data.borough_weights,
          pricePreference: data.price_preference,
          likedIds: data.liked_event_ids,
          dislikedIds: data.disliked_event_ids,
          interactionCount: data.interaction_count,
        });
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(profile)).catch(() => {});
        return profile;
      }
    } catch {}
  }

  // Guest or Supabase miss — use AsyncStorage (handles v1 → v2 migration via ensureDefaults)
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) return ensureDefaults(JSON.parse(raw));
    // Also check v1 key
    const v1 = await AsyncStorage.getItem("sift_taste_profile_v1");
    if (v1) return ensureDefaults(JSON.parse(v1));
  } catch {}

  return ensureDefaults({});
}

// ── Save ─────────────────────────────────────────────────────────────────────

async function saveProfile(profile: TasteProfile): Promise<void> {
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(profile)).catch(() => {});

  const userId = await getCurrentUserId();
  if (userId && supabase) {
    void supabase.from("user_taste_profiles").upsert({
      user_id: userId,
      category_weights: profile.categoryWeights,
      tag_weights: profile.tagWeights,
      borough_weights: profile.boroughWeights,
      price_preference: profile.pricePreference,
      liked_event_ids: profile.likedIds,
      disliked_event_ids: profile.dislikedIds,
      interaction_count: profile.interactionCount,
      updated_at: new Date().toISOString(),
    });
  }
}

// ── Signal strengths ─────────────────────────────────────────────────────────
const SWIPE_RIGHT_BUMP = 0.10;
const SWIPE_LEFT_DROP  = 0.05;
const SAVE_BUMP        = 0.12;
const GOING_BUMP       = 0.15;

/** Context about the event for multi-dimensional taste learning */
export interface EventContext {
  category?: EventCategory;
  tags?: string[];
  borough?: string;
  price?: number;  // price_min or 0 if free
}

// ── Taste update helpers ─────────────────────────────────────────────────────

function bumpTaste(profile: TasteProfile, ctx: EventContext, strength: number) {
  if (ctx.category) {
    profile.categoryWeights[ctx.category] = Math.min(
      WEIGHT_MAX,
      (profile.categoryWeights[ctx.category] ?? 1.0) + strength
    );
  }
  if (ctx.tags) {
    for (const tag of ctx.tags) {
      profile.tagWeights[tag] = Math.min(
        TAG_MAX,
        (profile.tagWeights[tag] ?? 1.0) + TAG_BUMP * (strength / SWIPE_RIGHT_BUMP)
      );
    }
    trimTagWeights(profile);
  }
  if (ctx.borough) {
    profile.boroughWeights[ctx.borough] = Math.min(
      WEIGHT_MAX,
      (profile.boroughWeights[ctx.borough] ?? 1.0) + BOROUGH_BUMP * (strength / SWIPE_RIGHT_BUMP)
    );
  }
  if (ctx.price != null) {
    if (ctx.price === 0) {
      profile.pricePreference.freeBoost = Math.min(2.0, profile.pricePreference.freeBoost + 0.05);
    }
  }
  profile.interactionCount++;
}

function dropTaste(profile: TasteProfile, ctx: EventContext, strength: number) {
  if (ctx.category) {
    profile.categoryWeights[ctx.category] = Math.max(
      WEIGHT_MIN,
      (profile.categoryWeights[ctx.category] ?? 1.0) - strength
    );
  }
  if (ctx.tags) {
    for (const tag of ctx.tags) {
      profile.tagWeights[tag] = Math.max(
        TAG_MIN,
        (profile.tagWeights[tag] ?? 1.0) - TAG_DROP * (strength / SWIPE_LEFT_DROP)
      );
    }
    trimTagWeights(profile);
  }
  if (ctx.borough) {
    profile.boroughWeights[ctx.borough] = Math.max(
      WEIGHT_MIN,
      (profile.boroughWeights[ctx.borough] ?? 1.0) - BOROUGH_DROP * (strength / SWIPE_LEFT_DROP)
    );
  }
  profile.interactionCount++;
}

/** Keep tag weights map from growing unbounded — prune lowest-signal entries */
function trimTagWeights(profile: TasteProfile) {
  const entries = Object.entries(profile.tagWeights);
  if (entries.length <= MAX_TAGS) return;
  // Remove entries closest to neutral (1.0)
  entries.sort((a, b) => Math.abs(a[1] - 1.0) - Math.abs(b[1] - 1.0));
  const toRemove = entries.slice(0, entries.length - MAX_TAGS);
  for (const [key] of toRemove) delete profile.tagWeights[key];
}

// ── Record interactions ───────────────────────────────────────────────────────

/**
 * Swipe right — positive signal.
 */
export async function recordEventLike(eventId: string, category?: EventCategory, ctx?: EventContext): Promise<TasteProfile> {
  const profile = await loadTasteProfile();
  profile.likedIds = [eventId, ...profile.likedIds.filter(id => id !== eventId)].slice(0, MAX_IDS);
  profile.dislikedIds = profile.dislikedIds.filter(id => id !== eventId);
  bumpTaste(profile, ctx ?? { category }, SWIPE_RIGHT_BUMP);
  await saveProfile(profile);
  return profile;
}

/**
 * Swipe left — negative signal.
 */
export async function recordEventDislike(eventId: string, category?: EventCategory, ctx?: EventContext): Promise<TasteProfile> {
  const profile = await loadTasteProfile();
  profile.dislikedIds = [eventId, ...profile.dislikedIds.filter(id => id !== eventId)].slice(0, MAX_IDS);
  profile.likedIds = profile.likedIds.filter(id => id !== eventId);
  dropTaste(profile, ctx ?? { category }, SWIPE_LEFT_DROP);
  await saveProfile(profile);
  return profile;
}

/**
 * Save — strong positive signal.
 */
export async function recordEventSave(eventId: string, category?: EventCategory, ctx?: EventContext): Promise<TasteProfile> {
  const profile = await loadTasteProfile();
  profile.likedIds = [eventId, ...profile.likedIds.filter(id => id !== eventId)].slice(0, MAX_IDS);
  profile.dislikedIds = profile.dislikedIds.filter(id => id !== eventId);
  bumpTaste(profile, ctx ?? { category }, SAVE_BUMP);
  await saveProfile(profile);
  return profile;
}

/**
 * Going — strongest positive signal.
 */
export async function recordEventGoing(eventId: string, category?: EventCategory, ctx?: EventContext): Promise<TasteProfile> {
  const profile = await loadTasteProfile();
  profile.likedIds = [eventId, ...profile.likedIds.filter(id => id !== eventId)].slice(0, MAX_IDS);
  profile.dislikedIds = profile.dislikedIds.filter(id => id !== eventId);
  bumpTaste(profile, ctx ?? { category }, GOING_BUMP);
  await saveProfile(profile);
  return profile;
}

/**
 * Reverse a prior dislike (e.g. when the user taps Undo after an accidental
 * left swipe). Removes the id from dislikedIds so the event can resurface.
 */
export async function undoEventDislike(eventId: string, category?: EventCategory, ctx?: EventContext): Promise<TasteProfile> {
  const profile = await loadTasteProfile();
  profile.dislikedIds = profile.dislikedIds.filter(id => id !== eventId);
  // Reverse the taste drop from the original dismiss
  bumpTaste(profile, ctx ?? { category }, SWIPE_LEFT_DROP);
  // Don't double-count: the original dismiss incremented interactionCount, undo decrements it
  profile.interactionCount = Math.max(0, profile.interactionCount - 1);
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
      .select("category_weights, tag_weights, borough_weights, price_preference, liked_event_ids, disliked_event_ids, interaction_count")
      .eq("user_id", userId)
      .single();

    const remoteWeights = (remote?.category_weights as Partial<Record<EventCategory, number>>) ?? {};
    const merged: TasteProfile = ensureDefaults({
      categoryWeights: { ...local.categoryWeights, ...remoteWeights },
      tagWeights: { ...local.tagWeights, ...(remote?.tag_weights as Record<string, number> ?? {}) },
      boroughWeights: { ...local.boroughWeights, ...(remote?.borough_weights as Record<string, number> ?? {}) },
      pricePreference: (remote?.price_preference as any) ?? local.pricePreference,
      likedIds: [...new Set([...(remote?.liked_event_ids ?? []), ...local.likedIds])].slice(0, MAX_IDS),
      dislikedIds: [...new Set([...(remote?.disliked_event_ids ?? []), ...local.dislikedIds])].slice(0, MAX_IDS),
      interactionCount: Math.max(local.interactionCount, remote?.interaction_count ?? 0),
    });

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
    const USE_TEST = process.env.EXPO_PUBLIC_USE_TEST_DATA === "true";
    const eventsTable = USE_TEST ? "test_events" : "events";

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

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SiftEvent } from "@/types/event";

const FEED_CACHE_KEY = "sift_cached_feed";
const MAX_CACHED = 50;

/**
 * Persist the most recently fetched, ranked feed so the deck has something real
 * to show when the app opens offline. SiftEvent fields are JSON-safe strings.
 */
export async function saveCachedFeed(events: SiftEvent[]): Promise<void> {
  try {
    await AsyncStorage.setItem(FEED_CACHE_KEY, JSON.stringify(events.slice(0, MAX_CACHED)));
  } catch {
    // best-effort cache; never break the feed for it
  }
}

/** Read the last cached feed (empty array if none / unreadable). */
export async function loadCachedFeed(): Promise<SiftEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(FEED_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SiftEvent[]) : [];
  } catch {
    return [];
  }
}

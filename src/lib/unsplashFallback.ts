/**
 * Client-side Unsplash fallback images.
 * Fetches one landscape photo per category per app session and caches it.
 * Uses the public access key — safe to include in the bundle.
 */

const KEY = process.env.EXPO_PUBLIC_UNSPLASH_ACCESS_KEY;

const QUERIES: Record<string, string> = {
  arts:      "art gallery exhibition new york",
  music:     "live concert music stage performance",
  theater:   "theater stage play performance",
  comedy:    "comedy stand up microphone",
  workshops: "workshop creative hands craft",
  fitness:   "fitness workout yoga outdoor",
  food:      "food dining restaurant table",
  outdoors:  "outdoor park nature new york",
  nightlife: "nightlife bar neon lights",
  popups:    "market popup shopping urban street",
};

// Module-level cache — persists for the app session
const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();

export async function getUnsplashFallback(category: string): Promise<string | null> {
  if (!KEY) return null;
  if (cache.has(category)) return cache.get(category)!;
  if (inflight.has(category)) return inflight.get(category)!;

  const promise = (async (): Promise<string | null> => {
    try {
      const query = QUERIES[category] ?? "new york city event";
      const res = await fetch(
        `https://api.unsplash.com/photos/random?query=${encodeURIComponent(query)}&orientation=landscape&client_id=${KEY}`
      );
      if (!res.ok) return null;
      const data = await res.json();
      const url: string | null = data.urls?.regular ?? null;
      if (url) cache.set(category, url);
      return url;
    } catch {
      return null;
    } finally {
      inflight.delete(category);
    }
  })();

  inflight.set(category, promise);
  return promise;
}

import { events } from "@/data/events";
import { fetchAllUpcoming } from "@/lib/getEvents";
import { todayNYC } from "@/lib/time";
import type { SiftEvent } from "@/types/event";
import type { UserProfile } from "@/types/user";

export interface ScoredEvent {
  event: SiftEvent;
  score: number;
  matchReasons: string[];
}

const INTEREST_TO_CATEGORY: Record<string, string> = {
  live_music: "music",
  art_exhibitions: "arts",
  theater: "theater",
  workshops: "workshops",
  fitness: "fitness",
  comedy: "comedy",
  food: "food",
  outdoor: "outdoors",
  nightlife: "nightlife",
  popups: "popups",
};

const CATEGORY_LABELS: Record<string, string> = {
  music: "live music",
  arts: "art",
  comedy: "comedy",
  outdoors: "outdoor activities",
  fitness: "fitness",
  food: "food events",
  nightlife: "nightlife",
  theater: "theater",
  workshops: "workshops",
  popups: "pop-ups",
};

const ADJACENT_BOROUGHS: Record<string, string[]> = {
  Manhattan: ["Brooklyn", "Queens"],
  Brooklyn: ["Manhattan", "Queens"],
  Queens: ["Manhattan", "Brooklyn", "Bronx"],
  Bronx: ["Manhattan", "Queens"],
  "Staten Island": [],
};

// Keywords associated with each interest for description-level matching
const INTEREST_KEYWORDS: Record<string, string[]> = {
  live_music: ["music", "concert", "band", "dj", "jazz", "rock", "hip hop", "singer"],
  art_exhibitions: ["art", "gallery", "exhibit", "museum", "painting", "sculpture", "sculptures", "installation", "collection", "retrospective", "masterpiece", "group show", "solo show", "on view", "showcasing", "curator", "posters", "prints"],
  comedy: ["comedy", "comedian", "improv", "stand-up", "funny", "laugh"],
  outdoor: ["park", "garden", "outdoor", "rooftop", "nature", "hike", "walk", "bike"],
  fitness: ["yoga", "run", "fitness", "workout", "gym", "cycling", "marathon", "pilates"],
  food: ["food", "tasting", "chef", "culinary", "cocktail", "wine", "brunch", "dinner", "bakery", "pastry", "chocolate"],
  nightlife: ["club", "bar", "lounge", "dance", "party", "late night", "nightlife"],
  theater: ["theater", "theatre", "musical", "broadway", "opera", "ballet", "dance", "production", "tony", "playwright", "encores", "stage show", "performing arts"],
  workshops: ["workshop", "class", "learn", "seminar", "masterclass", "tutorial"],
  popups: ["pop-up", "sample sale", "market", "bazaar", "trunk show"],
};

// Well-known NYC venues that signal "popular"
const POPULAR_VENUES = [
  "brooklyn steel", "terminal 5", "bowery ballroom", "webster hall",
  "irving plaza", "radio city", "madison square garden", "barclays center",
  "comedy cellar", "gotham comedy", "prospect park", "central park",
  "moma", "whitney", "guggenheim", "brooklyn museum", "bam",
  "house of yes", "elsewhere", "beacon theatre", "le poisson rouge",
  "smorgasburg", "chelsea market", "lincoln center",
];

export function getBudgetMax(budget: string): number | null {
  switch (budget) {
    case "free": return 0;
    case "under_20": return 20;
    case "under_50": return 50;
    case "no_limit": return null;
    default: return null;
  }
}

function getDayOfWeek(dateStr: string): string {
  const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return days[new Date(dateStr).getDay()];
}

function getTimeOfDay(timeStr: string): string {
  const match = timeStr.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|AM|PM)?/);
  if (!match) return "evening";
  let hour = parseInt(match[1], 10);
  const ampm = match[3]?.toLowerCase();
  if (ampm === "pm" && hour < 12) hour += 12;
  if (ampm === "am" && hour === 12) hour = 0;
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 21) return "evening";
  return "late_night";
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Score a single session against the user profile.
 * Returns { sessionScore, sessionReasons } without the event-level bonuses
 * (those are added once per event, not per session).
 */
export function scoreSession(
  session: { startDate: string; time?: string; address?: string; borough?: string; priceMin?: number },
  profile: UserProfile,
  eventBudgetMax: number | null
): { pts: number; reasons: string[] } {
  let pts = 0;
  const reasons: string[] = [];

  // Borough match
  const sessionBorough = session.borough as SiftEvent["borough"] | undefined;
  if (sessionBorough === profile.borough) {
    pts += 20;
    reasons.push(`it's in ${profile.borough}`);
  } else if (sessionBorough && ADJACENT_BOROUGHS[profile.borough]?.includes(sessionBorough)) {
    pts += 10;
  }

  // Neighborhood match
  if (profile.neighborhood && session.address?.toLowerCase().includes(profile.neighborhood.toLowerCase())) {
    pts += 10;
    reasons.push("it's in your neighborhood");
  }

  // Budget match for this session's price
  const sessionPrice = session.priceMin ?? 0;
  if (sessionPrice === 0 && profile.budget === "free") {
    pts += 15;
    reasons.push("it's free");
  } else if (eventBudgetMax !== null && sessionPrice <= eventBudgetMax) {
    pts += 15;
    if (eventBudgetMax > 0) reasons.push(`under your $${eventBudgetMax} budget`);
  } else if (eventBudgetMax === null) {
    pts += 15;
  } else {
    pts -= 20;
  }

  // Day match
  const day = getDayOfWeek(session.startDate);
  if (profile.freeDays?.includes(day)) {
    pts += 15;
    reasons.push(`you're free ${capitalize(day)}`);
  }

  // Time match
  const time = getTimeOfDay(session.time ?? "");
  if (profile.freeTime?.includes(time)) {
    pts += 10;
  }

  // Recency boost (session starting within 3 days)
  const daysUntil = Math.ceil(
    (new Date(session.startDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
  if (daysUntil >= 0 && daysUntil <= 3) {
    pts += 8;
    if (daysUntil === 0) reasons.push("happening today");
    else if (daysUntil === 1) reasons.push("happening tomorrow");
    else reasons.push("coming up soon");
  }

  return { pts, reasons };
}

function scoreEvent(event: SiftEvent, profile: UserProfile): ScoredEvent {
  let score = 0;
  const reasons: string[] = [];

  const profileCategories = profile.interests.map(
    (i) => INTEREST_TO_CATEGORY[i]
  );
  const budgetMax = getBudgetMax(profile.budget);

  // ── Category match (25 pts)
  if (profileCategories.includes(event.category)) {
    score += 25;
    reasons.push(`you're into ${CATEGORY_LABELS[event.category] || event.category}`);
  }

  // ── Description keyword matching (5–10 pts)
  const descLower = `${event.description} ${event.title}`.toLowerCase();
  let descBonus = 0;
  for (const interest of profile.interests) {
    const keywords = INTEREST_KEYWORDS[interest];
    if (!keywords) continue;
    if (INTEREST_TO_CATEGORY[interest] === event.category) continue;
    const matches = keywords.filter((kw) => descLower.includes(kw));
    if (matches.length >= 2) {
      descBonus = Math.max(descBonus, 10);
      reasons.push(`mentions ${matches[0]} + ${matches[1]}`);
    } else if (matches.length === 1) {
      descBonus = Math.max(descBonus, 5);
    }
  }
  score += descBonus;

  // ── Best-session scoring: find the session that scores highest for this user ──
  // Considers borough, neighborhood, price, day, time, recency per session.
  const sessions = event.sessions ?? [{
    startDate: event.startDate,
    time: event.time,
    address: event.address,
    borough: event.borough,
    priceMin: event.price,
  }];

  let bestSessionPts = -Infinity;
  let bestSessionReasons: string[] = [];

  for (const session of sessions) {
    const { pts, reasons: sReasons } = scoreSession(session, profile, budgetMax);
    if (pts > bestSessionPts) {
      bestSessionPts = pts;
      bestSessionReasons = sReasons;
    }
  }
  score += bestSessionPts;
  for (const r of bestSessionReasons) {
    if (!reasons.includes(r)) reasons.push(r);
  }

  // ── Ending soon boost (10 pts — urgency)
  if (event.endingSoon && event.daysLeft != null && event.daysLeft <= 7) {
    score += 10;
    reasons.push(`ends in ${event.daysLeft} day${event.daysLeft === 1 ? "" : "s"}`);
  }

  // ── Popular venue boost (5 pts)
  if (profile.vibe === "popular_spots") {
    const locationsToCheck = event.locationsVary
      ? sessions.map((s) => s.location ?? s.address ?? "")
      : [event.location];
    if (locationsToCheck.some((loc) => POPULAR_VENUES.some((v) => loc.toLowerCase().includes(v)))) {
      score += 5;
      reasons.push("popular venue");
    }
  }

  // ── Free event bonus (5 pts)
  if (event.price === 0) {
    score += 5;
  }

  // ── Has image bonus (3 pts)
  if (event.imageUrl) {
    score += 3;
  }

  // ── Vibe modifier
  if (profile.vibe === "surprise_me") {
    if (!profileCategories.includes(event.category)) {
      score += 8;
      reasons.push("something different for you");
    }
  } else if (profile.vibe === "hidden_gems") {
    if (event.price <= 20) {
      score += 5;
    }
  } else if (profile.vibe === "popular_spots") {
    const popularTags = ["arena", "festival", "concert", "stand-up", "club", "candlelight"];
    if (event.tags.some((t) => popularTags.includes(t))) {
      score += 5;
    }
  }

  return { event, score, matchReasons: reasons };
}

/**
 * Score and sort a pre-fetched list of events against a user profile.
 * Unlike getRecommendationsFromDB, applies no score > 0 cutoff —
 * all events are returned, ordered best-match first.
 */
export function rankEvents(events: SiftEvent[], profile: UserProfile): SiftEvent[] {
  const scored = events.map((e) => scoreEvent(e, profile));
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => ({
    ...s.event,
    matchReason: s.matchReasons.length > 0
      ? s.matchReasons.slice(0, 3).join(" · ")
      : "Picked for you",
  }));
}

/**
 * Post-scoring diversification.
 * Ensures no more than 2 consecutive events of the same category.
 * If 3+ interests, ensures at least 2 categories in top 5.
 */
function diversify(scored: ScoredEvent[], profile: UserProfile): ScoredEvent[] {
  if (scored.length <= 2) return scored;

  const result = [...scored];

  // Pass 1: Break runs of 3+ same-category events
  for (let i = 2; i < result.length; i++) {
    if (
      result[i].event.category === result[i - 1].event.category &&
      result[i].event.category === result[i - 2].event.category
    ) {
      // Find the next event with a different category and swap
      for (let j = i + 1; j < result.length; j++) {
        if (result[j].event.category !== result[i].event.category) {
          const temp = result[i];
          result[i] = result[j];
          result[j] = temp;
          break;
        }
      }
    }
  }

  // Pass 2: If user has 3+ interests, ensure top 5 has at least 2 categories
  if (profile.interests.length >= 3) {
    const top5 = result.slice(0, 5);
    const categories = new Set(top5.map((s) => s.event.category));
    if (categories.size < 2) {
      // Find first event outside top 5 with a different category
      const dominantCategory = top5[0]?.event.category;
      for (let j = 5; j < result.length; j++) {
        if (result[j].event.category !== dominantCategory) {
          // Swap it into position 2 (after the top 2 of the dominant category)
          const temp = result[2];
          result[2] = result[j];
          result[j] = temp;
          break;
        }
      }
    }
  }

  return result;
}

/**
 * Score all events against a user profile and return the top N.
 * Includes diversity post-processing to ensure varied results.
 */
export function getRecommendations(
  profile: UserProfile,
  limit: number = 5
): ScoredEvent[] {
  const today = todayNYC();

  const upcoming = events.filter((e) => (e.endDate ?? e.startDate) >= today);

  const scored = upcoming.map((e) => scoreEvent(e, profile));
  scored.sort((a, b) => b.score - a.score);

  const positive = scored.filter((s) => s.score > 0);
  const diversified = diversify(positive, profile);

  return diversified.slice(0, limit);
}

/**
 * Async version: fetch events from Supabase, score against profile.
 * Falls back to hardcoded data if Supabase fails.
 */
export async function getRecommendationsFromDB(
  profile: UserProfile,
  limit: number = 5
): Promise<ScoredEvent[]> {
  try {
    const dbEvents = await fetchAllUpcoming(500);
    if (dbEvents.length > 0) {
      const scored = dbEvents.map((e) => scoreEvent(e, profile));
      scored.sort((a, b) => b.score - a.score);
      const positive = scored.filter((s) => s.score > 0);
      const diversified = diversify(positive, profile);
      return diversified.slice(0, limit);
    }
  } catch (err) {
    // Supabase fetch failed — fall through to local data
  }
  // Fallback to hardcoded data
  return getRecommendations(profile, limit);
}

/**
 * For guest users: return upcoming events sorted by date, no scoring.
 */
export function getGuestRecommendations(
  categories?: string[],
  limit: number = 10
): SiftEvent[] {
  const today = todayNYC();

  let upcoming = events.filter((e) => (e.endDate ?? e.startDate) >= today);

  if (categories?.length) {
    upcoming = upcoming.filter((e) => categories.includes(e.category));
  }

  upcoming.sort(
    (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
  );

  return upcoming.slice(0, limit);
}

import { events } from "@/data/events";
import type { SiftEvent } from "@/types/event";
import type { Filters } from "@/types/quiz";
import type { UserProfile } from "@/types/user";

function isUpcoming(event: SiftEvent): boolean {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const end = new Date(event.endDate ?? event.startDate);
  return end >= now;
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

function rangesOverlap(
  filterStart: string,
  filterEnd: string,
  eventStart: string,
  eventEnd?: string
) {
  const userStart = new Date(filterStart);
  const userEnd = new Date(filterEnd);
  // ±1 day padding for flexibility
  userStart.setDate(userStart.getDate() - 1);
  userEnd.setDate(userEnd.getDate() + 1);
  const itemStart = new Date(eventStart);
  const itemEnd = new Date(eventEnd ?? eventStart);
  return itemStart <= userEnd && itemEnd >= userStart;
}

function applyMatchReason(event: SiftEvent, filters: Filters): SiftEvent {
  const reasons: string[] = [];
  if (filters.categories?.length) reasons.push("Matches your mood");
  if (filters.dateFrom && filters.dateTo) reasons.push("Available in your dates");
  if (event.price === 0) reasons.push("It's free");
  if (event.endingSoon) reasons.push(`Only ${event.daysLeft} days left`);
  return {
    ...event,
    matchReason: reasons.length > 0 ? reasons.join(" · ") : "Picked for you",
  };
}

export function getEventCandidates(
  filters: Filters,
  excludedIds: string[] = []
): SiftEvent[] {
  let filtered = events.filter(isUpcoming);

  if (excludedIds.length > 0) {
    filtered = filtered.filter((e) => !excludedIds.includes(e.id));
  }

  if (filters.categories?.length) {
    filtered = filtered.filter((e) => filters.categories!.includes(e.category));
  }

  if (filters.dateFrom && filters.dateTo) {
    const { dateFrom, dateTo } = filters;
    filtered = filtered.filter((e) =>
      rangesOverlap(dateFrom, dateTo, e.startDate, e.endDate)
    );
  }

  if (filters.price) {
    switch (filters.price) {
      case "free":
        filtered = filtered.filter((e) => e.price === 0);
        break;
      case "under-20":
        filtered = filtered.filter((e) => e.price <= 20);
        break;
      case "under-50":
        filtered = filtered.filter((e) => e.price <= 50);
        break;
    }
  }

  if (filters.distance) {
    if (filters.distance === "neighborhood") {
      filtered = filtered.filter((e) => e.borough === "Manhattan");
    } else if (filters.distance === "borough") {
      filtered = filtered.filter(
        (e) => e.borough === "Manhattan" || e.borough === "Brooklyn"
      );
    }
  }

  if (filters.vibe === "hidden_gems") {
    filtered = filtered.filter((e) => e.price <= 20);
  } else if (filters.vibe === "popular") {
    const popularTags = ["arena", "festival", "concert", "stand-up", "club", "candlelight"];
    filtered = filtered.filter(
      (e) => e.price > 20 || e.tags.some((t) => popularTags.includes(t))
    );
  }
  // "surprise_me" → no extra filter, handled by shuffle

  return filtered.map((e) => applyMatchReason(e, filters));
}

/** Returns candidates in priority order: quiz filters → user interests → any remaining. */
export function getAllCandidates(
  filters: Filters,
  excludedIds: string[] = [],
  userProfile?: UserProfile | null
): SiftEvent[] {
  const shuffle = (arr: SiftEvent[]) => [...arr].sort(() => Math.random() - 0.5);

  // Tier 1: matches all quiz filters including selected categories
  const tier1 = getEventCandidates(filters, excludedIds);

  // Tier 2: matches user's saved interests (ignoring quiz categories)
  let tier2: SiftEvent[] = [];
  if (userProfile?.interests?.length) {
    const interestCategories = userProfile.interests
      .map((i) => INTEREST_TO_CATEGORY[i])
      .filter(Boolean);
    const broader = getEventCandidates({ ...filters, categories: undefined }, excludedIds);
    const tier1Ids = new Set(tier1.map((e) => e.id));
    tier2 = broader.filter(
      (e) => interestCategories.includes(e.category) && !tier1Ids.has(e.id)
    );
  }

  // Tier 3: any remaining upcoming events
  const usedIds = new Set([...tier1.map((e) => e.id), ...tier2.map((e) => e.id)]);
  const tier3 = getEventCandidates({ ...filters, categories: undefined }, excludedIds)
    .filter((e) => !usedIds.has(e.id));

  return [...shuffle(tier1), ...shuffle(tier2), ...shuffle(tier3)];
}

/**
 * Gets the next replacement card with fallback priority:
 * 1. Matches original quiz filters
 * 2. Matches user's saved onboarding interests
 * 3. Any remaining event (random)
 */
export function getNextCandidate(
  excludedIds: string[],
  filters: Filters,
  userProfile?: UserProfile | null
): SiftEvent | null {
  const byFilters = getEventCandidates(filters, excludedIds);
  if (byFilters.length > 0) {
    return byFilters[Math.floor(Math.random() * byFilters.length)];
  }

  // Tier 2: user's saved interests (respecting date/distance/price but not quiz categories)
  if (userProfile?.interests?.length) {
    const interestCategories = userProfile.interests
      .map((i) => INTEREST_TO_CATEGORY[i])
      .filter(Boolean);
    const broader = getEventCandidates({ ...filters, categories: undefined }, excludedIds);
    const byInterest = broader.filter((e) => interestCategories.includes(e.category));
    if (byInterest.length > 0) {
      return byInterest[Math.floor(Math.random() * byInterest.length)];
    }
  }

  // Tier 3: any remaining upcoming event (still respecting date/distance/price)
  const remaining = getEventCandidates({ ...filters, categories: undefined }, excludedIds);
  if (remaining.length > 0) {
    return remaining[Math.floor(Math.random() * remaining.length)];
  }

  return null;
}

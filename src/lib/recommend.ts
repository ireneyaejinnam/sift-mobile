import type { SiftEvent } from "@/types/event";
import type { UserProfile } from "@/types/user";

// Session-level pricing/timing scorer used by the Going date sheet and event
// detail pricing. The recommendation exports that used to live here were dead
// code — production ranking is `getEvents.computeEventScore` +
// `eventRecommendations.getAllCandidates/getNextCandidate`.

const ADJACENT_BOROUGHS: Record<string, string[]> = {
  Manhattan: ["Brooklyn", "Queens"],
  Brooklyn: ["Manhattan", "Queens"],
  Queens: ["Manhattan", "Brooklyn", "Bronx"],
  Bronx: ["Manhattan", "Queens"],
  "Staten Island": [],
};

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
 * Returns { pts, reasons } without the event-level bonuses
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

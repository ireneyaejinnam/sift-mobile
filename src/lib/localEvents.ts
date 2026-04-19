/**
 * localEvents.ts — local JSON-seeded event source for dev/testing.
 *
 * Active when EXPO_PUBLIC_USE_LOCAL_SEED=true. Reads events from
 * lib/ai-collect-data/output/ai_new_events.json and returns them in the
 * same SiftEvent shape the Supabase fetchers produce.
 */
import localSeed from "../../lib/ai-collect-data/output/ai_new_events.json";
import type { SiftEvent, EventCategory, EventSession } from "@/types/event";
import type { Filters } from "@/types/quiz";
import { todayNYC, nowNYC } from "./time";

const DB_TO_CATEGORY: Record<string, EventCategory> = {
  art: "arts",
  live_music: "music",
  comedy: "comedy",
  outdoors: "outdoors",
  fitness: "fitness",
  food: "food",
  nightlife: "nightlife",
  theater: "theater",
  workshops: "workshops",
  popups: "popups",
};

const VALID_BOROUGHS = ["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"] as const;

function toBorough(b?: string | null): SiftEvent["borough"] {
  if (!b) return "Manhattan";
  const match = VALID_BOROUGHS.find((v) => v.toLowerCase() === b.toLowerCase());
  return (match ?? "Manhattan") as SiftEvent["borough"];
}

function formatPriceLabel(
  isFree: boolean,
  pmin?: number | null,
  pmax?: number | null
): string {
  if (isFree || pmin === 0) return "Free";
  if (pmin != null && pmax != null) return pmin === pmax ? `$${pmin}` : `$${pmin}–$${pmax}`;
  if (pmin != null) return `From $${pmin}`;
  return "See tickets";
}

function toSiftEvent(raw: any): SiftEvent {
  const startDate: string = raw.start_date;
  const endDate: string | undefined = raw.end_date ?? undefined;
  const primaryLink: string = raw.ticket_url ?? raw.event_url ?? "";

  const now = nowNYC();
  const lastDate = new Date((endDate ?? startDate) + "T12:00:00Z");
  const daysLeft = Math.ceil((lastDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  const session: EventSession = {
    startDate,
    location: raw.venue_name ?? undefined,
    address: raw.address ?? undefined,
    borough: raw.borough ?? undefined,
    priceMin: raw.price_min ?? undefined,
    priceMax: raw.price_max ?? undefined,
    link: primaryLink,
  };

  return {
    id: String(raw.source_id),
    title: raw.title,
    category: (DB_TO_CATEGORY[raw.category] ?? "popups") as EventCategory,
    imageUrl: raw.image_url ?? undefined,
    description: raw.description ?? "",
    location: raw.venue_name ?? "",
    address: raw.address ?? "",
    borough: toBorough(raw.borough),
    startDate,
    endDate,
    time: "",
    price: raw.price_min ?? 0,
    priceLabel: formatPriceLabel(raw.is_free === true, raw.price_min, raw.price_max),
    link: primaryLink,
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    ticketUrl: raw.ticket_url ?? undefined,
    eventUrl: raw.event_url ?? undefined,
    endingSoon: daysLeft <= 7 && daysLeft > 0,
    daysLeft: daysLeft > 0 ? daysLeft : undefined,
    sessions: [session],
    locationsVary: false,
    vibeScore: undefined,
  };
}

const ALL_LOCAL: SiftEvent[] = (localSeed as any[]).map(toSiftEvent);

export const LOCAL_SEED_COUNT = ALL_LOCAL.length;

/** Mirrors fetchEvents but served from the local JSON. */
export function fetchLocalEvents(filters: Filters, limit = 100): SiftEvent[] {
  const today = todayNYC();
  const dateFrom = filters.dateFrom ?? today;
  const dateTo = filters.dateTo ?? null;

  const filtered = ALL_LOCAL.filter((e) => {
    const effectiveEnd = e.endDate ?? e.startDate;
    if (effectiveEnd < dateFrom) return false;
    if (dateTo && e.startDate > dateTo) return false;

    if (filters.categories?.length && !filters.categories.includes(e.category)) {
      return false;
    }

    if (filters.distance === "neighborhood" && e.borough !== "Manhattan") return false;
    if (filters.distance === "borough" && !["Manhattan", "Brooklyn"].includes(e.borough)) return false;

    if (filters.price === "free" && e.price !== 0) return false;
    if (filters.price === "under-20" && e.price > 20) return false;
    if (filters.price === "under-50" && e.price > 50) return false;

    return true;
  });

  return filtered.slice(0, limit);
}

export function fetchLocalEventById(id: string): SiftEvent | null {
  return ALL_LOCAL.find((e) => e.id === id) ?? null;
}

export function fetchLocalAllUpcoming(
  limit = 500,
  categories?: EventCategory[]
): SiftEvent[] {
  const today = todayNYC();
  let filtered = ALL_LOCAL.filter((e) => (e.endDate ?? e.startDate) >= today);
  if (categories?.length) {
    filtered = filtered.filter((e) => categories.includes(e.category));
  }
  filtered.sort((a, b) => a.startDate.localeCompare(b.startDate));
  return filtered.slice(0, limit);
}

import { supabase } from "./supabase";
import type { SiftEvent, EventCategory } from "@/types/event";
import type { Filters } from "@/types/quiz";

// Frontend category → DB category
const CATEGORY_TO_DB: Partial<Record<EventCategory, string>> = {
  arts: "art",
  music: "live_music",
};

// DB category → frontend category
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

const VALID_BOROUGHS = [
  "Manhattan",
  "Brooklyn",
  "Queens",
  "Bronx",
  "Staten Island",
] as const;

function toBorough(b?: string | null): SiftEvent["borough"] {
  if (!b) return "Manhattan";
  const match = VALID_BOROUGHS.find(
    (v) => v.toLowerCase() === b.toLowerCase()
  );
  return (match ?? "Manhattan") as SiftEvent["borough"];
}

function formatTime(isoDate: string): string {
  if (!isoDate || !isoDate.includes("T")) return "";
  try {
    return new Date(isoDate).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "America/New_York",
    });
  } catch {
    return "";
  }
}

function formatPriceLabel(row: {
  is_free: boolean;
  price_min?: number | null;
  price_max?: number | null;
}): string {
  if (row.is_free || row.price_min === 0) return "Free";
  if (row.price_min != null && row.price_max != null) {
    if (row.price_min === row.price_max) return `$${row.price_min}`;
    return `$${row.price_min}–$${row.price_max}`;
  }
  if (row.price_min != null) return `From $${row.price_min}`;
  return "See tickets";
}

interface EventRow {
  id: string;
  title: string;
  category: string;
  image_url?: string | null;
  description?: string | null;
  venue_name?: string | null;
  address?: string | null;
  borough?: string | null;
  start_date: string;
  end_date?: string | null;
  price_min?: number | null;
  price_max?: number | null;
  is_free: boolean;
  ticket_url?: string | null;
  event_url?: string | null;
  on_sale_date?: string | null;
  tags?: string[] | null;
}

function mapRow(row: EventRow): SiftEvent {
  const startDate = (row.start_date as string).split("T")[0];
  const endDate = row.end_date
    ? (row.end_date as string).split("T")[0]
    : undefined;

  const now = new Date();
  const endOrStart = row.end_date
    ? new Date(row.end_date)
    : new Date(row.start_date);
  const daysLeft = Math.ceil(
    (endOrStart.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  return {
    id: row.id as string,
    title: row.title as string,
    category: (DB_TO_CATEGORY[row.category] ?? "popups") as EventCategory,
    imageUrl: row.image_url ?? undefined,
    description: row.description ?? "",
    location: row.venue_name ?? "",
    address: row.address ?? "",
    borough: toBorough(row.borough),
    startDate,
    endDate,
    time: formatTime(row.start_date),
    price: row.price_min ?? 0,
    priceLabel: formatPriceLabel(row),
    link: row.ticket_url ?? row.event_url ?? "",
    tags: row.tags ?? [],
    ticketUrl: row.ticket_url ?? undefined,
    eventUrl: row.event_url ?? undefined,
    onSaleDate: row.on_sale_date ?? undefined,
    endingSoon: daysLeft <= 7 && daysLeft > 0,
    daysLeft: daysLeft > 0 ? daysLeft : undefined,
  };
}

/**
 * Fetch events from Supabase with filtering.
 */
export async function fetchEvents(
  filters: Filters,
  limit = 100
): Promise<SiftEvent[]> {
  const now = new Date().toISOString();
  const dbCategories = filters.categories?.map((c) => CATEGORY_TO_DB[c] ?? c);
  const dateFrom = filters.dateFrom ?? now;
  const dateTo = filters.dateTo ? filters.dateTo + "T23:59:59Z" : null;

  if (!supabase) return [];

  let query = supabase
    .from("events")
    .select("*")
    .or(`start_date.gte.${dateFrom},end_date.gte.${dateFrom}`)
    .order("start_date", { ascending: true })
    .limit(limit);

  if (dateTo) query = query.lte("start_date", dateTo);
  if (dbCategories?.length) {
    const cats = dbCategories.join(",");
    query = query.or(`category.in.(${cats}),tags.ov.{${cats}}`);
  }
  if (filters.distance === "neighborhood") {
    query = query.eq("borough", "Manhattan");
  } else if (filters.distance === "borough") {
    query = query.in("borough", ["Manhattan", "Brooklyn"]);
  }
  if (filters.price === "free") {
    query = query.eq("is_free", true);
  } else if (filters.price === "under-20") {
    query = query.lte("price_min", 20);
  } else if (filters.price === "under-50") {
    query = query.lte("price_min", 50);
  }

  const { data, error } = await query;
  if (error) {
    return [];
  }

  return groupOccurrences((data ?? []).map(mapRow));
}

/**
 * Fetch a single event by ID from Supabase.
 */
export async function fetchEventById(
  id: string
): Promise<SiftEvent | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("id", id)
    .limit(1);

  if (error || !data || data.length === 0) {
    return null;
  }

  return mapRow(data[0]);
}

/**
 * Fetch all upcoming events (for recommendation engine).
 */
export async function fetchAllUpcoming(limit = 500): Promise<SiftEvent[]> {
  if (!supabase) return [];

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .or(`start_date.gte.${now},end_date.gte.${now}`)
    .order("start_date", { ascending: true })
    .limit(limit);

  if (error || !data) {
    return [];
  }

  return groupOccurrences(data.map(mapRow));
}

/**
 * Collapse same-title/venue events into one card with a dates array.
 */
function groupOccurrences(events: SiftEvent[]): SiftEvent[] {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 50);

  const groups = new Map<string, SiftEvent[]>();
  for (const e of events) {
    const key = `${norm(e.title)}::${norm(e.location)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }

  const result: SiftEvent[] = [];
  for (const group of groups.values()) {
    group.sort((a, b) => a.startDate.localeCompare(b.startDate));
    const primary = group[0];
    result.push({
      ...primary,
      dates: group.map((e) => ({
        startDate: e.startDate,
        time: e.time,
        link: e.link,
      })),
    });
  }
  return result;
}

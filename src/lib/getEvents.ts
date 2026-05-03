import { supabase } from "./supabase";
import { todayNYC, nowNYC } from "./time";
import type { SiftEvent, EventCategory, EventSession } from "@/types/event";
import type { Filters } from "@/types/quiz";
import VIBE_SUPPRESSED_IDS from "../../lib/ingest/vibe-suppressed-ids.json";
import {
  fetchLocalEvents,
  fetchLocalEventById,
  fetchLocalAllUpcoming,
  LOCAL_SEED_COUNT,
} from "./localEvents";

// Dev flag: serve events from local JSON seed instead of Supabase.
// Set EXPO_PUBLIC_USE_LOCAL_SEED=true to enable (see lib/ai-collect-data/output/ai_new_events.json).
const USE_LOCAL_SEED = process.env.EXPO_PUBLIC_USE_LOCAL_SEED === "true";
if (USE_LOCAL_SEED) {
  console.log(`[getEvents] Using local seed — ${LOCAL_SEED_COUNT} events`);
}

// Legacy sources still in DB but no longer ingested — exclude from feed.
const EXCLUDED_SOURCES = ['nyc_tourism', 'nyc_gov', 'yelp', 'meetup', 'nyc_parks'];

// Only show events in NYC boroughs — hard filter at the DB level.
const NYC_BOROUGHS = ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island'];

// Events suppressed by Claude vibe check — client-side filter until DB migration runs.
const VIBE_SUPPRESSED = new Set<string>(VIBE_SUPPRESSED_IDS);

const USE_TEST = process.env.EXPO_PUBLIC_USE_TEST_DATA === "true";
const EVENTS_TABLE   = USE_TEST ? "test_events"         : "events";
const SESSIONS_TABLE = USE_TEST ? "test_event_sessions" : "event_sessions";

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
  sports: "sports",
};

const VALID_BOROUGHS = [
  "Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island",
] as const;

function toBorough(b?: string | null): SiftEvent["borough"] {
  if (!b) return "Manhattan";
  const match = VALID_BOROUGHS.find((v) => v.toLowerCase() === b.toLowerCase());
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

/** Build price label from aggregate or session-level price data. */
function formatPriceLabel(
  isFreeProp: boolean,
  priceMin?: number | null,
  priceMax?: number | null,
  sessions?: EventSession[]
): string {
  if (sessions && sessions.length > 1) {
    const mins = sessions.map((s) => s.priceMin).filter((p): p is number => p != null);
    const maxs = sessions.map((s) => s.priceMax ?? s.priceMin).filter((p): p is number => p != null);
    if (mins.length > 0) {
      const low = Math.min(...mins);
      const high = Math.max(...maxs);
      if (low === 0) return high === 0 ? "Free" : `Free–$${high}`;
      if (low === high) return `$${low}`;
      return `$${low}–$${high}`;
    }
  }
  if (isFreeProp || priceMin === 0) return "Free";
  if (priceMin != null && priceMax != null) {
    if (priceMin === priceMax) return `$${priceMin}`;
    return `$${priceMin}–$${priceMax}`;
  }
  if (priceMin != null) return `From $${priceMin}`;
  return "See tickets";
}

interface EventRow {
  id: string;
  title: string;
  category: string;
  image_url?: string | null;
  description?: string | null;
  hook_text?: string | null;
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
  vibe_score?: number | null;
  social_signal?: number | null;
  publication_status?: string | null;
}

/** Map a DB row + its matched sessions into a frontend SiftEvent. */
function mapRowWithSessions(row: EventRow, matchedSessions: any[]): SiftEvent {
  const primaryLink = row.ticket_url ?? row.event_url ?? "";

  // Build frontend sessions from matched DB sessions
  const sessions: EventSession[] = matchedSessions
    .map((s): EventSession => ({
      startDate: s.date,
      time: s.time || undefined,  // treat '' same as null
      location: s.venue_name ?? undefined,
      address: s.address ?? undefined,
      borough: s.borough ?? undefined,
      priceMin: s.price_min ?? undefined,
      priceMax: s.price_max ?? undefined,
      link: primaryLink,
    }))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  const firstSession = sessions[0];
  const lastSession = sessions[sessions.length - 1];

  const startDate = (row.start_date as string).split("T")[0];
  const endDate = sessions.length > 1
    ? lastSession.startDate
    : (row.end_date ? (row.end_date as string).split("T")[0] : undefined);

  const uniqueLocations = new Set(
    sessions.map((s) => (s.address ?? s.location ?? "").toLowerCase().replace(/\s+/g, ""))
      .filter(Boolean)
  );
  const locationsVary = uniqueLocations.size > 1;

  const primaryLocation = locationsVary
    ? "Various locations"
    : (firstSession?.location ?? row.venue_name ?? "");
  const primaryAddress = firstSession?.address ?? row.address ?? "";
  const primaryBorough = toBorough(firstSession?.borough ?? row.borough);

  const now = nowNYC();
  const lastDate = new Date((endDate ?? startDate) + "T12:00:00Z");
  const daysLeft = Math.ceil((lastDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  const allPriceMins = sessions.map((s) => s.priceMin).filter((p): p is number => p != null);
  const allPriceMaxs = sessions.map((s) => s.priceMax ?? s.priceMin).filter((p): p is number => p != null);
  const aggregatePriceMin = allPriceMins.length > 0 ? Math.min(...allPriceMins) : (row.price_min ?? 0);
  const aggregatePriceMax = allPriceMaxs.length > 0 ? Math.max(...allPriceMaxs) : (row.price_max ?? undefined);

  const uniqueTimes = new Set(sessions.map((s) => s.time ?? "").filter(Boolean));
  const primaryTime = uniqueTimes.size > 1
    ? "Various times"
    : firstSession?.time ?? formatTime(row.start_date);

  return {
    id: row.id as string,
    title: row.title as string,
    category: (DB_TO_CATEGORY[row.category] ?? "popups") as EventCategory,
    imageUrl: row.image_url ?? undefined,
    description: row.description ?? "",
    location: primaryLocation,
    address: primaryAddress,
    borough: primaryBorough,
    startDate,
    endDate,
    time: primaryTime,
    price: aggregatePriceMin,
    priceLabel: formatPriceLabel(row.is_free, row.price_min, row.price_max, sessions),
    link: primaryLink,
    tags: row.tags ?? [],
    ticketUrl: row.ticket_url ?? undefined,
    eventUrl: row.event_url ?? undefined,
    onSaleDate: row.on_sale_date ?? undefined,
    endingSoon: daysLeft <= 7 && daysLeft > 0,
    daysLeft: daysLeft > 0 ? daysLeft : undefined,
    sessions: sessions.length > 0 ? sessions : undefined,
    locationsVary,
    vibeScore: row.vibe_score ?? undefined,
    socialSignal: row.social_signal ?? undefined,
    hookText: row.hook_text ?? undefined,
    publicationStatus: row.publication_status ?? undefined,
  };
}

/**
 * Composite ranking score: vibe * 0.50 + timeliness * 0.30 + completeness * 0.20
 * categoryWeight (from taste profile) is applied as a multiplier.
 */
/** Taste context for multi-dimensional scoring */
export interface TasteContext {
  categoryWeight: number;
  tagWeights: Record<string, number>;
  boroughWeights: Record<string, number>;
  pricePreference: { ceiling: number | null; freeBoost: number };
  interactionCount: number;
}

const DEFAULT_TASTE: TasteContext = {
  categoryWeight: 1.0,
  tagWeights: {},
  boroughWeights: {},
  pricePreference: { ceiling: null, freeBoost: 0 },
  interactionCount: 0,
};

/**
 * Compute event score for feed ranking.
 *
 * Formula: quality × 0.25 + taste × 0.40 + timing × 0.20 + completeness × 0.10 + novelty × 0.05
 * Taste: category 35% + tags 35% + borough 10% + price 10% + freeBoost 10%
 *
 * Cold start: blends personalized score with quality-based score based on interaction count.
 */
export function computeEventScore(
  event: SiftEvent,
  categoryWeight = 1.0,
  impressionPenalty = 1.0,
  taste: TasteContext = DEFAULT_TASTE
): number {
  // Quality: vibe 1–10 → 0–1, unchecked = 0.5 neutral
  const quality = event.vibeScore != null ? (event.vibeScore - 1) / 9 : 0.5;

  // ── Taste score (multi-dimensional) ──
  const categoryAffinity = Math.min(categoryWeight / 2.0, 1.0);

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

  // Timing: peak at 1–3 days, decays beyond 14
  const daysUntil = event.daysLeft ?? 30;
  const timing =
    daysUntil <= 0  ? 0
    : daysUntil <= 3  ? 1.0
    : daysUntil <= 7  ? 0.8
    : daysUntil <= 14 ? 0.5
    : daysUntil <= 30 ? 0.3
    : 0.1;

  // Completeness: rewards rich event data
  const completeness =
    (event.imageUrl ? 0.4 : 0) +
    (event.description && event.description.length > 20 ? 0.3 : 0) +
    (event.location ? 0.2 : 0) +
    (event.priceLabel && event.priceLabel !== "See tickets" ? 0.1 : 0);

  const novelty = impressionPenalty;

  const personalizedScore =
    quality * 0.25 + tasteScore * 0.40 + timing * 0.20 + completeness * 0.10 + novelty * 0.05;

  // Cold start blending: until ~20 interactions, lean more on quality + timing
  // If caller passed a non-default categoryWeight, they have real preference data —
  // ensure confidence is at least 0.5 so category weight still influences scoring
  const rawConfidence = Math.min(1, taste.interactionCount / 20);
  const confidence = (categoryWeight !== 1.0 && rawConfidence < 0.5) ? 0.5 : rawConfidence;
  const coldStartScore = quality * 0.45 + timing * 0.35 + completeness * 0.15 + novelty * 0.05;

  const finalScore = confidence * personalizedScore + (1 - confidence) * coldStartScore;

  // Attach explanation for debugging / future user-facing labels
  (event as any).__scoreExplanation = {
    finalScore: +finalScore.toFixed(3),
    confidence: +confidence.toFixed(2),
    components: {
      quality: +(quality * 0.25).toFixed(3),
      taste: +(tasteScore * 0.40).toFixed(3),
      timing: +(timing * 0.20).toFixed(3),
      completeness: +(completeness * 0.10).toFixed(3),
      novelty: +(novelty * 0.05).toFixed(3),
    },
    tasteBreakdown: {
      category: +(categoryAffinity * 0.35).toFixed(3),
      tags: +(tagAffinity * 0.35).toFixed(3),
      borough: +(boroughAffinity * 0.15).toFixed(3),
      price: +(priceAffinity * 0.15).toFixed(3),
    },
  };

  return finalScore;
}

/**
 * Fetch events from Supabase with session-level filtering.
 * Filters are applied to event_sessions; results are grouped by event.
 */
export async function fetchEvents(
  filters: Filters,
  limit = 100
): Promise<SiftEvent[]> {
  if (USE_LOCAL_SEED) return fetchLocalEvents(filters, limit);
  if (!supabase) return [];

  const today = todayNYC();
  const dbCategories = filters.categories?.map((c) => CATEGORY_TO_DB[c] ?? c);
  const dateFrom = filters.dateFrom ?? today;
  const dateTo = filters.dateTo ?? null;

  // ── Step 1: Find matching event_ids via session-level filters ──
  let sessionQuery = supabase
    .from(SESSIONS_TABLE)
    .select("event_id")
    .gte("date", dateFrom);

  if (dateTo) sessionQuery = sessionQuery.lte("date", dateTo);
  if (filters.distance === "neighborhood") {
    sessionQuery = sessionQuery.eq("borough", "Manhattan");
  } else if (filters.distance === "borough") {
    sessionQuery = sessionQuery.in("borough", ["Manhattan", "Brooklyn"]);
  }
  if (filters.price === "free") {
    sessionQuery = sessionQuery.eq("price_min", 0);
  } else if (filters.price === "under-20") {
    sessionQuery = sessionQuery.lte("price_min", 20);
  } else if (filters.price === "under-50") {
    sessionQuery = sessionQuery.lte("price_min", 50);
  }

  const { data: sessionMatches, error: sessErr } = await sessionQuery.limit(2000);
  if (sessErr || !sessionMatches) {
    console.error("[getEvents] session filter error:", sessErr?.message);
    return [];
  }

  const matchedEventIds = [...new Set(sessionMatches.map((s: any) => s.event_id as string))];
  if (matchedEventIds.length === 0) return [];

  // ── Step 2: Fetch those events (with quality filters) ──
  let eventQuery = supabase
    .from(EVENTS_TABLE)
    .select("*")
    .in("id", matchedEventIds.slice(0, limit))
    .neq("is_suppressed", true)
    .eq("publication_status", "public")
    .not("source", "in", `(${EXCLUDED_SOURCES.join(",")})`)
    .or("vibe_score.gte.5,vibe_score.is.null");

  if (dbCategories?.length) {
    const cats = dbCategories.join(",");
    eventQuery = eventQuery.or(`category.in.(${cats}),tags.ov.{${cats}}`);
  }

  const { data: events, error: evErr } = await eventQuery;
  if (evErr || !events) {
    console.error("[getEvents] events fetch error:", evErr?.message);
    return [];
  }

  // ── Step 3: Fetch matched sessions for these events ──
  const finalEventIds = events.map((e: any) => e.id as string);
  let matchedSessionsQuery = supabase
    .from(SESSIONS_TABLE)
    .select("*")
    .in("event_id", finalEventIds)
    .gte("date", dateFrom)
    .order("date", { ascending: true });

  if (dateTo) matchedSessionsQuery = matchedSessionsQuery.lte("date", dateTo);
  if (filters.distance === "neighborhood") {
    matchedSessionsQuery = matchedSessionsQuery.eq("borough", "Manhattan");
  } else if (filters.distance === "borough") {
    matchedSessionsQuery = matchedSessionsQuery.in("borough", ["Manhattan", "Brooklyn"]);
  }
  if (filters.price === "under-20") {
    matchedSessionsQuery = matchedSessionsQuery.lte("price_min", 20);
  } else if (filters.price === "under-50") {
    matchedSessionsQuery = matchedSessionsQuery.lte("price_min", 50);
  }

  const { data: matchedSessions } = await matchedSessionsQuery;

  // Group sessions by event_id
  const sessionsByEvent = new Map<string, any[]>();
  for (const s of matchedSessions ?? []) {
    if (!sessionsByEvent.has(s.event_id)) sessionsByEvent.set(s.event_id, []);
    sessionsByEvent.get(s.event_id)!.push(s);
  }

  // ── Step 4: Also fetch ongoing range events (started before dateFrom but haven't ended) ──
  let ongoingQuery = supabase
    .from(EVENTS_TABLE)
    .select("*")
    .lt("start_date", dateFrom)
    .gte("end_date", dateFrom)
    .neq("is_suppressed", true)
    .eq("publication_status", "public")
    .not("source", "in", `(${EXCLUDED_SOURCES.join(",")})`)
    .or("vibe_score.gte.5,vibe_score.is.null");

  if (dbCategories?.length) {
    const cats = dbCategories.join(",");
    ongoingQuery = ongoingQuery.or(`category.in.(${cats}),tags.ov.{${cats}}`);
  }
  if (dateTo) ongoingQuery = ongoingQuery.lte("start_date", dateTo);

  const { data: ongoingEvents } = await ongoingQuery;

  // Merge: dedup by id (session-based events take priority)
  const sessionEventIds = new Set(events.map((e: any) => e.id));
  const extraEvents = (ongoingEvents ?? []).filter((e: any) => !sessionEventIds.has(e.id));

  const allEvents = [...events, ...extraEvents];

  return allEvents
    .filter((row: any) => !VIBE_SUPPRESSED.has(row.id))
    .map((row: any) => mapRowWithSessions(row, sessionsByEvent.get(row.id) ?? []));
}

/**
 * Fetch a single event by ID with all its sessions.
 * Sessions are sorted by relevance (filter context) then date ascending.
 */
export async function fetchEventById(
  id: string,
  filters?: Partial<Filters>
): Promise<SiftEvent | null> {
  if (USE_LOCAL_SEED) return fetchLocalEventById(id);
  if (!supabase) return null;

  const { data, error } = await supabase
    .from(EVENTS_TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[getEvents] fetchEventById error:", error.message);
    return null;
  }

  if (!data) return null;

  const { data: sessions } = await supabase
    .from(SESSIONS_TABLE)
    .select("*")
    .eq("event_id", id)
    .gte("date", todayNYC())
    .order("date", { ascending: true });

  // If filter context provided, sort matching sessions first
  let orderedSessions = sessions ?? [];
  if (filters && orderedSessions.length > 1) {
    const isMatch = (s: any) => {
      if (filters.distance === "neighborhood" && s.borough !== "Manhattan") return false;
      if (filters.distance === "borough" && !["Manhattan", "Brooklyn"].includes(s.borough)) return false;
      if (filters.price === "free" && s.price_min !== 0) return false;
      if (filters.price === "under-20" && s.price_min > 20) return false;
      if (filters.price === "under-50" && s.price_min > 50) return false;
      return true;
    };
    orderedSessions = [
      ...orderedSessions.filter(isMatch),
      ...orderedSessions.filter((s) => !isMatch(s)),
    ];
  }

  return mapRowWithSessions(data, orderedSessions);
}

/**
 * Fetch all upcoming events for recommendation engine.
 * Pre-sorted by composite score (vibe + timeliness + completeness) × taste weight.
 */
export async function fetchAllUpcoming(
  limit = 500,
  categories?: EventCategory[],
  categoryWeights?: Partial<Record<EventCategory, number>>
): Promise<SiftEvent[]> {
  if (USE_LOCAL_SEED) {
    const mapped = fetchLocalAllUpcoming(limit, categories);
    if (categoryWeights && Object.keys(categoryWeights).length > 0) {
      mapped.sort((a: SiftEvent, b: SiftEvent) => {
        const wa = categoryWeights[a.category] ?? 1.0;
        const wb = categoryWeights[b.category] ?? 1.0;
        return computeEventScore(b, wb) - computeEventScore(a, wa);
      });
    }
    return mapped;
  }
  if (!supabase) return [];

  const today = todayNYC();

  let eventQuery = supabase
    .from(EVENTS_TABLE)
    .select("*")
    .or(`end_date.gte.${today},start_date.gte.${today}`)
    .neq("is_suppressed", true)
    .eq("publication_status", "public")
    .not("source", "in", `(${EXCLUDED_SOURCES.join(",")})`)
    .or("vibe_score.gte.5,vibe_score.is.null")
    .order("start_date", { ascending: true })
    .limit(limit);

  if (categories?.length) {
    const dbCats = categories.map((c) => CATEGORY_TO_DB[c] ?? c);
    eventQuery = eventQuery.in("category", dbCats);
  }

  const { data: events, error } = await eventQuery;
  if (error || !events) {
    console.error("[getEvents] fetchAllUpcoming error:", error?.message);
    return [];
  }

  const eventIds = events.map((e: any) => e.id as string);

  const { data: sessions } = await supabase
    .from(SESSIONS_TABLE)
    .select("*")
    .in("event_id", eventIds)
    .gte("date", today)
    .order("date", { ascending: true });

  const sessionsByEvent = new Map<string, any[]>();
  for (const s of sessions ?? []) {
    if (!sessionsByEvent.has(s.event_id)) sessionsByEvent.set(s.event_id, []);
    sessionsByEvent.get(s.event_id)!.push(s);
  }

  const mapped = events
    .filter((row: any) => !VIBE_SUPPRESSED.has(row.id))
    .map((row: any) => mapRowWithSessions(row, sessionsByEvent.get(row.id) ?? []));

  // Sort by composite score, applying taste profile category weights
  if (categoryWeights && Object.keys(categoryWeights).length > 0) {
    mapped.sort((a: SiftEvent, b: SiftEvent) => {
      const wa = categoryWeights[a.category] ?? 1.0;
      const wb = categoryWeights[b.category] ?? 1.0;
      return computeEventScore(b, wb) - computeEventScore(a, wa);
    });
  }

  return mapped;
}

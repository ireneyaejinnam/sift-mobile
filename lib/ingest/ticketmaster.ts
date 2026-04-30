const API_KEY = process.env.TICKETMASTER_API_KEY!;
const BASE_URL = 'https://app.ticketmaster.com/discovery/v2/events.json';

/**
 * Lookup mode only — no longer used as a daily fetcher.
 * Called from enrich-events.ts to find ticket URLs for AI-discovered events.
 *
 * The AI discovery pipeline (collect-names.ts) already scrapes Ticketmaster
 * as one of its 18+ sources, so a separate daily ingest is redundant.
 */

export interface TicketmasterLookup {
  ticket_url: string | null;
  price_min: number | null;
  price_max: number | null;
  image_url: string | null;
}

/**
 * Search Ticketmaster for a specific event by name.
 * Returns ticket URL, price range, and image if found.
 */
export async function lookupTicketmaster(eventName: string): Promise<TicketmasterLookup | null> {
  if (!API_KEY) return null;

  try {
    const params = new URLSearchParams({
      apikey: API_KEY,
      keyword: eventName,
      city: 'New York',
      stateCode: 'NY',
      size: '3',
      sort: 'relevance,desc',
    });

    const res = await fetch(`${BASE_URL}?${params}`);
    if (!res.ok) return null;

    const json = await res.json();
    const events = json._embedded?.events ?? [];
    if (events.length === 0) return null;

    const ev = events[0];
    return {
      ticket_url: ev.url ?? null,
      price_min: ev.priceRanges?.[0]?.min ?? null,
      price_max: ev.priceRanges?.[0]?.max ?? null,
      image_url: ev.images?.[0]?.url ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * @deprecated No longer runs as a daily fetcher. Use the AI discovery pipeline instead.
 * Kept for backwards compatibility with any code that imports ingestTicketmaster.
 */
export async function ingestTicketmaster(): Promise<void> {
  console.log('[Ticketmaster] Skipped — lookup mode only. Use AI discovery pipeline for event collection.');
}

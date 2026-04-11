import { SiftEvent } from './schema';
import { SIFT_CATEGORIES } from './config';

// NYC ZIP code prefixes
const NYC_ZIP_RE = /\b1(?:00|01|02|03|04|10|11|12|13|14|16)\d{2}\b/;

// Non-NYC state/city indicators that should never appear in a valid NYC address
const NON_NYC_RE = /\b(?:washington\s*,?\s*d\.?c\.?|los angeles|chicago|boston|miami|seattle|houston|dallas|philadelphia|atlanta|denver|phoenix|portland|san francisco|las vegas|austin|nashville|new orleans)\b/i;

/**
 * Returns true if the address is plausibly in NYC.
 * An event with no address at all passes (we can't reject what we don't know).
 */
export function isNYCAddress(address: string | undefined): boolean {
  if (!address) return true; // no address → don't reject
  const a = address.toLowerCase();
  // Explicit non-NYC cities → reject immediately
  if (NON_NYC_RE.test(a)) return false;
  // Non-NY US states → reject (e.g. ", DC", ", CA", ", TX")
  // Allow "NY", "New York" — those are fine
  if (/,\s*[A-Z]{2}\s*\d{5}/.test(address)) {
    // Has a state code — only accept NY
    const stateMatch = address.match(/,\s*([A-Z]{2})\s*\d{5}/);
    if (stateMatch && stateMatch[1] !== 'NY') return false;
  }
  // NYC ZIP code → accept
  if (NYC_ZIP_RE.test(address)) return true;
  // "New York" or "NY" in address → accept
  if (/\bnew york\b|\b,\s*ny\b/i.test(a)) return true;
  // Known NYC borough names → accept
  if (/\b(?:manhattan|brooklyn|queens|bronx|staten island)\b/i.test(a)) return true;
  // Unknown address format → allow through (better to keep than miss real NYC events)
  return true;
}

export function normalizeEvent(raw: Partial<SiftEvent>): SiftEvent | null {
  if (!raw.title || !raw.start_date || !raw.category || !raw.source || !raw.source_id) {
    return null;
  }

  if (!SIFT_CATEGORIES.includes(raw.category as any)) {
    console.warn(`Unknown category "${raw.category}" for event "${raw.title}", skipping`);
    return null;
  }

  if (!isNYCAddress(raw.address)) {
    console.warn(`[Normalize] Non-NYC address, skipping: "${raw.title}" @ "${raw.address}"`);
    return null;
  }

  return {
    source: raw.source,
    source_id: raw.source_id,
    title: raw.title.trim(),
    description: raw.description?.slice(0, 1000)?.trim(),
    category: raw.category,
    start_date: raw.start_date,
    end_date: raw.end_date ?? undefined,
    sessions: raw.sessions,
    venue_name: raw.venue_name?.trim(),
    address: raw.address?.trim(),
    neighborhood: raw.neighborhood,
    borough: raw.borough,
    latitude: raw.latitude,
    longitude: raw.longitude,
    price_min: raw.price_min ?? 0,
    price_max: raw.price_max,
    is_free: raw.is_free ?? (raw.price_min === 0 && (!raw.price_max || raw.price_max === 0)),
    currency: raw.currency ?? 'USD',
    ticket_url: raw.ticket_url,
    event_url: raw.event_url,
    image_url: raw.image_url,
    on_sale_date: raw.on_sale_date,
    tags: raw.tags ?? [],
    expires_at: raw.expires_at ?? raw.end_date ?? raw.start_date,
  };
}

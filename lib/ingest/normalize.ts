import { SiftEvent } from './schema';
import { SIFT_CATEGORIES } from './config';

export function normalizeEvent(raw: Partial<SiftEvent>): SiftEvent | null {
  if (!raw.title || !raw.start_date || !raw.category || !raw.source || !raw.source_id) {
    return null;
  }

  if (!SIFT_CATEGORIES.includes(raw.category as any)) {
    console.warn(`Unknown category "${raw.category}" for event "${raw.title}", skipping`);
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
    available_dates: raw.available_dates,
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

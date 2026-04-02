export interface SiftEvent {
  source: string;
  source_id: string;
  title: string;
  description?: string;
  category: string;
  start_date: string; // ISO8601
  end_date?: string;
  available_dates?: string[]; // for multi-day/recurring
  venue_name?: string;
  address?: string;
  neighborhood?: string;
  borough?: string;
  latitude?: number;
  longitude?: number;
  price_min?: number;
  price_max?: number;
  is_free: boolean;
  currency?: string;
  ticket_url?: string;
  event_url?: string;
  image_url?: string;
  on_sale_date?: string;
  tags?: string[];
  expires_at?: string;
}

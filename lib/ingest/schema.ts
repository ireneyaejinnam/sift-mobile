export interface EventSession {
  date: string;         // YYYY-MM-DD
  time?: string;        // e.g. "7:00 PM"
  venue_name?: string;
  address?: string;
  borough?: string;
  price_min?: number;
  price_max?: number;
}

export interface SiftEvent {
  source: string;
  source_id: string;
  title: string;
  description?: string;
  category: string;
  // Aggregate fields — computed from sessions, kept on events for display + quick filtering
  start_date: string;   // earliest session date (ISO8601)
  end_date?: string;    // latest session date
  venue_name?: string;  // primary session venue
  address?: string;
  neighborhood?: string;
  borough?: string;
  latitude?: number;
  longitude?: number;
  price_min?: number;   // min across all sessions
  price_max?: number;   // max across all sessions
  is_free: boolean;
  currency?: string;
  ticket_url?: string;
  event_url?: string;
  image_url?: string;
  on_sale_date?: string;
  tags?: string[];
  expires_at?: string;
  // Sessions — normalized into event_sessions table on upsert
  sessions?: EventSession[];
}

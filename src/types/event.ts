export type EventCategory =
  | "arts"
  | "music"
  | "comedy"
  | "food"
  | "outdoors"
  | "nightlife"
  | "fitness"
  | "theater"
  | "workshops"
  | "popups";

export type EventDistance = "neighborhood" | "borough" | "anywhere";

export type PriceRange = "free" | "under-20" | "under-50" | "any";

export interface EventSession {
  startDate: string;    // YYYY-MM-DD
  time?: string;        // e.g. "7:00 PM"
  location?: string;    // venue_name for this session
  address?: string;
  borough?: string;
  priceMin?: number;
  priceMax?: number;
  link?: string;        // ticket/event URL for this session
}

export interface SiftEvent {
  id: string;
  title: string;
  category: EventCategory;
  imageUrl?: string;
  description: string;
  location: string;      // primary venue (first session, or "Multiple venues")
  address: string;       // primary address
  borough: "Manhattan" | "Brooklyn" | "Queens" | "Bronx" | "Staten Island";
  startDate: string;     // earliest upcoming session date
  endDate?: string;      // latest session date (undefined = single session)
  time: string;          // primary session time
  price: number;         // lowest price across sessions (for budget filter compat)
  priceLabel: string;    // display string e.g. "$25–$45" or "Free"
  link: string;
  matchReason?: string;
  endingSoon?: boolean;
  daysLeft?: number;
  tags: string[];
  ticketUrl?: string;
  eventUrl?: string;
  onSaleDate?: string;
  sessions?: EventSession[];    // all upcoming sessions; undefined = treat as single session
  locationsVary?: boolean;      // true if sessions have different venues/addresses
  vibeScore?: number;           // 1–10 from Claude vibe check, undefined = not yet checked
}

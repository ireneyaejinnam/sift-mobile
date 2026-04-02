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

export interface SiftEvent {
  id: string;
  title: string;
  category: EventCategory;
  imageUrl?: string;
  description: string;
  location: string;
  address: string;
  borough: "Manhattan" | "Brooklyn" | "Queens" | "Bronx" | "Staten Island";
  startDate: string;
  endDate?: string;
  time: string;
  price: number;
  priceLabel: string;
  link: string;
  matchReason?: string;
  endingSoon?: boolean;
  daysLeft?: number;
  tags: string[];
  ticketUrl?: string;
  eventUrl?: string;
  onSaleDate?: string;
  dates?: { startDate: string; time: string; link: string }[];
}

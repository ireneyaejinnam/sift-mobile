import type {
  BoroughName,
  EventCategory,
  EventDistance,
  PriceRange,
} from "@/types/event";

export type Step =
  | "welcome"
  | "category"
  | "date"
  | "distance"
  | "results";

export type Vibe = "hidden_gems" | "popular" | "surprise_me";

export interface Filters {
  categories?: EventCategory[];
  dateFrom?: string;
  dateTo?: string;
  price?: PriceRange;
  distance?: EventDistance;
  boroughs?: BoroughName[];
  vibe?: Vibe;
}

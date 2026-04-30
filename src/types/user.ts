export interface UserProfile {
  interests: string[];
  borough: string;
  neighborhood: string;
  travelRange: string;
  vibe: string;
  budget: string;
  freeDays: string[];
  freeTime: string[];
}

export interface SavedEvent {
  eventId: string;
  listName: string;
  savedAt: string;
  eventTitle?: string;
  eventStartDate?: string;
  eventEndDate?: string;
}

export interface GoingEvent {
  eventId: string;
  eventTitle: string;
  eventDate: string;
  eventEndDate?: string;
  markedAt: string;
  committed?: boolean;
  committedAt?: string;
}

export interface SharedWithYouEvent {
  eventId: string;
  sharedAt: string;
}

export const DEFAULT_LISTS = [
  "Favorites",
] as const;

export interface SiftStorage {
  isLoggedIn: boolean;
  userEmail: string;
  userDisplayName?: string;
  userProfile?: UserProfile;
  savedEvents: SavedEvent[];
  goingEvents: GoingEvent[];
  sharedWithYou: SharedWithYouEvent[];
  customLists: string[];
  createdAt?: string;
}

export const STORAGE_KEY = "sift_mvp";

export const initialStorage: SiftStorage = {
  isLoggedIn: false,
  userEmail: "",
  savedEvents: [],
  goingEvents: [],
  sharedWithYou: [],
  customLists: [],
};

import type { SiftEvent } from "@/types/event";

// All event data is sourced from Supabase.
// Configure the table via EXPO_PUBLIC_EVENTS_SOURCE in .env
// e.g. EXPO_PUBLIC_EVENTS_SOURCE=nycforfree → queries nycforfree_events + nycforfree_event_sessions
export const events: SiftEvent[] = [];

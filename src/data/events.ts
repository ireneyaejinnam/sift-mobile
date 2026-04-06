import type { SiftEvent } from "@/types/event";

// ── Fallback event data ─────────────────────────────────────────────────────
// Empty array — all real events come from Supabase.
// This file exists so imports don't break when Supabase is unreachable.
// The app will show an empty state instead of stale demo data.

export const events: SiftEvent[] = [];

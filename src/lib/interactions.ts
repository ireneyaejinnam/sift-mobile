/**
 * interactions.ts
 *
 * Client for the user_event_interactions table.
 * Tracks impressions, skips, saves, going, shares per user per event.
 * Handles batch impression flushing and permanent hide logic.
 */

import { supabase } from "@/lib/supabase";

export interface EventInteraction {
  event_id: string;
  impression_count: number;
  skip_count: number;
  save_count: number;
  going_count: number;
  share_count: number;
  permanently_hidden: boolean;
  last_seen_at: string | null;
  last_action_at: string | null;
}

// ── Session-level impression buffer ──────────────────────────────
// Batches impression writes to avoid a network call per card render.
// Flushed every FLUSH_INTERVAL impressions or on explicit flush.
const FLUSH_INTERVAL = 10;
const impressionBuffer = new Map<string, number>(); // event_id → count this session
let userId: string | null = null;
let isAuthenticated = false; // true only for logged-in users (not device-id guests)

export function setInteractionsUserId(id: string | null, authenticated = false) {
  // Clear stale guest impressions when identity changes
  if (id !== userId) impressionBuffer.clear();
  userId = id;
  isAuthenticated = authenticated;
}

/** Returns true if this user has server-side interaction storage */
function hasServerAccess(): boolean {
  return !!supabase && !!userId && isAuthenticated;
}

/** Get supabase client — only call after hasServerAccess() check */
function db() { return supabase!; }

export function recordImpression(eventId: string) {
  if (!isAuthenticated) return; // guest impressions stay local only
  impressionBuffer.set(eventId, (impressionBuffer.get(eventId) ?? 0) + 1);
  if (impressionBuffer.size >= FLUSH_INTERVAL) {
    void flushImpressions();
  }
}

export async function flushImpressions(): Promise<void> {
  if (!hasServerAccess() || impressionBuffer.size === 0) return;
  const entries = [...impressionBuffer.entries()];
  impressionBuffer.clear();

  const now = new Date().toISOString();
  for (const [eventId, count] of entries) {
    // Fetch existing, then upsert with incremented count
    const { data: existing } = await db()
      .from("user_event_interactions")
      .select("impression_count")
      .eq("user_id", userId)
      .eq("event_id", eventId)
      .maybeSingle();

    const newCount = (existing?.impression_count ?? 0) + count;
    await db()
      .from("user_event_interactions")
      .upsert(
        {
          user_id: userId,
          event_id: eventId,
          impression_count: newCount,
          last_seen_at: now,
        },
        { onConflict: "user_id,event_id" }
      );
  }
}

// ── Action recording ─────────────────────────────────────────────

async function upsertAction(
  eventId: string,
  field: "skip_count" | "save_count" | "going_count" | "share_count",
  extraFields?: Record<string, any>
): Promise<{ permanentlyHidden: boolean }> {
  if (!hasServerAccess()) return { permanentlyHidden: false };

  const now = new Date().toISOString();

  // Fetch current state
  const { data: existing } = await db()
    .from("user_event_interactions")
    .select("skip_count, save_count, going_count, share_count, permanently_hidden")
    .eq("user_id", userId)
    .eq("event_id", eventId)
    .maybeSingle();

  const currentCount = (existing?.[field] ?? 0) + 1;
  const shouldHide = field === "skip_count" && currentCount >= 3;

  const row: Record<string, any> = {
    user_id: userId,
    event_id: eventId,
    [field]: currentCount,
    last_action_at: now,
    ...extraFields,
  };

  if (shouldHide) {
    row.permanently_hidden = true;
  }

  await db()
    .from("user_event_interactions")
    .upsert(row, { onConflict: "user_id,event_id" });

  return { permanentlyHidden: shouldHide || (existing?.permanently_hidden ?? false) };
}

export async function recordSkip(eventId: string): Promise<boolean> {
  const { permanentlyHidden } = await upsertAction(eventId, "skip_count");
  return permanentlyHidden;
}

export async function undoSkip(eventId: string): Promise<void> {
  if (!hasServerAccess()) return;
  const { data: existing } = await db()
    .from("user_event_interactions")
    .select("skip_count")
    .eq("user_id", userId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (!existing || existing.skip_count <= 0) return;
  await db()
    .from("user_event_interactions")
    .update({
      skip_count: existing.skip_count - 1,
      permanently_hidden: false,
      last_action_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("event_id", eventId);
}

export async function recordSave(eventId: string): Promise<void> {
  await upsertAction(eventId, "save_count");
}

export async function recordGoing(eventId: string): Promise<void> {
  await upsertAction(eventId, "going_count");
}

export async function recordShare(eventId: string): Promise<void> {
  await upsertAction(eventId, "share_count");
}

export async function hideEventPermanently(eventId: string): Promise<void> {
  if (!hasServerAccess()) return;
  await db()
    .from("user_event_interactions")
    .upsert(
      {
        user_id: userId,
        event_id: eventId,
        permanently_hidden: true,
        last_action_at: new Date().toISOString(),
      },
      { onConflict: "user_id,event_id" }
    );
}

// ── Queries ──────────────────────────────────────────────────────

export async function fetchHiddenEventIds(): Promise<Set<string>> {
  if (!hasServerAccess()) return new Set();
  const { data } = await db()
    .from("user_event_interactions")
    .select("event_id")
    .eq("user_id", userId)
    .eq("permanently_hidden", true);
  return new Set((data ?? []).map((r: any) => r.event_id));
}

export async function fetchInteractionsMap(): Promise<Map<string, EventInteraction>> {
  if (!hasServerAccess()) return new Map();
  const { data } = await db()
    .from("user_event_interactions")
    .select("event_id, impression_count, skip_count, save_count, going_count, share_count, permanently_hidden, last_seen_at, last_action_at")
    .eq("user_id", userId);

  const map = new Map<string, EventInteraction>();
  for (const row of data ?? []) {
    map.set(row.event_id, row as EventInteraction);
  }
  return map;
}

// ── Migration from AsyncStorage dismissedHistory ─────────────────

export async function migrateFromDismissedHistory(
  dismissedIds: string[]
): Promise<void> {
  if (!hasServerAccess() || dismissedIds.length === 0) return;

  // Check which are already tracked
  const { data: existing } = await db()
    .from("user_event_interactions")
    .select("event_id")
    .eq("user_id", userId)
    .in("event_id", dismissedIds);

  const existingSet = new Set((existing ?? []).map((r: any) => r.event_id));

  // Dedupe dismissed IDs and aggregate skip counts for duplicates
  const skipCounts = new Map<string, number>();
  for (const id of dismissedIds) {
    if (existingSet.has(id)) continue;
    skipCounts.set(id, (skipCounts.get(id) ?? 0) + 1);
  }

  if (skipCounts.size === 0) return;

  const now = new Date().toISOString();
  const rows = [...skipCounts.entries()].map(([eventId, count]) => ({
    user_id: userId!,
    event_id: eventId,
    skip_count: count,
    permanently_hidden: count >= 3,
    last_action_at: now,
  }));

  // Batch upsert in chunks of 50
  for (let i = 0; i < rows.length; i += 50) {
    const { error } = await db()
      .from("user_event_interactions")
      .upsert(rows.slice(i, i + 50), { onConflict: "user_id,event_id" });
    if (error) console.error("[interactions] Migration batch error:", error.message);
  }

  console.log(`[interactions] Migrated ${skipCounts.size} dismissed events`);
}

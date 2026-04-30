/**
 * Supabase user data service.
 * Each logged-in user's data (profile, saved events, going events, custom lists)
 * is stored here and synced across devices.
 */

import { supabase } from "@/lib/supabase";
import type { UserProfile, SavedEvent, GoingEvent } from "@/types/user";

// ── Types ────────────────────────────────────────────────────

export interface RemoteUserData {
  displayName?: string;
  userProfile?: UserProfile;
  savedEvents: SavedEvent[];
  goingEvents: GoingEvent[];
  customLists: string[];
}

export interface PlanEventOrderRow {
  planDate: string;
  eventId: string;
  sortOrder: number;
}

// ── Fetch ────────────────────────────────────────────────────

export async function fetchUserData(userId: string): Promise<RemoteUserData | null> {
  if (!supabase) return null;
  try {
    const [profileRes, savedRes, goingRes, listsRes] = await Promise.all([
      supabase.from("user_profiles").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("saved_events").select("*").eq("user_id", userId),
      supabase.from("going_events").select("*").eq("user_id", userId),
      supabase
        .from("custom_lists")
        .select("name, sort_order, created_at")
        .eq("user_id", userId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);

    return {
      displayName: profileRes.data?.display_name ?? undefined,
      userProfile: profileRes.data ? rowToProfile(profileRes.data) : undefined,
      savedEvents: (savedRes.data ?? []).map(rowToSavedEvent),
      goingEvents: (goingRes.data ?? []).map(rowToGoingEvent),
      customLists: ((listsRes.data ?? []) as { name: string }[]).map((r) => r.name),
    };
  } catch {
    return null;
  }
}

// ── Upserts ──────────────────────────────────────────────────

export async function syncUserProfile(
  userId: string,
  profile: UserProfile,
  displayName?: string
): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from("user_profiles").upsert(
      {
        user_id: userId,
        display_name: displayName ?? null,
        interests: profile.interests,
        borough: profile.borough,
        neighborhood: profile.neighborhood,
        travel_range: profile.travelRange,
        vibe: profile.vibe,
        budget: profile.budget,
        free_days: profile.freeDays,
        free_time: profile.freeTime,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
  } catch {}
}

export async function syncDisplayName(userId: string, displayName: string): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from("user_profiles").upsert(
      { user_id: userId, display_name: displayName, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
  } catch {}
}

export async function syncSavedEvent(userId: string, event: SavedEvent): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from("saved_events").upsert(
      {
        user_id: userId,
        event_id: event.eventId,
        list_name: event.listName,
        event_title: event.eventTitle ?? null,
        event_start_date: event.eventStartDate ?? null,
        event_end_date: event.eventEndDate ?? null,
        saved_at: event.savedAt,
      },
      { onConflict: "user_id,event_id" }
    );
  } catch {}
}

export async function deleteSavedEvent(userId: string, eventId: string): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from("saved_events").delete().eq("user_id", userId).eq("event_id", eventId);
  } catch {}
}

export async function syncGoingEvent(userId: string, event: GoingEvent): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from("going_events").upsert(
      {
        user_id: userId,
        event_id: event.eventId,
        event_title: event.eventTitle,
        event_date: event.eventDate,
        event_end_date: event.eventEndDate ?? null,
        marked_at: event.markedAt,
        committed: event.committed ?? false,
        committed_at: event.committedAt ?? null,
      },
      { onConflict: "user_id,event_id" }
    );
  } catch {}
}

export async function deleteGoingEvent(userId: string, eventId: string): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from("going_events").delete().eq("user_id", userId).eq("event_id", eventId);
  } catch {}
}

export async function syncCustomList(
  userId: string,
  name: string,
  sortOrder?: number
): Promise<void> {
  if (!supabase) return;
  try {
    await supabase
      .from("custom_lists")
      .upsert(
        {
          user_id: userId,
          name,
          ...(sortOrder !== undefined ? { sort_order: sortOrder } : {}),
        },
        { onConflict: "user_id,name" }
      );
  } catch {}
}

export async function renameCustomListDB(userId: string, oldName: string, newName: string): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from("custom_lists").update({ name: newName }).eq("user_id", userId).eq("name", oldName);
    await supabase.from("saved_events").update({ list_name: newName }).eq("user_id", userId).eq("list_name", oldName);
  } catch {}
}

export async function deleteCustomListDB(userId: string, name: string): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from("custom_lists").delete().eq("user_id", userId).eq("name", name);
    await supabase.from("saved_events").delete().eq("user_id", userId).eq("list_name", name);
  } catch {}
}

export async function reorderCustomListsDB(
  userId: string,
  namesInOrder: string[]
): Promise<void> {
  if (!supabase || namesInOrder.length === 0) return;
  const client = supabase;
  try {
    await Promise.all(
      namesInOrder.map((name, index) =>
        client
          .from("custom_lists")
          .update({ sort_order: index })
          .eq("user_id", userId)
          .eq("name", name)
      )
    );
  } catch {}
}

export async function fetchPlanEventOrders(userId: string): Promise<PlanEventOrderRow[]> {
  if (!supabase) return [];
  try {
    const { data } = await supabase
      .from("user_plan_event_orders")
      .select("plan_date, event_id, sort_order")
      .eq("user_id", userId)
      .order("plan_date", { ascending: true })
      .order("sort_order", { ascending: true });

    return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      planDate: row.plan_date as string,
      eventId: row.event_id as string,
      sortOrder: Number(row.sort_order ?? 0),
    }));
  } catch {
    return [];
  }
}

export async function syncPlanEventOrder(
  userId: string,
  planDate: string,
  eventIds: string[]
): Promise<void> {
  if (!supabase) return;
  try {
    await supabase
      .from("user_plan_event_orders")
      .delete()
      .eq("user_id", userId)
      .eq("plan_date", planDate);

    if (eventIds.length === 0) return;

    await supabase.from("user_plan_event_orders").insert(
      eventIds.map((eventId, index) => ({
        user_id: userId,
        plan_date: planDate,
        event_id: eventId,
        sort_order: index,
      }))
    );
  } catch {}
}

// ── Row mappers ──────────────────────────────────────────────

function rowToProfile(row: Record<string, unknown>): UserProfile {
  return {
    interests:    (row.interests   as string[]) ?? [],
    borough:      (row.borough     as string)   ?? "",
    neighborhood: (row.neighborhood as string)  ?? "",
    travelRange:  (row.travel_range as string)  ?? "",
    vibe:         (row.vibe        as string)   ?? "",
    budget:       (row.budget      as string)   ?? "",
    freeDays:     (row.free_days   as string[]) ?? [],
    freeTime:     (row.free_time   as string[]) ?? [],
  };
}

function rowToSavedEvent(row: Record<string, unknown>): SavedEvent {
  return {
    eventId:        row.event_id        as string,
    listName:       row.list_name       as string,
    savedAt:        row.saved_at        as string,
    eventTitle:     (row.event_title      as string | null) ?? undefined,
    eventStartDate: (row.event_start_date as string | null) ?? undefined,
    eventEndDate:   (row.event_end_date   as string | null) ?? undefined,
  };
}

function rowToGoingEvent(row: Record<string, unknown>): GoingEvent {
  return {
    eventId:      row.event_id      as string,
    eventTitle:   row.event_title   as string,
    eventDate:    row.event_date    as string,
    eventEndDate: (row.event_end_date as string | null) ?? undefined,
    markedAt:     row.marked_at     as string,
    committed:    (row.committed as boolean | null) ?? undefined,
    committedAt:  (row.committed_at as string | null) ?? undefined,
  };
}

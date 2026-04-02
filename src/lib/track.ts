/**
 * Simple analytics tracking — fire-and-forget.
 *
 * Currently logs to AsyncStorage for local analysis.
 * To migrate to Supabase: replace the storage call with a supabase.from('analytics').insert().
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const ANALYTICS_KEY = "sift_analytics";
const MAX_LOCAL_EVENTS = 5000;

export type AnalyticsEventType =
  | "app_open"
  | "onboarding_complete"
  | "recommendations_viewed"
  | "card_tap"
  | "event_saved"
  | "event_going"
  | "plan_created"
  | "ticket_click"
  | "share_tap"
  | "shared_link_opened"
  | "calendar_export";

interface AnalyticsEvent {
  event_type: AnalyticsEventType;
  user_id: string;
  event_id?: string;
  metadata?: Record<string, any>;
  created_at: string;
}

let cachedUserId: string | null = null;

function getUserId(): string {
  if (cachedUserId) return cachedUserId;
  return "guest";
}

export function setTrackingUserId(userId: string) {
  cachedUserId = userId;
}

/**
 * Fire-and-forget analytics event. Never blocks the UI.
 */
export function track(
  eventType: AnalyticsEventType,
  metadata?: Record<string, any>
) {
  const entry: AnalyticsEvent = {
    event_type: eventType,
    user_id: getUserId(),
    event_id: metadata?.event_id ?? undefined,
    metadata: metadata ?? {},
    created_at: new Date().toISOString(),
  };

  // Fire-and-forget — don't await
  persistEvent(entry).catch(() => {});
}

async function persistEvent(entry: AnalyticsEvent) {
  try {
    const raw = await AsyncStorage.getItem(ANALYTICS_KEY);
    const existing: AnalyticsEvent[] = raw ? JSON.parse(raw) : [];

    // Keep a rolling buffer
    const updated = [...existing, entry].slice(-MAX_LOCAL_EVENTS);
    await AsyncStorage.setItem(ANALYTICS_KEY, JSON.stringify(updated));
  } catch {
    // Silently ignore — analytics should never break the app
  }
}

/**
 * Read all analytics events (for demo day dashboard).
 */
export async function getAnalyticsEvents(): Promise<AnalyticsEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(ANALYTICS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Get a summary of analytics (for demo day).
 */
export async function getAnalyticsSummary() {
  const events = await getAnalyticsEvents();
  const uniqueUsers = new Set(events.map((e) => e.user_id));
  const typeCounts: Record<string, number> = {};
  for (const e of events) {
    typeCounts[e.event_type] = (typeCounts[e.event_type] || 0) + 1;
  }
  return {
    totalEvents: events.length,
    uniqueUsers: uniqueUsers.size,
    typeCounts,
  };
}

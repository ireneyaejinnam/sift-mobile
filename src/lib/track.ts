/**
 * Analytics tracking — fire-and-forget.
 *
 * Fans out to two destinations:
 *   1. AsyncStorage — local rolling buffer (max 5,000 events)
 *   2. Amplitude    — via @amplitude/analytics-react-native SDK
 *
 * Setup: set EXPO_PUBLIC_AMPLITUDE_API_KEY in .env
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { track as amplitudeTrack, setUserId } from "@amplitude/analytics-react-native";

const ANALYTICS_KEY = "sift_analytics";
const MAX_LOCAL_EVENTS = 5000;

export type AnalyticsEventType =
  | "app_open"
  | "onboarding_started"
  | "onboarding_step_1_complete"
  | "onboarding_step_2_complete"
  | "onboarding_step_3_complete"
  | "onboarding_complete"
  | "sign_up_started"
  | "sign_up_completed"
  | "first_event_viewed"
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
  return cachedUserId ?? "guest";
}

export function setTrackingUserId(userId: string) {
  cachedUserId = userId;
  setUserId(userId).catch(() => {});
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

  persistEvent(entry).catch(() => {});
  amplitudeTrack(eventType, metadata ?? {});
}

// ── Local AsyncStorage buffer ───────────────────────────────────────────────

async function persistEvent(entry: AnalyticsEvent) {
  try {
    const raw = await AsyncStorage.getItem(ANALYTICS_KEY);
    const existing: AnalyticsEvent[] = raw ? JSON.parse(raw) : [];
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

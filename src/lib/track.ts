/**
 * Analytics tracking — fire-and-forget.
 *
 * Fans out to four destinations:
 *   1. AsyncStorage — local rolling buffer (max 5,000 events)
 *   2. Amplitude    — via @amplitude/analytics-react-native SDK
 *   3. Supabase     — analytics table (for active_users metric)
 *   4. Firebase Analytics — via Measurement Protocol REST API (no native SDK)
 *
 * Setup:
 *   EXPO_PUBLIC_AMPLITUDE_API_KEY        — from Amplitude > Settings > Projects
 *   EXPO_PUBLIC_SUPABASE_URL             — from Supabase > Project Settings
 *   EXPO_PUBLIC_SUPABASE_ANON_KEY        — from Supabase > Project Settings
 *   EXPO_PUBLIC_FIREBASE_IOS_APP_ID      — from Firebase > Project Settings > iOS app
 *   EXPO_PUBLIC_FIREBASE_ANDROID_APP_ID  — from Firebase > Project Settings > Android app
 *   EXPO_PUBLIC_FIREBASE_API_SECRET      — from GA4 > Data Streams > Measurement Protocol API secrets
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { track as amplitudeTrack, setUserId } from "@amplitude/analytics-react-native";
import { Platform } from "react-native";

const ANALYTICS_KEY = "sift_analytics";
const MAX_LOCAL_EVENTS = 5000;

// Firebase Measurement Protocol endpoint
const FIREBASE_ENDPOINT = "https://www.google-analytics.com/mp/collect";

// Generate a stable fake app_instance_id (32-char hex string).
// Measurement Protocol requires this format even without a native SDK.
function getFirebaseInstanceId(userId: string): string {
  // Simple hash: convert string to a consistent 32-char hex
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, "0");
  // Repeat to fill 32 chars
  return (hex + hex + hex + hex).substring(0, 32);
}

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
  | "calendar_export"
  | "guest_started"
  | "sign_in_completed"
  | "onboarding_step_4_complete"
  | "feedback_submitted"
  | "external_event_extracted"
  | "external_event_added"
  | "share_intent_received";

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
  try { setUserId(userId); } catch {}
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
  try { amplitudeTrack(eventType, metadata ?? {}); } catch {}
  persistToSupabase(entry).catch(() => {});
  persistToFirebase(entry).catch(() => {});
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

// ── Supabase analytics table ────────────────────────────────────────────────

async function persistToSupabase(entry: AnalyticsEvent) {
  try {
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) return;

    await fetch(`${supabaseUrl}/rest/v1/analytics`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        event_type: entry.event_type,
        user_id: entry.user_id,
        event_id: entry.event_id ?? null,
        metadata: entry.metadata ?? {},
        created_at: entry.created_at,
      }),
    });
  } catch {
    // Silently ignore — analytics should never break the app
  }
}

// ── Firebase Analytics via Measurement Protocol ─────────────────────────────

async function persistToFirebase(entry: AnalyticsEvent) {
  try {
    const isIOS = Platform.OS === "ios";
    const appId = isIOS
      ? process.env.EXPO_PUBLIC_FIREBASE_IOS_APP_ID
      : process.env.EXPO_PUBLIC_FIREBASE_ANDROID_APP_ID;
    const apiSecret = isIOS
      ? process.env.EXPO_PUBLIC_FIREBASE_IOS_API_SECRET
      : process.env.EXPO_PUBLIC_FIREBASE_ANDROID_API_SECRET;

    if (!appId || !apiSecret) return;

    await fetch(`${FIREBASE_ENDPOINT}?firebase_app_id=${appId}&api_secret=${apiSecret}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app_instance_id: getFirebaseInstanceId(entry.user_id),
        user_id: entry.user_id === "guest" ? undefined : entry.user_id,
        events: [
          {
            name: entry.event_type,
            params: {
              ...(entry.metadata ?? {}),
              ...(entry.event_id ? { event_id: entry.event_id } : {}),
            },
          },
        ],
      }),
    });
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
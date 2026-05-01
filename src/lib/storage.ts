/**
 * Storage service.
 *
 * AsyncStorage is used only as a local cache / offline fallback.
 * The source of truth for logged-in user data is Supabase (see userDataService.ts).
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SiftStorage } from "@/types/user";
import { initialStorage, STORAGE_KEY } from "@/types/user";

// ── Local cache (offline fallback) ───────────────────────────

export async function loadStorage(): Promise<SiftStorage> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return initialStorage;
    const parsed = JSON.parse(raw) as Partial<SiftStorage>;
    return {
      ...initialStorage,
      ...parsed,
      savedEvents:  parsed.savedEvents  ?? initialStorage.savedEvents,
      goingEvents:  parsed.goingEvents  ?? initialStorage.goingEvents,
      sharedWithYou: parsed.sharedWithYou ?? initialStorage.sharedWithYou,
      customLists:  parsed.customLists  ?? initialStorage.customLists,
    };
  } catch {
    return initialStorage;
  }
}

export async function saveStorage(data: SiftStorage): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

// ── Session flags ────────────────────────────────────────────

let _onboardingDone = false;
let _guestFlag = false;

export function hasOnboardingDoneFlag(): boolean  { return _onboardingDone; }
export function setOnboardingDoneFlag(): void     { _onboardingDone = true; }
export function clearOnboardingDoneFlag(): void   { _onboardingDone = false; }

export function hasGuestFlag(): boolean  { return _guestFlag; }
export function setGuestFlag(): void     { _guestFlag = true; }
export function clearGuestFlag(): void   { _guestFlag = false; }

// ── Dismissed events (learning signal) ──────────────────────

const DISMISSED_KEY = "sift_dismissed_events";

export interface DismissedRecord {
  eventId: string;
  category: string;
  dismissedAt: string; // ISO string
}

export async function getDismissedEvents(): Promise<DismissedRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(DISMISSED_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as DismissedRecord[];
  } catch {
    return [];
  }
}

export async function addDismissedEvent(record: DismissedRecord): Promise<void> {
  try {
    const existing = await getDismissedEvents();
    // Keep last 200 dismissals to avoid unbounded growth
    const trimmed = [...existing, record].slice(-200);
    await AsyncStorage.setItem(DISMISSED_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore
  }
}

// ── Device ID (stable guest identity for analytics) ─────────

const DEVICE_ID_KEY = "sift_device_id";

export async function getOrCreateDeviceId(): Promise<string> {
  try {
    const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const id = `device_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return `device_${Date.now()}`;
  }
}

// ── Hint dismissal ──────────────────────────────────────────

const HINT_PREFIX = "sift_hint_";

export async function isHintDismissed(hintKey: string): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(`${HINT_PREFIX}${hintKey}`);
    return val === "1";
  } catch {
    return false;
  }
}

export async function dismissHint(hintKey: string): Promise<void> {
  try {
    await AsyncStorage.setItem(`${HINT_PREFIX}${hintKey}`, "1");
  } catch {}
}

// ── Gesture tutorial ─────────────────────────────────────────

const GESTURE_TIP_KEY = "sift_gesture_tip_seen";

export async function hasGestureTipSeen(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(GESTURE_TIP_KEY);
    return val === "1";
  } catch {
    return false;
  }
}

export async function setGestureTipSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(GESTURE_TIP_KEY, "1");
  } catch {
    // ignore
  }
}

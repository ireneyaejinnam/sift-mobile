/**
 * Storage service — Supabase-ready abstraction.
 *
 * Currently backed by AsyncStorage (local, offline).
 * To migrate to Supabase:
 *   1. Replace loadStorage/saveStorage with Supabase queries
 *   2. Replace session flags with Supabase session state
 *   3. Everything else (UserContext, components) stays the same
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SiftStorage } from "@/types/user";
import { initialStorage, STORAGE_KEY } from "@/types/user";

// ── Main storage ─────────────────────────────────────────────

export async function loadStorage(): Promise<SiftStorage> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return initialStorage;
    const parsed = JSON.parse(raw) as Partial<SiftStorage>;
    return {
      ...initialStorage,
      ...parsed,
      savedEvents: parsed.savedEvents ?? initialStorage.savedEvents,
      goingEvents: parsed.goingEvents ?? initialStorage.goingEvents,
      sharedWithYou: parsed.sharedWithYou ?? initialStorage.sharedWithYou,
      customLists: parsed.customLists ?? initialStorage.customLists,
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
// These are ephemeral (session-only on web). On mobile we use
// in-memory state since there's no sessionStorage equivalent.
// Supabase migration: replace with auth session checks.

let _onboardingDone = false;
let _guestFlag = false;

export function hasOnboardingDoneFlag(): boolean {
  return _onboardingDone;
}

export function setOnboardingDoneFlag(): void {
  _onboardingDone = true;
}

export function clearOnboardingDoneFlag(): void {
  _onboardingDone = false;
}

export function hasGuestFlag(): boolean {
  return _guestFlag;
}

export function setGuestFlag(): void {
  _guestFlag = true;
}

export function clearGuestFlag(): void {
  _guestFlag = false;
}

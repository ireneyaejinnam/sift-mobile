/**
 * Analytics SDK initialization.
 *
 * Call initAnalytics() once at app startup (in ClientProviders).
 * After that, use track() from track.ts — it fans out to all destinations.
 *
 * Required environment variables:
 *   EXPO_PUBLIC_AMPLITUDE_API_KEY   — from Amplitude > Settings > Projects
 *
 * Firebase Analytics is configured via GoogleService-Info.plist (iOS)
 * and google-services.json (Android) — no env var needed at runtime.
 */

import { init as amplitudeInit } from "@amplitude/analytics-react-native";

const AMPLITUDE_API_KEY = process.env.EXPO_PUBLIC_AMPLITUDE_API_KEY ?? "";

let initialized = false;

export function initAnalytics() {
  if (initialized) return;
  initialized = true;

  if (AMPLITUDE_API_KEY) {
    amplitudeInit(AMPLITUDE_API_KEY, undefined, {
      trackingOptions: {
        ipAddress: false, // privacy-first
      },
    });
  }
}

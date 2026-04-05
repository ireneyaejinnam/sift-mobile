/**
 * Analytics SDK initialization.
 *
 * Call initAnalytics() once at app startup (in ClientProviders).
 * After that, use track() from track.ts.
 *
 * Required environment variables:
 *   EXPO_PUBLIC_AMPLITUDE_API_KEY   — from Amplitude > Settings > Projects
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

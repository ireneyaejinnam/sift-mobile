import { useEffect, useCallback } from "react";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as Linking from "expo-linking";
import { useShareIntentContext, ShareIntentProvider } from "expo-share-intent";
import { ClientProviders } from "@/components/providers/ClientProviders";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { track } from "@/lib/track";
import { colors } from "@/lib/theme";
import { InAppFeedback } from "@/components/feedback/InAppFeedback";

function useDeepLinkRouter() {
  const router = useRouter();

  const isExpoRouterOwnedUrl = useCallback((url: string) => {
    // Share intent deeplinks — handled by ShareIntentProvider, not router
    if (/siftShareKey|dataUrl/i.test(url)) return true;
    return (
      /^sift:\/\//i.test(url) ||
      /^https?:\/\/siftapp\.site(?:\/|$)/i.test(url)
    );
  }, []);

  const handleUrl = useCallback(
    (url: string, shouldPush = true) => {
      const match = url.match(
        /https?:\/\/siftapp\.site\/event\/([A-Za-z0-9_-]+)/
      );
      if (match) {
        const eventId = match[1];
        track("shared_link_opened", { event_id: eventId, has_app: true });
        if (shouldPush) router.push(`/event/${eventId}`);
      }
    },
    [router]
  );

  useEffect(() => {
    // Cold launch: check initial URL
    Linking.getInitialURL().then((url) => {
      // Expo Router resolves owned cold-start links; pushing here duplicates the route.
      if (url) handleUrl(url, !isExpoRouterOwnedUrl(url));
    });

    // Warm launch: listen for incoming URLs
    // Expo Router also handles owned URLs, so only push for non-owned URLs
    const sub = Linking.addEventListener("url", (e) =>
      handleUrl(e.url, !isExpoRouterOwnedUrl(e.url))
    );
    return () => sub.remove();
  }, [handleUrl, isExpoRouterOwnedUrl]);
}

function DeepLinkHandler() {
  useDeepLinkRouter();
  return null;
}

function ShareIntentHandler() {
  const router = useRouter();
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();

  useEffect(() => {
    if (hasShareIntent && shareIntent) {
      const url = shareIntent.webUrl ?? shareIntent.text ?? "";
      if (url) {
        track("share_intent_received", { url: url.slice(0, 100) });
        router.push(`/add-event?prefill=${encodeURIComponent(url)}`);
        resetShareIntent();
      }
    }
  }, [hasShareIntent, shareIntent]);

  return null;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <ShareIntentProvider>
        <ClientProviders>
          <DeepLinkHandler />
          <ShareIntentHandler />
          <InAppFeedback />
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
              animation: "fade",
            }}
          >
            <Stack.Screen name="(auth)/gate" />
            <Stack.Screen name="(auth)/signin" />
            <Stack.Screen
              name="(onboarding)/flow"
              options={{ animation: "slide_from_right" }}
            />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="event/[id]"
              options={{ animation: "slide_from_right" }}
            />
            <Stack.Screen
              name="add-event"
              options={{ animation: "slide_from_bottom" }}
            />
          </Stack>
        </ClientProviders>
        </ShareIntentProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

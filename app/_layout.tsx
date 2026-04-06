import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ClientProviders } from "@/components/providers/ClientProviders";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { colors } from "@/lib/theme";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <ClientProviders>
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
          </Stack>
        </ClientProviders>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

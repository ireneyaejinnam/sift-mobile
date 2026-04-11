import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { setGuestFlag } from "@/lib/storage";
import { track } from "@/lib/track";
import { colors, spacing, radius, typography } from "@/lib/theme";

export default function AuthGate() {
  const router = useRouter();

  const handleContinueAsGuest = () => {
    track("guest_started");
    setGuestFlag();
    router.replace("/(tabs)/discover");
  };

  const handleSignIn = () => {
    router.push("/(auth)/signin");
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.heading}>Welcome to Sift</Text>
        <Text style={styles.subtitle}>
          Find events in NYC that match what you care about. Sign in to save
          your taste and get personalized recommendations.
        </Text>
        <View style={styles.buttons}>
          <Pressable
            onPress={handleSignIn}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.primaryButtonPressed,
            ]}
          >
            <Text style={styles.primaryButtonText}>
              Sign in to save your taste
            </Text>
          </Pressable>
          <Pressable
            onPress={handleContinueAsGuest}
            style={({ pressed }) => [
              styles.ghostButton,
              pressed && styles.ghostButtonPressed,
            ]}
          >
            <Text style={styles.ghostButtonText}>
              Continue without signing in
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.page,
    backgroundColor: colors.background,
  },
  content: {
    maxWidth: 400,
    width: "100%",
    alignItems: "center",
  },
  heading: {
    ...typography.heroHeading,
    fontSize: 26,
    textAlign: "center",
    marginBottom: 12,
  },
  subtitle: {
    ...typography.sm,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 32,
    color: colors.textSecondary,
  },
  buttons: {
    width: "100%",
    gap: 12,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: radius.md,
    alignItems: "center",
  },
  primaryButtonPressed: {
    opacity: 0.85,
  },
  primaryButtonText: {
    ...typography.body,
    fontWeight: "600",
    color: colors.white,
  },
  ghostButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: radius.md,
    alignItems: "center",
  },
  ghostButtonPressed: {
    opacity: 0.6,
  },
  ghostButtonText: {
    ...typography.body,
    color: colors.textSecondary,
  },
});

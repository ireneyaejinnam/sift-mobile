import { useEffect, useRef } from "react";
import { View, Text, Pressable, StyleSheet, Image, Animated } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { setGuestFlag } from "@/lib/storage";
import { track } from "@/lib/track";
import { colors, radius, typography } from "@/lib/theme";
import { useUser } from "@/context/UserContext";

export default function AuthGate() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isLoggedIn } = useUser();
  const continueOpacity = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    if (!isLoggedIn) {
      continueOpacity.setValue(0.55);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(continueOpacity, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(continueOpacity, {
          toValue: 0.45,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    );

    loop.start();
    return () => loop.stop();
  }, [continueOpacity, isLoggedIn]);

  const handleContinue = () => {
    router.replace("/(tabs)/discover");
  };

  const handleSignIn = () => {
    router.push("/(auth)/signin");
  };

  const handleContinueAsGuest = () => {
    track("guest_started");
    setGuestFlag();
    router.replace("/(tabs)/discover");
  };

  const content = (
    <LinearGradient
      colors={["#B8CEDE", "#D4E2EE", "#EBF0F6", "#F5F7FA"]}
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.85, y: 1 }}
      style={styles.container}
    >
      <View style={[styles.heroArea, { paddingTop: insets.top }]}>
        <Image
          source={require("../../assets/sift-logo-v3.png")}
          style={styles.logo}
          resizeMode="contain"
        />
      </View>

      <View style={[styles.contentArea, { paddingBottom: insets.bottom + 36 }]}>
        <Text style={styles.heading}>
          Find events in{" "}
          <Text style={styles.headingAccent}>NYC</Text>
          {"\n"}that match{" "}
          <Text style={styles.headingAccent}>your vibe.</Text>
        </Text>

        <View style={styles.buttons}>
          {isLoggedIn ? (
            <Animated.View style={{ opacity: continueOpacity }}>
              <View style={styles.subtleContinueButton}>
                <Text style={styles.subtleContinueText}>Tap to continue</Text>
              </View>
            </Animated.View>
          ) : (
            <>
              <Pressable
                onPress={handleSignIn}
                style={({ pressed }) => [styles.primaryButton, pressed && { opacity: 0.92 }]}
              >
                <Text style={styles.primaryButtonText}>Sign in</Text>
              </Pressable>
              <Pressable
                onPress={handleContinueAsGuest}
                style={({ pressed }) => [styles.secondaryButton, pressed && { opacity: 0.92 }]}
              >
                <Text style={styles.secondaryButtonText}>Continue as guest</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </LinearGradient>
  );

  if (isLoggedIn) {
    return (
      <Pressable style={styles.container} onPress={handleContinue}>
        {content}
      </Pressable>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  heroArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: 340,
    height: 340,
  },

  contentArea: {
    paddingHorizontal: 28,
    gap: 28,
  },
  heading: {
    fontSize: 28,
    fontWeight: "700",
    color: "#4B5563",
    lineHeight: 38,
    letterSpacing: -0.5,
  },
  headingAccent: {
    color: "#6B93C4",
  },

  buttons: {
    gap: 10,
    alignItems: "center",
  },
  primaryButton: {
    backgroundColor: colors.white,
    minWidth: 220,
    paddingHorizontal: 28,
    paddingVertical: 15,
    borderRadius: radius.full,
    alignItems: "center",
    shadowColor: "#111827",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 16,
    elevation: 5,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.foreground,
    letterSpacing: -0.2,
  },
  secondaryButton: {
    backgroundColor: "transparent",
    minWidth: 220,
    paddingHorizontal: 28,
    paddingVertical: 15,
    borderRadius: radius.full,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.foreground,
    letterSpacing: -0.2,
  },
  subtleContinueButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.full,
    alignItems: "center",
  },
  subtleContinueText: {
    ...typography.xs,
    color: colors.textSecondary,
    letterSpacing: 0.2,
  },
});

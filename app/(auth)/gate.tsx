import { View, Text, Pressable, StyleSheet, Image } from "react-native";
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
  const { isLoggedIn, signOut } = useUser();

  const handleFindMyVibe = async () => {
    track("find_my_vibe_tapped");
    if (!isLoggedIn) await signOut();
    setGuestFlag();
    router.replace("/(tabs)/discover");
  };

  const handleShowAnything = async () => {
    track("show_anything_tapped");
    if (!isLoggedIn) await signOut();
    setGuestFlag();
    router.replace({ pathname: "/(tabs)/discover", params: { browse: "1" } });
  };

  const handleSignIn = () => {
    router.push("/(auth)/signin");
  };

  return (
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
          <Pressable
            onPress={handleFindMyVibe}
            style={({ pressed }) => [styles.primaryButton, pressed && { opacity: 0.92 }]}
          >
            <Text style={styles.primaryButtonText}>Find my vibe</Text>
          </Pressable>
          <Pressable
            onPress={handleShowAnything}
            style={({ pressed }) => [styles.primaryButton, pressed && { opacity: 0.92 }]}
          >
            <Text style={styles.primaryButtonText}>Show anything</Text>
          </Pressable>
          {!isLoggedIn && (
            <Pressable
              onPress={handleSignIn}
              style={({ pressed }) => [styles.ghostButton, pressed && { opacity: 0.5 }]}
            >
              <Text style={styles.ghostButtonText}>Sign in to save your taste</Text>
            </Pressable>
          )}
        </View>
      </View>
    </LinearGradient>
  );
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
  },
  primaryButton: {
    backgroundColor: colors.white,
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
  ghostButton: {
    paddingVertical: 14,
    alignItems: "center",
  },
  ghostButtonText: {
    ...typography.sm,
    color: colors.textSecondary,
  },
});

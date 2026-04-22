import { Redirect } from "expo-router";
import { useUser } from "@/context/UserContext";
import { hasGuestFlag, hasOnboardingDoneFlag } from "@/lib/storage";
import { ActivityIndicator, View } from "react-native";
import { colors } from "@/lib/theme";

export default function Index() {
  const { ready, isLoggedIn } = useUser();

  if (!ready) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  // If already passed the gate this session, go straight to tabs
  if (hasGuestFlag()) {
    return <Redirect href="/(tabs)/discover" />;
  }

  // Always show gate — logged-in users see "Start exploring"
  return <Redirect href="/(auth)/gate" />;
}

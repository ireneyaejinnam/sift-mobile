import { Redirect } from "expo-router";
import { useUser } from "@/context/UserContext";
import { ActivityIndicator, View } from "react-native";
import { colors } from "@/lib/theme";

export default function Index() {
  const { ready } = useUser();

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

  // Always show the welcoming gate first, regardless of auth state.
  return <Redirect href="/(auth)/gate" />;
}

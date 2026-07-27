import { View, Text, StyleSheet } from "react-native";
import { WifiOff } from "lucide-react-native";
import { colors, radius } from "@/lib/theme";

/** Thin banner shown when the device is offline. */
export default function OfflineBanner() {
  return (
    <View style={styles.banner}>
      <WifiOff size={14} color={colors.white} strokeWidth={1.8} />
      <Text style={styles.text}>You're offline — showing recent events</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: colors.textSecondary,
    marginBottom: 12,
  },
  text: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.white,
  },
});

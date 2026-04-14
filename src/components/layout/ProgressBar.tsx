import { View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/lib/theme";
import type { Step } from "@/types/quiz";

interface ProgressBarProps {
  step: Step;
}

export default function ProgressBar({ step }: ProgressBarProps) {
  const insets = useSafeAreaInsets();
  const steps: Step[] = ["category", "date", "distance"];
  const idx = steps.indexOf(step);
  if (idx === -1) return null;

  const pct = ((idx + 1) / steps.length) * 100;

  return (
    <View style={[styles.header, { height: insets.top + 11 }]}>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "#FFFFFF",
    zIndex: 49,
    justifyContent: "flex-end",
  },
  track: {
    height: 3,
    backgroundColor: colors.border,
  },
  fill: {
    height: 3,
    backgroundColor: colors.primary,
  },
});

import { View, StyleSheet, Platform } from "react-native";
import { colors } from "@/lib/theme";
import type { Step } from "@/types/quiz";

interface ProgressBarProps {
  step: Step;
}

export default function ProgressBar({ step }: ProgressBarProps) {
  const steps: Step[] = ["category", "date", "distance"];
  const idx = steps.indexOf(step);
  if (idx === -1) return null;

  const pct = ((idx + 1) / steps.length) * 100;

  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${pct}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 3,
    backgroundColor: colors.border,
    position: "absolute",
    top: Platform.OS === "ios" ? 54 : 8,
    left: 0,
    right: 0,
    zIndex: 49,
  },
  fill: {
    height: 3,
    backgroundColor: colors.primary,
  },
});

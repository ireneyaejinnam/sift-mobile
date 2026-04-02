import { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
} from "react-native-reanimated";
import { colors, radius, shadows } from "@/lib/theme";

export default function SkeletonCard() {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1200 }), -1, true);
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.4, 0.8]),
  }));

  return (
    <View style={s.card}>
      <Animated.View style={[s.image, animStyle]} />
      <View style={s.body}>
        <Animated.View style={[s.pillRow, animStyle]}>
          <View style={s.pill} />
          <View style={[s.pill, { width: 50 }]} />
        </Animated.View>
        <Animated.View style={[s.titleLine, animStyle]} />
        <Animated.View style={[s.titleLine, { width: "60%" }, animStyle]} />
        <View style={{ marginTop: 12, gap: 6 }}>
          <Animated.View style={[s.metaLine, animStyle]} />
          <Animated.View style={[s.metaLine, { width: "50%" }, animStyle]} />
          <Animated.View style={[s.metaLine, { width: "40%" }, animStyle]} />
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    marginBottom: 16,
    ...shadows.card,
  },
  image: {
    width: "100%",
    height: 200,
    backgroundColor: colors.muted,
  },
  body: {
    padding: 16,
  },
  pillRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 12,
  },
  pill: {
    width: 70,
    height: 20,
    borderRadius: 4,
    backgroundColor: colors.muted,
  },
  titleLine: {
    height: 18,
    borderRadius: 4,
    backgroundColor: colors.muted,
    marginBottom: 6,
    width: "85%",
  },
  metaLine: {
    height: 14,
    borderRadius: 3,
    backgroundColor: colors.muted,
    width: "70%",
  },
});

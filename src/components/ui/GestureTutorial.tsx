import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated, Pressable } from "react-native";
import { ArrowLeft, X, Info } from "lucide-react-native";
import { colors, spacing, radius, typography } from "@/lib/theme";

interface Props {
  visible: boolean;
  onDismiss: () => void;
}

export default function GestureTutorial({ visible, onDismiss }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const dismissedRef = useRef(false);

  useEffect(() => {
    if (!visible) return;

    dismissedRef.current = false;

    Animated.timing(opacity, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();

    const timer = setTimeout(() => {
      dismiss();
    }, 4000);

    return () => clearTimeout(timer);
  }, [visible]);

  const dismiss = () => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    Animated.timing(opacity, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => onDismiss());
  };

  if (!visible) return null;

  return (
    <Animated.View style={[styles.container, { opacity }]} pointerEvents="box-none">
      <Pressable onPress={dismiss} style={styles.banner}>
        <View style={styles.iconRow}>
          <Info size={14} color={colors.primary} strokeWidth={2} />
          <Text style={styles.title}>How it works</Text>
        </View>
        <View style={styles.hints}>
          <View style={styles.hint}>
            <ArrowLeft size={14} color={colors.textSecondary} strokeWidth={2} />
            <Text style={styles.hintText}>Swipe left to skip</Text>
          </View>
          <View style={styles.separator} />
          <View style={styles.hint}>
            <Text style={styles.tapEmoji}>👆</Text>
            <Text style={styles.hintText}>Tap to see details</Text>
          </View>
          <View style={styles.separator} />
          <View style={styles.hint}>
            <X size={14} color={colors.textSecondary} strokeWidth={2} />
            <Text style={styles.hintText}>✕ to remove</Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  banner: {
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 8,
  },
  iconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  title: {
    ...typography.xs,
    fontWeight: "600",
    color: colors.primary,
  },
  hints: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  hint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flex: 1,
  },
  hintText: {
    ...typography.xs,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  tapEmoji: {
    fontSize: 12,
    lineHeight: 16,
  },
  separator: {
    width: 1,
    height: 16,
    backgroundColor: colors.border,
  },
});

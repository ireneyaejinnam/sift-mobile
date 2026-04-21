import type { ReactNode } from "react";
import { Pressable, StyleSheet } from "react-native";
import { colors, radius } from "@/lib/theme";

interface OptionCardProps {
  selected: boolean;
  onPress: () => void;
  children: ReactNode;
}

export default function OptionCard({ selected, onPress, children }: OptionCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, selected && styles.cardSelected]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  cardSelected: {
    // Keep borderWidth: 1 so layout doesn't shift — only color changes
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
});

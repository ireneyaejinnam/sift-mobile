import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { X, Sparkles, ChevronRight } from "lucide-react-native";
import { isHintDismissed, dismissHint } from "@/lib/storage";
import { colors, radius, typography } from "@/lib/theme";

const DEFAULT_HINT_KEY = "set_taste_prompt";

interface TastePromptProps {
  /** Whether the user still needs to set their taste (no profile yet). */
  show: boolean;
  /** Tapping the banner (routes to the taste-setter). */
  onPress: () => void;
  /** Dismissal key — pass a distinct one to dismiss independently per surface. */
  hintKey?: string;
}

/**
 * Soft, dismissible first-run nudge to complete the taste questionnaire.
 * Not a wall — the deck works without it; this just surfaces the buried
 * taste-setter so personalization can actually accumulate (EPIC 3 / R3).
 */
export default function TastePrompt({ show, onPress, hintKey = DEFAULT_HINT_KEY }: TastePromptProps) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    isHintDismissed(hintKey).then(setDismissed);
  }, [hintKey]);

  if (!show || dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    dismissHint(hintKey);
  };

  return (
    <View style={s.container}>
      <Pressable onPress={onPress} style={s.banner} accessibilityRole="button">
        <Sparkles size={16} color={colors.primary} strokeWidth={2} />
        <View style={s.textCol}>
          <Text style={s.title}>Set your taste</Text>
          <Text style={s.sub}>Answer a few questions for better matches</Text>
        </View>
        <ChevronRight size={18} color={colors.primary} strokeWidth={2} />
        <Pressable onPress={handleDismiss} hitSlop={12} style={s.closeBtn}>
          <X size={14} color={colors.primary} strokeWidth={2.5} />
        </Pressable>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    paddingVertical: 6,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  textCol: {
    flex: 1,
    gap: 1,
  },
  title: {
    ...typography.xs,
    fontWeight: "700",
    color: colors.foreground,
  },
  sub: {
    ...typography.xs,
    color: colors.textSecondary,
  },
  closeBtn: {
    padding: 4,
  },
});

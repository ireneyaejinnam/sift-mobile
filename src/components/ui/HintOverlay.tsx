import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { X, Info } from "lucide-react-native";
import { isHintDismissed, dismissHint } from "@/lib/storage";
import { colors, radius, typography } from "@/lib/theme";

interface HintOverlayProps {
  hintKey: string;
  hints: { action: string; detail: string }[];
  onDismiss?: () => void;
}

export default function HintOverlay({
  hintKey,
  hints,
  onDismiss,
}: HintOverlayProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    isHintDismissed(hintKey).then((dismissed) => {
      if (!dismissed) setVisible(true);
    });
  }, [hintKey]);

  if (!visible) return null;

  const handleDismiss = () => {
    setVisible(false);
    dismissHint(hintKey);
    onDismiss?.();
  };

  return (
    <View style={s.container}>
      <View style={s.banner}>
        <View style={s.header}>
          <View style={s.titleRow}>
            <Info size={13} color={colors.primary} strokeWidth={2} />
            <Text style={s.title}>How it works</Text>
          </View>
          <Pressable onPress={handleDismiss} hitSlop={12} style={s.closeBtn}>
            <X size={14} color={colors.primary} strokeWidth={2.5} />
          </Pressable>
        </View>
        <View style={s.hintList}>
          {hints.map((hint, i) => (
            <View key={i} style={s.hintRow}>
              <Text style={s.action}>{hint.action}</Text>
              <Text style={s.detail}>{hint.detail}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    paddingVertical: 6,
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  title: {
    ...typography.xs,
    fontWeight: "600",
    color: colors.primary,
  },
  closeBtn: {
    padding: 4,
  },
  hintList: {
    gap: 4,
  },
  hintRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  action: {
    ...typography.xs,
    fontWeight: "700",
    color: colors.foreground,
    width: 96,
  },
  detail: {
    ...typography.xs,
    color: colors.textSecondary,
    flex: 1,
  },
});

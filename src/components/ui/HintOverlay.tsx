import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { X } from "lucide-react-native";
import { isHintDismissed, dismissHint } from "@/lib/storage";
import { colors, radius, typography } from "@/lib/theme";

interface HintOverlayProps {
  hintKey: string;
  children: React.ReactNode;
  position?: "top" | "bottom" | "center";
  onDismiss?: () => void;
}

export default function HintOverlay({
  hintKey,
  children,
  position = "bottom",
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
    <View
      style={[
        styles.container,
        position === "top" && styles.posTop,
        position === "bottom" && styles.posBottom,
        position === "center" && styles.posCenter,
      ]}
    >
      <View style={styles.bubble}>
        <View style={styles.content}>{children}</View>
        <Pressable onPress={handleDismiss} hitSlop={8} style={styles.closeButton}>
          <X size={14} color="rgba(255,255,255,0.7)" strokeWidth={2} />
        </Pressable>
      </View>
    </View>
  );
}

export function HintText({ text }: { text: string }) {
  return <Text style={styles.hintText}>{text}</Text>;
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 100,
    alignItems: "center",
  },
  posTop: { top: 8 },
  posBottom: { bottom: 8 },
  posCenter: { top: "40%", transform: [{ translateY: -30 }] as any },
  bubble: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(30, 30, 30, 0.92)",
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingLeft: 16,
    paddingRight: 10,
    maxWidth: 340,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  content: { flex: 1 },
  closeButton: { padding: 6, marginLeft: 8 },
  hintText: {
    fontSize: 13,
    lineHeight: 18,
    color: "#fff",
    fontWeight: "500",
  },
});

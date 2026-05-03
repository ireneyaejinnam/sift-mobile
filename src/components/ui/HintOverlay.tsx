import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { X } from "lucide-react-native";
import { isHintDismissed, dismissHint } from "@/lib/storage";
import { colors, radius } from "@/lib/theme";

interface HintOverlayProps {
  hintKey: string;
  children: React.ReactNode;
  onDismiss?: () => void;
}

export default function HintOverlay({
  hintKey,
  children,
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
    <View style={styles.container}>
      <View style={styles.bubble}>
        <View style={styles.content}>{children}</View>
        <Pressable onPress={handleDismiss} hitSlop={12} style={styles.closeButton}>
          <X size={16} color="rgba(255,255,255,0.8)" strokeWidth={2.5} />
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
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  bubble: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(30, 30, 30, 0.92)",
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingLeft: 16,
    paddingRight: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  content: { flex: 1 },
  closeButton: { padding: 8, marginLeft: 8 },
  hintText: {
    fontSize: 13,
    lineHeight: 20,
    color: "#fff",
    fontWeight: "500",
  },
});

import { View, Text, Pressable, Share, StyleSheet } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useToast } from "@/components/ui/Toast";
import { colors, radius, typography } from "@/lib/theme";

interface ShareSheetProps {
  eventId: string;
  eventTitle: string;
  eventUrl?: string;
  onClose: () => void;
}

export default function ShareSheet({
  eventId,
  eventTitle,
  eventUrl,
  onClose,
}: ShareSheetProps) {
  const { showToast } = useToast();
  const url = eventUrl ?? "";
  const text = url
    ? `Check out this event: ${eventTitle} ${url}`
    : `Check out this event: ${eventTitle}`;

  const copyLink = async () => {
    await Clipboard.setStringAsync(url);
    showToast("Link copied");
    onClose();
  };

  const shareNative = async () => {
    try {
      await Share.share({
        message: text,
        url,
        title: eventTitle,
      });
      onClose();
    } catch {
      copyLink();
    }
  };

  return (
    <View>
      <Text style={styles.label}>Share this event</Text>
      <View style={styles.list}>
        <Pressable onPress={copyLink} style={styles.option}>
          <Text style={styles.optionText}>Copy link</Text>
        </Pressable>
        <Pressable onPress={shareNative} style={styles.option}>
          <Text style={styles.optionText}>Share…</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    ...typography.sm,
    color: colors.textSecondary,
    marginBottom: 16,
  },
  list: {
    gap: 10,
  },
  option: {
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  optionText: {
    ...typography.body,
    color: colors.foreground,
  },
});

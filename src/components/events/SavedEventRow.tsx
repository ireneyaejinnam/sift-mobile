import { useEffect, useState } from "react";
import { View, Text, Image, Pressable, StyleSheet } from "react-native";
import { GripVertical, ImageIcon } from "lucide-react-native";
import { getUnsplashFallback } from "@/lib/unsplashFallback";
import { colors, radius, typography } from "@/lib/theme";
import type { SiftEvent } from "@/types/event";

/**
 * Compact saved-event row for the Plan tab's List view. Shows a thumbnail,
 * the title, and a right-side check that fills when the user is going.
 */
export default function SavedEventRow({
  event,
  going,
  attended = false,
  canMarkWent = false,
  onToggleWent,
  onPress,
  drag,
}: {
  event: SiftEvent;
  going: boolean;
  /** Whether the user confirmed they attended (past + going only). */
  attended?: boolean;
  /** Show the "Went?" toggle (event is past and the user is going). */
  canMarkWent?: boolean;
  onToggleWent?: () => void;
  onPress: () => void;
  /** Long-press drag handler for reordering. */
  drag?: () => void;
}) {
  const [fallbackImage, setFallbackImage] = useState<string | null>(null);

  useEffect(() => {
    if (!event.imageUrl) {
      getUnsplashFallback(event.category).then(setFallbackImage);
    }
  }, [event.id, event.category, event.imageUrl]);

  const imgSrc = event.imageUrl ?? fallbackImage;

  return (
    <Pressable onPress={onPress} onLongPress={drag} delayLongPress={200} style={[styles.row, going && styles.rowGoing]}>
      {imgSrc ? (
        <Image source={{ uri: imgSrc }} style={styles.thumb} resizeMode="cover" />
      ) : (
        <View style={[styles.thumb, styles.thumbPlaceholder]}>
          <ImageIcon size={18} strokeWidth={1.2} color={colors.textMuted} />
        </View>
      )}
      <Text style={styles.title} numberOfLines={2}>
        {event.title}
      </Text>
      {canMarkWent && (
        <Pressable
          onPress={onToggleWent}
          hitSlop={6}
          style={[styles.wentChip, attended && styles.wentChipActive]}
        >
          <Text style={[styles.wentText, attended && styles.wentTextActive]}>
            {attended ? "Went ✓" : "Went?"}
          </Text>
        </Pressable>
      )}
      {drag && (
        <GripVertical size={16} strokeWidth={1.5} color={colors.textMuted} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    marginBottom: 10,
  },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: radius.sm,
    backgroundColor: colors.muted,
  },
  thumbPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    ...typography.body,
    fontWeight: "500",
    color: colors.foreground,
    flex: 1,
  },
  rowGoing: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  wentChip: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  wentChipActive: {
    borderColor: "#2D6644",
    backgroundColor: "rgba(45,102,68,0.12)",
  },
  wentText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  wentTextActive: {
    color: "#2D6644",
  },
});

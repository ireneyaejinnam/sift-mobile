import { View, Text, Pressable, StyleSheet } from "react-native";
import { Star, CalendarPlus, Check, X, ThumbsDown } from "lucide-react-native";
import { colors, radius, typography } from "@/lib/theme";

interface DeckActionBarProps {
  /** Whether the active event is currently saved to a list. */
  saved: boolean;
  /** Whether the active event is currently marked going. */
  going: boolean;
  /** Tap Interested — one-tap save / unsave to Favorites. */
  onInterested: () => void;
  /** Long-press Interested — open the Save-to-list sheet to pick a list. */
  onInterestedLongPress: () => void;
  /** Tap Going — mark going (handles multi-date + calendar prompt upstream). */
  onGoing: () => void;
  /** Left-swipe equivalent — neutral skip, no taste impact. */
  onNotNow: () => void;
  /** Down-swipe equivalent — negative, counts toward permanent hide. */
  onNotInterested: () => void;
}

/**
 * Persistent action row under the deck. Mirrors the swipe intents as tappable
 * buttons: the two positive actions (Interested / Going) are primary, and the
 * two negatives (Not now / Not interested) sit above as low-emphasis controls.
 */
export default function DeckActionBar({
  saved,
  going,
  onInterested,
  onInterestedLongPress,
  onGoing,
  onNotNow,
  onNotInterested,
}: DeckActionBarProps) {
  return (
    <View style={styles.container}>
      {/* Secondary — negative swipe equivalents, kept subtle */}
      <View style={styles.secondaryRow}>
        <Pressable onPress={onNotNow} style={styles.secondaryButton} hitSlop={8}>
          <X size={13} strokeWidth={1.8} color={colors.textSecondary} />
          <Text style={styles.secondaryText}>Not now</Text>
        </Pressable>
        <View style={styles.secondaryDivider} />
        <Pressable onPress={onNotInterested} style={styles.secondaryButton} hitSlop={8}>
          <ThumbsDown size={13} strokeWidth={1.8} color={colors.textSecondary} />
          <Text style={styles.secondaryText}>Not interested</Text>
        </Pressable>
      </View>

      {/* Primary — positive actions */}
      <View style={styles.primaryRow}>
        <Pressable
          onPress={onInterested}
          onLongPress={onInterestedLongPress}
          delayLongPress={300}
          style={[styles.primaryButton, styles.interestedButton, saved && styles.interestedActive]}
        >
          <Star
            size={18}
            strokeWidth={1.8}
            color={saved ? colors.primary : colors.foreground}
            fill={saved ? colors.primary : "none"}
          />
          <Text style={[styles.interestedText, saved && styles.interestedTextActive]}>
            Interested
          </Text>
        </Pressable>

        <Pressable
          onPress={onGoing}
          style={[styles.primaryButton, styles.goingButton]}
        >
          {going ? (
            <Check size={18} strokeWidth={2.2} color={colors.white} />
          ) : (
            <CalendarPlus size={18} strokeWidth={1.8} color={colors.white} />
          )}
          <Text style={styles.goingText}>Going</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 10,
    gap: 8,
  },
  secondaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  secondaryText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: "500",
  },
  secondaryDivider: {
    width: StyleSheet.hairlineWidth,
    height: 14,
    backgroundColor: colors.border,
  },
  primaryRow: {
    flexDirection: "row",
    gap: 10,
  },
  primaryButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 52,
    borderRadius: radius.md,
  },
  interestedButton: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  interestedActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  interestedText: {
    ...typography.body,
    fontWeight: "600",
    color: colors.foreground,
  },
  interestedTextActive: {
    color: colors.primary,
  },
  goingButton: {
    backgroundColor: colors.primary,
  },
  goingText: {
    ...typography.body,
    fontWeight: "600",
    color: colors.white,
  },
});

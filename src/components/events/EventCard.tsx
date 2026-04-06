import { useState } from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  Dimensions,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import {
  Bookmark,
  CalendarDays,
  Check,
  DollarSign,
  ExternalLink,
  ImageIcon,
  MapPin,
  Share2,
  Sparkles,
  Ticket,
  X,
} from "lucide-react-native";
import BottomSheet from "@/components/ui/BottomSheet";
import GoingDateSheet from "@/components/events/GoingDateSheet";
import { useToast } from "@/components/ui/Toast";
import { useUser } from "@/context/UserContext";
import { track } from "@/lib/track";
import type { EventCategory, SiftEvent } from "@/types/event";
import { colors, radius, spacing, typography, shadows } from "@/lib/theme";

const SCREEN_WIDTH = Dimensions.get("window").width;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.3;

const INTEREST_TO_CATEGORY: Record<string, EventCategory> = {
  live_music: "music",
  art_exhibitions: "arts",
  theater: "theater",
  workshops: "workshops",
  fitness: "fitness",
  comedy: "comedy",
  food: "food",
  outdoor: "outdoors",
  nightlife: "nightlife",
  popups: "popups",
};

function formatEventDate(event: SiftEvent) {
  if (event.endDate && event.endDate !== event.startDate) {
    return `${event.startDate} – ${event.endDate}`;
  }
  return event.startDate;
}

interface EventCardProps {
  event: SiftEvent;
  onPress: () => void;
  onDismiss: () => void;
  onRequestSignIn?: () => void;
  onBookmarkPress: () => void;
  onSharePress: () => void;
}

export default function EventCard({
  event,
  onPress,
  onDismiss,
  onRequestSignIn,
  onBookmarkPress,
  onSharePress,
}: EventCardProps) {
  const { showToast } = useToast();
  const {
    isLoggedIn,
    userProfile,
    getSavedListForEvent,
    removeSavedEvent,
    toggleGoing,
    isGoing,
  } = useUser();
  const [goingSheetOpen, setGoingSheetOpen] = useState(false);

  const interests = userProfile?.interests ?? [];
  const matchesInterests =
    interests.length > 0 &&
    interests.some((i) => INTEREST_TO_CATEGORY[i] === event.category);

  const savedList = getSavedListForEvent(event.id);
  const going = isGoing(event.id);

  // ── Swipe gesture ────────────────────────────────────────

  const translateX = useSharedValue(0);

  const onSwipeComplete = () => {
    onDismiss();
  };

  const panGesture = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-10, 10])
    .onUpdate((e) => {
      // Only allow swipe left
      if (e.translationX < 0) {
        translateX.value = e.translationX;
      }
    })
    .onEnd((e) => {
      if (e.translationX < -SWIPE_THRESHOLD) {
        translateX.value = withTiming(-SCREEN_WIDTH, { duration: 250 }, () => {
          runOnJS(onSwipeComplete)();
        });
      } else {
        translateX.value = withTiming(0, { duration: 200 });
      }
    });

  const animatedCardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      {
        rotate: `${interpolate(
          translateX.value,
          [-SCREEN_WIDTH, 0],
          [-8, 0],
          Extrapolation.CLAMP
        )}deg`,
      },
    ],
    opacity: interpolate(
      translateX.value,
      [-SCREEN_WIDTH, -SWIPE_THRESHOLD, 0],
      [0, 0.7, 1],
      Extrapolation.CLAMP
    ),
  }));

  // ── Going handler ────────────────────────────────────────

  const isMultiDate = (event.dates && event.dates.length > 1) ||
    (!!event.endDate && event.endDate !== event.startDate);

  const handleGoingPress = () => {
    if (going) {
      toggleGoing({
        eventId: event.id,
        eventTitle: event.title,
        eventDate: event.startDate,
        eventEndDate: event.endDate,
      });
      return;
    }
    if (!isLoggedIn && onRequestSignIn) {
      onRequestSignIn();
      return;
    }
    if (isMultiDate) {
      setGoingSheetOpen(true);
      return;
    }
    toggleGoing({
      eventId: event.id,
      eventTitle: event.title,
      eventDate: event.startDate,
    });
    track("event_going", { event_id: event.id });
    showToast("Marked as going");
  };

  const handleBookmarkPress = () => {
    if (savedList) {
      removeSavedEvent(event.id);
      showToast("Removed from list");
    } else {
      onBookmarkPress();
    }
  };

  // ── Swipe hint (dismiss label behind the card) ───────────

  return (
    <View style={styles.wrapper}>
      {/* Background dismiss hint */}
      <View style={styles.dismissHint}>
        <X size={20} color={colors.textMuted} strokeWidth={1.5} />
        <Text style={styles.dismissHintText}>Skip</Text>
      </View>

      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.card, animatedCardStyle, event.endingSoon && styles.cardEndingSoon]}>
          <Pressable onPress={onPress} style={styles.cardInner}>
            {/* Image */}
            {event.imageUrl ? (
              <Image
                source={{ uri: event.imageUrl }}
                style={styles.image}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.imagePlaceholder}>
                <ImageIcon
                  size={28}
                  strokeWidth={1}
                  color={colors.textMuted}
                />
              </View>
            )}

            {/* Action icons over image */}
            <View style={styles.imageActions}>
              <Pressable
                onPress={handleBookmarkPress}
                style={styles.iconButton}
                hitSlop={8}
              >
                <Bookmark
                  size={16}
                  strokeWidth={1.5}
                  color={savedList ? colors.primary : colors.foreground}
                  fill={savedList ? colors.primary : "none"}
                />
              </Pressable>
              <Pressable
                onPress={onSharePress}
                style={styles.iconButton}
                hitSlop={8}
              >
                <Share2
                  size={16}
                  strokeWidth={1.5}
                  color={colors.foreground}
                />
              </Pressable>
              <Pressable
                onPress={onDismiss}
                style={styles.iconButton}
                hitSlop={8}
              >
                <X
                  size={16}
                  strokeWidth={2}
                  color={colors.textSecondary}
                />
              </Pressable>
            </View>

            {/* Card body */}
            <View style={styles.body}>
              {/* Pills */}
              <View style={styles.pills}>
                <View style={styles.pillCategory}>
                  <Text style={styles.pillCategoryText}>{event.category}</Text>
                </View>
                {event.endingSoon && (
                  <View style={styles.pillEnding}>
                    <Text style={styles.pillEndingText}>
                      Ends in {event.daysLeft}d
                    </Text>
                  </View>
                )}
                {event.price === 0 && (
                  <View style={styles.pillFree}>
                    <Text style={styles.pillFreeText}>Free</Text>
                  </View>
                )}
                {matchesInterests && (
                  <View style={styles.pillForYou}>
                    <Sparkles size={11} strokeWidth={1.5} color={colors.primary} />
                    <Text style={styles.pillForYouText}>For you</Text>
                  </View>
                )}
              </View>

              {/* Title */}
              <Text style={styles.title} numberOfLines={2}>
                {event.title}
              </Text>

              {/* Meta */}
              <View style={styles.meta}>
                <View style={styles.metaRow}>
                  <MapPin size={13} strokeWidth={1.5} color={colors.textSecondary} />
                  <Text style={styles.metaText} numberOfLines={1}>
                    {event.location}
                  </Text>
                </View>
                <View style={styles.metaRow}>
                  <CalendarDays
                    size={13}
                    strokeWidth={1.5}
                    color={colors.textSecondary}
                  />
                  <Text style={styles.metaText}>
                    {formatEventDate(event)}
                  </Text>
                </View>
                <View style={styles.metaRow}>
                  <DollarSign
                    size={13}
                    strokeWidth={1.5}
                    color={colors.textSecondary}
                  />
                  <Text style={styles.metaText}>{event.priceLabel}</Text>
                </View>
              </View>

              {/* Match reason */}
              {event.matchReason && (
                <View style={styles.matchRow}>
                  <Sparkles
                    size={12}
                    strokeWidth={1.5}
                    color={colors.primary}
                  />
                  <Text style={styles.matchText}>{event.matchReason}</Text>
                </View>
              )}
            </View>

            {/* Action buttons */}
            <View style={styles.footer}>
              {event.ticketUrl ? (
                <Pressable
                  onPress={() => {
                    track("ticket_click", { event_id: event.id, ticket_url: event.ticketUrl });
                    if (event.ticketUrl) WebBrowser.openBrowserAsync(event.ticketUrl);
                  }}
                  style={styles.ticketButton}
                >
                  <Ticket size={14} strokeWidth={1.5} color={colors.white} />
                  <Text style={styles.ticketButtonText}>Get tickets</Text>
                </Pressable>
              ) : event.onSaleDate && new Date(event.onSaleDate) > new Date() ? (
                <View style={styles.onSaleBadge}>
                  <Text style={styles.onSaleText}>
                    Tickets drop {new Date(event.onSaleDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </Text>
                </View>
              ) : event.eventUrl ? (
                <Pressable
                  onPress={() => { if (event.eventUrl) WebBrowser.openBrowserAsync(event.eventUrl); }}
                  style={styles.viewEventButton}
                >
                  <ExternalLink size={14} strokeWidth={1.5} color={colors.primary} />
                  <Text style={styles.viewEventText}>View event</Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={handleGoingPress}
                style={[
                  styles.goingButton,
                  going && styles.goingButtonActive,
                ]}
              >
                {going && (
                  <Check size={14} strokeWidth={2} color={colors.white} />
                )}
                <Text
                  style={[
                    styles.goingButtonText,
                    going && styles.goingButtonTextActive,
                  ]}
                >
                  Going
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Animated.View>
      </GestureDetector>
      <BottomSheet
        open={goingSheetOpen}
        onClose={() => setGoingSheetOpen(false)}
        title="Pick a date"
      >
        <GoingDateSheet
          event={event}
          onConfirm={(date) => {
            toggleGoing({
              eventId: event.id,
              eventTitle: event.title,
              eventDate: date,
              eventEndDate: event.endDate,
            });
            setGoingSheetOpen(false);
            track("event_going", { event_id: event.id });
            showToast("Marked as going");
          }}
          onCancel={() => setGoingSheetOpen(false)}
        />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 16,
    position: "relative",
  },
  dismissHint: {
    position: "absolute",
    right: 24,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    gap: 4,
  },
  dismissHintText: {
    ...typography.xs,
    color: colors.textMuted,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    ...shadows.card,
  },
  cardEndingSoon: {
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
  },
  cardInner: {
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: 200,
  },
  imagePlaceholder: {
    width: "100%",
    height: 200,
    backgroundColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  imageActions: {
    position: "absolute",
    top: 12,
    right: 12,
    flexDirection: "row",
    gap: 6,
    zIndex: 2,
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    padding: 16,
  },
  pills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 10,
  },
  pillCategory: {
    backgroundColor: colors.pillCategoryBg,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  pillCategoryText: {
    ...typography.pill,
    color: colors.pillCategoryText,
  },
  pillEnding: {
    backgroundColor: colors.pillEndingBg,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  pillEndingText: {
    ...typography.pill,
    color: colors.pillEndingText,
  },
  pillFree: {
    backgroundColor: colors.pillFreeBg,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  pillFreeText: {
    ...typography.pill,
    color: colors.pillFreeText,
  },
  pillForYou: {
    backgroundColor: colors.primaryLight,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  pillForYouText: {
    ...typography.pill,
    color: colors.primary,
  },
  title: {
    ...typography.h3,
    fontSize: 17,
    lineHeight: 23,
    marginBottom: 10,
  },
  meta: {
    gap: 5,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metaText: {
    ...typography.xs,
    color: colors.textSecondary,
    flex: 1,
  },
  matchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
  },
  matchText: {
    ...typography.xs,
    color: colors.primary,
    fontWeight: "500",
  },
  footer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  ticketButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  ticketButtonText: {
    ...typography.sm,
    fontWeight: "600",
    color: colors.white,
  },
  onSaleBadge: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: "rgba(232, 170, 106, 0.15)",
  },
  onSaleText: {
    ...typography.xs,
    fontWeight: "500",
    color: colors.accent,
  },
  viewEventButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.card,
  },
  viewEventText: {
    ...typography.sm,
    fontWeight: "500",
    color: colors.primary,
  },
  goingButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  goingButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  goingButtonText: {
    ...typography.sm,
    fontWeight: "500",
    color: colors.foreground,
  },
  goingButtonTextActive: {
    color: colors.white,
  },
});

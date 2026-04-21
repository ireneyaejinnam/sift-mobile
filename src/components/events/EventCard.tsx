import { useState } from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  Dimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
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
  Drama,
  Dumbbell,
  ExternalLink,
  Laugh,
  MapPin,
  Moon,
  Music,
  Palette,
  Share2,
  ShoppingBag,
  Sparkles,
  Ticket,
  Trees,
  Utensils,
  Wrench,
  X,
} from "lucide-react-native";
import BottomSheet from "@/components/ui/BottomSheet";
import GoingDateSheet from "@/components/events/GoingDateSheet";
import { useToast } from "@/components/ui/Toast";
import { useUser } from "@/context/UserContext";
import { track } from "@/lib/track";
import type { EventCategory, SiftEvent } from "@/types/event";
import { colors, radius, spacing, typography, shadows } from "@/lib/theme";
import { formatNYCDate } from "@/lib/time";

const SCREEN_WIDTH = Dimensions.get("window").width;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.3;

type CategoryConfig = {
  gradient: [string, string];
  Icon: React.ComponentType<{ size: number; color: string; strokeWidth: number }>;
  chipBg: string;
  chipFg: string;
};

const CATEGORY_CONFIG: Record<string, CategoryConfig> = {
  arts:      { gradient: ["#C9A882", "#8B5E3C"], Icon: Palette,     chipBg: colors.catArtsBg,     chipFg: colors.catArtsFg },
  music:     { gradient: ["#5B8DB8", "#2C4F70"], Icon: Music,        chipBg: colors.catMusicBg,    chipFg: colors.catMusicFg },
  outdoors:  { gradient: ["#5A9E6F", "#2D6644"], Icon: Trees,        chipBg: colors.catOutdoorsBg, chipFg: colors.catOutdoorsFg },
  fitness:   { gradient: ["#C0554A", "#7A2E28"], Icon: Dumbbell,     chipBg: colors.catFitnessBg,  chipFg: colors.catFitnessFg },
  comedy:    { gradient: ["#B8A840", "#6E6020"], Icon: Laugh,        chipBg: colors.catComedyBg,   chipFg: colors.catComedyFg },
  food:      { gradient: ["#C47830", "#7A4810"], Icon: Utensils,     chipBg: colors.catFoodBg,     chipFg: colors.catFoodFg },
  nightlife: { gradient: ["#6B4E9E", "#3A2060"], Icon: Moon,         chipBg: colors.catNightlifeBg, chipFg: colors.catNightlifeFg },
  theater:   { gradient: ["#4A7A9E", "#1E4060"], Icon: Drama,        chipBg: colors.catTheaterBg,  chipFg: colors.catTheaterFg },
  workshops: { gradient: ["#6A9E50", "#304E20"], Icon: Wrench,       chipBg: colors.catWorkshopsBg, chipFg: colors.catWorkshopsFg },
  popups:    { gradient: ["#B87050", "#6A3820"], Icon: ShoppingBag,  chipBg: colors.catPopupsBg,   chipFg: colors.catPopupsFg },
};

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

function formatShortDate(d: string) {
  return formatNYCDate(d, { month: "short", day: "numeric" });
}

function formatEventDate(event: SiftEvent) {
  const sessions = event.sessions;
  if (sessions && sessions.length > 1) {
    const first = sessions[0].startDate;
    const last = sessions[sessions.length - 1].startDate;
    if (first === last) return formatShortDate(first);
    return `${formatShortDate(first)} – ${formatShortDate(last)}`;
  }
  if (event.endDate && event.endDate !== event.startDate) {
    return `${formatShortDate(event.startDate)} – ${formatShortDate(event.endDate)}`;
  }
  return formatShortDate(event.startDate);
}

interface EventCardProps {
  event: SiftEvent;
  onPress: () => void;
  onDismiss: () => void;
  onGoing: () => void;
  onRequestSignIn?: () => void;
  onBookmarkPress: () => void;
  onSharePress: () => void;
}

export default function EventCard({
  event,
  onPress,
  onDismiss,
  onGoing,
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

  const isMultiDate = (event.sessions && event.sessions.length > 1) ||
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

  const translateX = useSharedValue(0);

  const panGesture = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-10, 10])
    .onUpdate((e) => {
      translateX.value = e.translationX;
    })
    .onEnd((e) => {
      if (e.translationX < -SWIPE_THRESHOLD) {
        translateX.value = withTiming(-SCREEN_WIDTH, { duration: 250 }, () => {
          runOnJS(onDismiss)();
        });
      } else if (e.translationX > SWIPE_THRESHOLD) {
        translateX.value = withTiming(SCREEN_WIDTH, { duration: 250 }, () => {
          runOnJS(onGoing)();
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
          [-SCREEN_WIDTH, 0, SCREEN_WIDTH],
          [-8, 0, 8],
          Extrapolation.CLAMP
        )}deg`,
      },
    ],
    opacity: interpolate(
      Math.abs(translateX.value),
      [0, SWIPE_THRESHOLD, SCREEN_WIDTH],
      [1, 0.7, 0],
      Extrapolation.CLAMP
    ),
  }));

  const goingOverlayStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, SWIPE_THRESHOLD], [0, 1], Extrapolation.CLAMP),
  }));

  const skipOverlayStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, -SWIPE_THRESHOLD], [0, 1], Extrapolation.CLAMP),
  }));

  const handleBookmarkPress = () => {
    if (savedList) {
      removeSavedEvent(event.id);
      showToast("Removed from list");
    } else {
      onBookmarkPress();
    }
  };

  const catConfig = CATEGORY_CONFIG[event.category];
  const CategoryIcon = catConfig?.Icon;

  return (
    <View style={styles.wrapper}>
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.card, animatedCardStyle]}>
          <Pressable onPress={onPress} style={styles.cardInner}>
            {/* Going overlay */}
            <Animated.View style={[styles.swipeOverlayLeft, goingOverlayStyle]}>
              <Text style={styles.swipeOverlayTextGoing}>GOING ✓</Text>
            </Animated.View>

            {/* Skip overlay */}
            <Animated.View style={[styles.swipeOverlayRight, skipOverlayStyle]}>
              <Text style={styles.swipeOverlayTextSkip}>SKIP</Text>
            </Animated.View>

            {/* Hero image or gradient placeholder */}
            {event.imageUrl ? (
              <Image
                source={{ uri: event.imageUrl }}
                style={styles.image}
                resizeMode="cover"
              />
            ) : (
              <LinearGradient
                colors={catConfig?.gradient ?? ["#6B7280", "#374151"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.imagePlaceholder}
              >
                {CategoryIcon && (
                  <View style={styles.placeholderIconWrap}>
                    <CategoryIcon size={32} color="rgba(255,255,255,0.9)" strokeWidth={1.5} />
                  </View>
                )}
                <Text style={styles.placeholderTitle} numberOfLines={2}>
                  {event.title}
                </Text>
              </LinearGradient>
            )}

            {/* Action icons over image */}
            <View style={styles.imageActions}>
              <Pressable onPress={handleBookmarkPress} style={styles.iconButton} hitSlop={8}>
                <Bookmark
                  size={16}
                  strokeWidth={1.5}
                  color={savedList ? colors.primary : colors.foreground}
                  fill={savedList ? colors.primary : "none"}
                />
              </Pressable>
              <Pressable onPress={onSharePress} style={styles.iconButton} hitSlop={8}>
                <Share2 size={16} strokeWidth={1.5} color={colors.foreground} />
              </Pressable>
              <Pressable onPress={onDismiss} style={styles.iconButton} hitSlop={8}>
                <X size={16} strokeWidth={2} color={colors.textSecondary} />
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
                  <MapPin size={13} strokeWidth={1.5} color={colors.textMuted} />
                  <Text style={styles.metaText} numberOfLines={1}>
                    {event.location}
                  </Text>
                </View>
                <View style={styles.metaRow}>
                  <CalendarDays size={13} strokeWidth={1.5} color={colors.textMuted} />
                  <Text style={styles.metaText}>{formatEventDate(event)}</Text>
                </View>
                <View style={styles.metaRow}>
                  <DollarSign size={13} strokeWidth={1.5} color={colors.textMuted} />
                  <Text style={styles.metaText}>{event.priceLabel}</Text>
                </View>
              </View>

              {/* Description snippet */}
              {event.description && event.description.length > 40 && (
                <Text style={styles.descriptionSnippet} numberOfLines={2}>
                  {event.description}
                </Text>
              )}

              {/* Match reason */}
              {event.matchReason && (
                <View style={styles.matchRow}>
                  <Sparkles size={12} strokeWidth={1.5} color={colors.primary} />
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
                style={[styles.goingButton, going && styles.goingButtonActive]}
              >
                {going && <Check size={14} strokeWidth={2} color={colors.white} />}
                <Text style={[styles.goingButtonText, going && styles.goingButtonTextActive]}>
                  Going
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Animated.View>
      </GestureDetector>

      <BottomSheet open={goingSheetOpen} onClose={() => setGoingSheetOpen(false)} title="Pick a date">
        <GoingDateSheet
          event={event}
          userProfile={userProfile}
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
  swipeOverlayLeft: {
    position: "absolute",
    top: 20,
    left: 16,
    zIndex: 10,
    borderWidth: 3,
    borderColor: "#34C759",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "rgba(52, 199, 89, 0.15)",
    transform: [{ rotate: "-15deg" }],
  },
  swipeOverlayRight: {
    position: "absolute",
    top: 20,
    right: 16,
    zIndex: 10,
    borderWidth: 3,
    borderColor: "#FF3B30",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "rgba(255, 59, 48, 0.15)",
    transform: [{ rotate: "15deg" }],
  },
  swipeOverlayTextGoing: {
    color: "#34C759",
    fontWeight: "800",
    fontSize: 18,
    letterSpacing: 1,
  },
  swipeOverlayTextSkip: {
    color: "#FF3B30",
    fontWeight: "800",
    fontSize: 18,
    letterSpacing: 1,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    ...shadows.card,
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
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 24,
  },
  placeholderIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "rgba(255,255,255,0.9)",
    textAlign: "center",
    lineHeight: 21,
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
    width: 34,
    height: 34,
    borderRadius: 9999,
    backgroundColor: "rgba(255,255,255,0.92)",
    alignItems: "center",
    justifyContent: "center",
    ...shadows.xs,
  },
  body: {
    padding: 16,
    paddingBottom: 8,
  },
  pills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 10,
  },
  pillCategory: {
    backgroundColor: colors.pillBg,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.pillBorder,
  },
  pillCategoryText: {
    ...typography.pill,
    color: colors.pillFg,
  },
  pillEnding: {
    backgroundColor: colors.warnBg,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.warnBorder,
  },
  pillEndingText: {
    ...typography.pill,
    color: colors.warnFg,
  },
  pillFree: {
    backgroundColor: colors.successBg,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.successBorder,
  },
  pillFreeText: {
    ...typography.pill,
    color: colors.successFg,
  },
  pillForYou: {
    backgroundColor: colors.primaryLight,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.primarySoft,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  pillForYouText: {
    ...typography.pill,
    color: colors.primary,
  },
  descriptionSnippet: {
    ...typography.xs,
    color: colors.textSecondary,
    lineHeight: 18,
    marginTop: 8,
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
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 12,
    gap: 8,
  },
  ticketButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    borderRadius: radius.full,
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
    paddingVertical: 11,
    borderRadius: radius.full,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accent,
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
    paddingVertical: 11,
    borderRadius: radius.full,
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
    paddingVertical: 11,
    borderRadius: radius.full,
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

import { useState, useEffect } from "react";
import {
  Alert,
  View,
  Text,
  Image,
  Linking,
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
  Check,
  ExternalLink,
  Flame,
  MapPin,
  RotateCcw,
  Share2,
  Star,
  Ticket,
} from "lucide-react-native";
import BottomSheet from "@/components/ui/BottomSheet";
import GoingDateSheet from "@/components/events/GoingDateSheet";
import { useToast } from "@/components/ui/Toast";
import { useUser } from "@/context/UserContext";
import { track } from "@/lib/track";
import { generateGoogleCalendarUrl, addToDeviceCalendar } from "@/lib/calendar";
import type { SiftEvent } from "@/types/event";
import { getUnsplashFallback } from "@/lib/unsplashFallback";
import { tuneUpCategory, tuneDownCategory } from "@/lib/tasteProfile";
import { colors, radius, shadows } from "@/lib/theme";
import { formatNYCDate } from "@/lib/time";

const SCREEN_WIDTH = Dimensions.get("window").width;
const SCREEN_HEIGHT = Dimensions.get("window").height;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.3;
const SWIPE_UP_THRESHOLD = 90;

const CATEGORY_STYLE: Record<string, { colors: [string, string]; emoji: string }> = {
  arts:      { colors: ["#C9A882", "#8B5E3C"], emoji: "🎨" },
  music:     { colors: ["#5B8DB8", "#2C4F70"], emoji: "🎵" },
  outdoors:  { colors: ["#5A9E6F", "#2D6644"], emoji: "🌿" },
  fitness:   { colors: ["#C0554A", "#7A2E28"], emoji: "🏃" },
  comedy:    { colors: ["#B8A840", "#6E6020"], emoji: "😂" },
  food:      { colors: ["#C47830", "#7A4810"], emoji: "🍷" },
  nightlife: { colors: ["#6B4E9E", "#3A2060"], emoji: "🌙" },
  theater:   { colors: ["#4A7A9E", "#1E4060"], emoji: "🎭" },
  workshops: { colors: ["#6A9E50", "#304E20"], emoji: "🛠️" },
  popups:    { colors: ["#B87050", "#6A3820"], emoji: "🛍️" },
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
  onUndo?: () => void;
  canUndo?: boolean;
  immersive?: boolean;
  immersiveHeight?: number;
}

export default function EventCard({
  event,
  onPress,
  onDismiss,
  onGoing,
  onRequestSignIn,
  onBookmarkPress,
  onSharePress,
  onUndo,
  canUndo = false,
  immersive = false,
  immersiveHeight,
}: EventCardProps) {
  const { showToast } = useToast();
  const {
    isLoggedIn,
    userProfile,
    getSavedListForEvent,
    removeSavedEvent,
    toggleGoing,
    isGoing,
    markCommitted,
  } = useUser();

  const promptCalendar = (ev: SiftEvent) => {
    Alert.alert("Add to your calendar?", undefined, [
      {
        text: "Google Calendar",
        onPress: () => {
          track("calendar_export", { event_id: ev.id, method: "google" });
          Linking.openURL(generateGoogleCalendarUrl(ev));
        },
      },
      {
        text: "Apple Calendar",
        onPress: async () => {
          track("calendar_export", { event_id: ev.id, method: "apple" });
          const ok = await addToDeviceCalendar(ev);
          if (ok) showToast("Added to calendar");
        },
      },
      { text: "Skip", style: "cancel" },
    ]);
  };
  const calendarEventForDate = (date: string): SiftEvent => ({
    ...event,
    startDate: date,
    endDate: date,
  });
  const [goingSheetOpen, setGoingSheetOpen] = useState(false);
  const [fallbackImage, setFallbackImage] = useState<string | null>(null);
  const [feedbackSheetOpen, setFeedbackSheetOpen] = useState(false);

  useEffect(() => {
    if (!event.imageUrl) {
      getUnsplashFallback(event.category).then(setFallbackImage);
    }
  }, [event.id, event.category, event.imageUrl]);

  const savedList = getSavedListForEvent(event.id);
  const going = isGoing(event.id);

  // ── Going handler ────────────────────────────────────────

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
    promptCalendar(event);
  };

  // ── Swipe gesture ────────────────────────────────────────

  const translateX = useSharedValue(0);

  const onSwipeComplete = () => {
    onDismiss();
  };

  const onSwipeRightComplete = () => {
    onGoing();
  };

  const onSwipeUpComplete = () => {
    onPress();
  };

  const panGesture = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .onUpdate((e) => {
      if (Math.abs(e.translationX) >= Math.abs(e.translationY)) {
        translateX.value = e.translationX;
      }
    })
    .onEnd((e) => {
      const horizontalWins = Math.abs(e.translationX) >= Math.abs(e.translationY);

      if (horizontalWins && e.translationX < -SWIPE_THRESHOLD) {
        translateX.value = withTiming(-SCREEN_WIDTH, { duration: 250 }, () => {
          runOnJS(onSwipeComplete)();
        });
      } else if (horizontalWins && e.translationX > SWIPE_THRESHOLD) {
        translateX.value = withTiming(SCREEN_WIDTH, { duration: 250 }, () => {
          runOnJS(onSwipeRightComplete)();
        });
      } else if (!horizontalWins && e.translationY < -SWIPE_UP_THRESHOLD) {
        translateX.value = withTiming(0, { duration: 120 });
        runOnJS(onSwipeUpComplete)();
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

  const isSiftPick = (event.vibeScore ?? 0) >= 8;
  const isTrending = (event.socialSignal ?? 0) >= 2;
  const showMatchReason =
    isLoggedIn &&
    !!event.matchReason &&
    event.matchReason !== "Picked for you" &&
    event.matchReason !== "More to explore" &&
    event.matchReason !== "It's free";

  // Compact meta line: "venue · date · price"
  const metaLine = [
    event.location,
    formatEventDate(event),
    event.priceLabel,
  ].filter(Boolean).join("  ·  ");

  const resolvedImmersiveHeight =
    immersive && immersiveHeight && immersiveHeight > 0
      ? immersiveHeight
      : undefined;

  return (
    <View style={[styles.wrapper, immersive && styles.wrapperImmersive]}>
      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[
            styles.card,
            immersive && styles.cardImmersive,
            resolvedImmersiveHeight ? { height: resolvedImmersiveHeight } : null,
            animatedCardStyle,
          ]}
        >
          <Pressable onPress={onPress} onLongPress={() => setFeedbackSheetOpen(true)} style={styles.cardInner}>
            {/* ── Image hero ─────────────────────────────── */}
            <View style={[styles.heroContainer, immersive && styles.heroContainerImmersive]}>
              {event.imageUrl || fallbackImage ? (
                <Image
                  source={{ uri: event.imageUrl ?? fallbackImage! }}
                  style={immersive ? styles.imageFill : styles.image}
                  resizeMode="cover"
                />
              ) : (
                <LinearGradient
                  colors={CATEGORY_STYLE[event.category]?.colors ?? ["#6B7280", "#374151"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={immersive ? styles.imagePlaceholderFill : styles.imagePlaceholder}
                >
                  <Text style={styles.placeholderEmoji}>
                    {CATEGORY_STYLE[event.category]?.emoji ?? "📍"}
                  </Text>
                </LinearGradient>
              )}

              {/* Swipe overlays */}
              <Animated.View style={[styles.swipeOverlayLeft, goingOverlayStyle]}>
                <Text style={styles.swipeOverlayTextGoing}>GOING ✓</Text>
              </Animated.View>
              <Animated.View style={[styles.swipeOverlayRight, skipOverlayStyle]}>
                <Text style={styles.swipeOverlayTextSkip}>SKIP</Text>
              </Animated.View>

              {/* Pills — overlaid top-left */}
              <View style={styles.pillsOverlay}>
                <View style={styles.pillGlass}>
                  <Text style={styles.pillGlassText}>{event.category}</Text>
                </View>
                {event.endingSoon && (
                  <View style={[styles.pillGlass, styles.pillEnding]}>
                    <Text style={[styles.pillGlassText, styles.pillEndingText]}>
                      Ends in {event.daysLeft}d
                    </Text>
                  </View>
                )}
                {event.price === 0 && (
                  <View style={[styles.pillGlass, styles.pillFree]}>
                    <Text style={[styles.pillGlassText, styles.pillFreeText]}>Free</Text>
                  </View>
                )}
                {isTrending && (
                  <View style={[styles.pillGlass, styles.pillTrending]}>
                    <Flame size={9} color="#FF6B35" fill="#FF6B35" strokeWidth={0} />
                    <Text style={[styles.pillGlassText, styles.pillTrendingText]}>Trending</Text>
                  </View>
                )}
              </View>

              {/* Actions — overlaid top-right. Undo is the rightmost icon
                  when available (first thing the eye hits on the right). */}
              <View style={styles.imageActions}>
                <Pressable onPress={handleBookmarkPress} style={styles.iconButton} hitSlop={8}>
                  <Bookmark
                    size={16}
                    strokeWidth={1.5}
                    color={savedList ? colors.primary : "#fff"}
                    fill={savedList ? colors.primary : "none"}
                  />
                </Pressable>
                <Pressable onPress={onSharePress} style={styles.iconButton} hitSlop={8}>
                  <Share2 size={16} strokeWidth={1.5} color="#fff" />
                </Pressable>
                {canUndo && onUndo && (
                  <Pressable onPress={onUndo} style={styles.iconButton} hitSlop={8}>
                    <RotateCcw size={16} strokeWidth={1.5} color="#fff" />
                  </Pressable>
                )}
              </View>

              {/* Title + meta overlaid on gradient at bottom of image */}
              <LinearGradient
                colors={["transparent", "rgba(0,0,0,0.75)"]}
                style={styles.heroGradient}
              >
                <Text style={styles.heroTitle} numberOfLines={2}>
                  {event.title}
                </Text>
                <View style={styles.heroMeta}>
                  <MapPin size={12} strokeWidth={1.5} color="rgba(255,255,255,0.8)" />
                  <Text style={styles.heroMetaText} numberOfLines={1}>
                    {metaLine}
                  </Text>
                </View>
              </LinearGradient>
            </View>

            {/* ── Body: description hook + CTA ───────────── */}
            <View style={[styles.body, immersive && styles.bodyImmersive]}>
              {(event.hookText || (event.description && event.description.length > 30)) && (
                <Text style={styles.hookText}>
                  {event.hookText ?? event.description}
                </Text>
              )}
              {showMatchReason && (
                <View style={styles.matchChip}>
                  <Text style={styles.matchChipText}>
                    ✦ {event.matchReason}
                  </Text>
                </View>
              )}

              <View style={styles.footer}>
                {event.ticketUrl ? (
                  <Pressable
                    onPress={() => {
                      track("ticket_click", { event_id: event.id, ticket_url: event.ticketUrl });
                      if (event.ticketUrl) WebBrowser.openBrowserAsync(event.ticketUrl);
                      markCommitted(event.id);
                    }}
                    style={styles.ctaButton}
                  >
                    <Ticket size={14} strokeWidth={1.5} color={colors.white} />
                    <Text style={styles.ctaButtonText}>Get tickets</Text>
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
                    style={styles.ctaButtonOutline}
                  >
                    <ExternalLink size={14} strokeWidth={1.5} color={colors.primary} />
                    <Text style={styles.ctaButtonOutlineText}>View event</Text>
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
            </View>
          </Pressable>
        </Animated.View>
      </GestureDetector>
      <BottomSheet
        open={feedbackSheetOpen}
        onClose={() => setFeedbackSheetOpen(false)}
        title="Tune your taste"
      >
        <View style={styles.feedbackSheet}>
          <Pressable
            onPress={() => {
              tuneUpCategory(event.category).catch(() => {});
              setFeedbackSheetOpen(false);
              showToast("Got it — more like this");
            }}
            style={styles.feedbackOption}
          >
            <Text style={styles.feedbackOptionText}>More like this</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              tuneDownCategory(event.category).catch(() => {});
              setFeedbackSheetOpen(false);
              showToast("Got it — less of this");
            }}
            style={[styles.feedbackOption, styles.feedbackOptionNeg]}
          >
            <Text style={[styles.feedbackOptionText, styles.feedbackOptionTextNeg]}>Not my thing</Text>
          </Pressable>
        </View>
      </BottomSheet>
      <BottomSheet
        open={goingSheetOpen}
        onClose={() => setGoingSheetOpen(false)}
        title="Pick a date"
      >
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
            promptCalendar(calendarEventForDate(date));
          }}
          onCancel={() => setGoingSheetOpen(false)}
        />
      </BottomSheet>
    </View>
  );
}

const IMAGE_HEIGHT = 340;

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 20,
    position: "relative",
  },
  wrapperImmersive: {
    marginBottom: 0,
    flex: 1,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    overflow: "hidden",
    ...shadows.card,
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  cardImmersive: {
    flex: 1,
    minHeight: 0,
  },
  cardInner: {
    overflow: "hidden",
    flex: 1,
  },

  // ── Hero image section ──────────────────────────────────
  heroContainer: {
    position: "relative",
    width: "100%",
    height: IMAGE_HEIGHT,
  },
  heroContainerImmersive: {
    height: undefined,
    flex: 1,
    minHeight: 180,
  },
  image: {
    width: "100%",
    height: IMAGE_HEIGHT,
  },
  imageFill: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  imagePlaceholder: {
    width: "100%",
    height: IMAGE_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  imagePlaceholderFill: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderEmoji: {
    fontSize: 48,
    lineHeight: 56,
  },

  // ── Swipe overlays ──────────────────────────────────────
  swipeOverlayLeft: {
    position: "absolute",
    top: 60,
    left: 20,
    zIndex: 10,
    borderWidth: 3,
    borderColor: "#34C759",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: "rgba(52, 199, 89, 0.2)",
    transform: [{ rotate: "-15deg" }],
  },
  swipeOverlayRight: {
    position: "absolute",
    top: 60,
    right: 20,
    zIndex: 10,
    borderWidth: 3,
    borderColor: "#FF3B30",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: "rgba(255, 59, 48, 0.2)",
    transform: [{ rotate: "15deg" }],
  },
  swipeOverlayTextGoing: {
    color: "#34C759",
    fontWeight: "800",
    fontSize: 22,
    letterSpacing: 1.5,
  },
  swipeOverlayTextSkip: {
    color: "#FF3B30",
    fontWeight: "800",
    fontSize: 22,
    letterSpacing: 1.5,
  },

  // ── Pills overlaid on image ─────────────────────────────
  pillsOverlay: {
    position: "absolute",
    top: 14,
    left: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    zIndex: 2,
    maxWidth: "68%",
  },
  pillGlass: {
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.full,
  },
  pillGlassText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#fff",
    textTransform: "capitalize",
    letterSpacing: 0.3,
  },
  pillEnding: {
    backgroundColor: "rgba(200,60,60,0.7)",
  },
  pillEndingText: {
    color: "#fff",
  },
  pillFree: {
    backgroundColor: "rgba(34,139,34,0.6)",
  },
  pillFreeText: {
    color: "#fff",
  },
  pillSiftPick: {
    backgroundColor: "rgba(245,200,66,0.25)",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  pillSiftPickText: {
    color: "#F5C842",
  },
  pillTrending: {
    backgroundColor: "rgba(255,107,53,0.25)",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  pillTrendingText: {
    color: "#FF8C5A",
  },

  // ── Action icons overlaid top-right ─────────────────────
  imageActions: {
    position: "absolute",
    top: 14,
    right: 14,
    flexDirection: "row",
    gap: 8,
    zIndex: 2,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 9999,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },

  // ── Title + meta gradient overlay ───────────────────────
  heroGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#fff",
    lineHeight: 28,
    marginBottom: 6,
    textShadowColor: "rgba(0,0,0,0.3)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  heroMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  heroMetaText: {
    fontSize: 13,
    color: "rgba(255,255,255,0.85)",
    fontWeight: "500",
    flex: 1,
  },

  // ── Body (below image) ──────────────────────────────────
  body: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
  },
  bodyImmersive: {
    flexShrink: 0,
  },
  hookText: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.foreground,
    marginBottom: 10,
  },
  matchChip: {
    alignSelf: "flex-start",
    backgroundColor: colors.primaryLight,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.full,
    marginBottom: 12,
  },
  matchChipText: {
    fontSize: 12,
    fontWeight: "500",
    color: colors.primary,
    lineHeight: 16,
  },
  feedbackSheet: {
    padding: 16,
    gap: 10,
  },
  feedbackOption: {
    backgroundColor: colors.primaryLight,
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: "center",
  },
  feedbackOptionNeg: {
    backgroundColor: colors.muted,
  },
  feedbackOptionText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.primary,
  },
  feedbackOptionTextNeg: {
    color: colors.textSecondary,
  },

  // ── Footer CTA ─────────────────────────────────────────
  footer: {
    flexDirection: "row",
    gap: 10,
  },
  ctaButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  ctaButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.white,
  },
  ctaButtonOutline: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.card,
  },
  ctaButtonOutlineText: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.primary,
  },
  onSaleBadge: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: "rgba(232, 170, 106, 0.15)",
  },
  onSaleText: {
    fontSize: 12,
    fontWeight: "500",
    color: colors.accent,
  },
  goingButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
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
    fontSize: 14,
    fontWeight: "500",
    color: colors.foreground,
  },
  goingButtonTextActive: {
    color: colors.white,
  },
});

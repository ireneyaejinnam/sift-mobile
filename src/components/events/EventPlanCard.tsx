import { useEffect, useState } from "react";
import { View, Text, Image, Pressable, StyleSheet } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { ScaleDecorator } from "react-native-draggable-flatlist";
import { Check, Trash2 } from "lucide-react-native";
import { getUnsplashFallback } from "@/lib/unsplashFallback";
import { colors, radius, typography, shadows } from "@/lib/theme";
import type { SiftEvent } from "@/types/event";
import { useUser } from "@/context/UserContext";

const SWIPE_DELETE_THRESHOLD = 88;

export default function EventPlanCard({
  event,
  onPress,
  onRemove,
  drag,
  isActive,
}: {
  event: SiftEvent;
  onPress: () => void;
  onRemove?: () => void;
  drag?: () => void;
  isActive?: boolean;
}) {
  const { getGoingEvent } = useUser();
  const goingEvent = getGoingEvent(event.id);
  const [fallbackImage, setFallbackImage] = useState<string | null>(null);
  const translateX = useSharedValue(0);

  useEffect(() => {
    if (!event.imageUrl) {
      getUnsplashFallback(event.category).then(setFallbackImage);
    }
  }, [event.id, event.category, event.imageUrl]);

  const imgSrc = event.imageUrl ?? fallbackImage;

  const swipeGesture = Gesture.Pan()
    .enabled(!!onRemove)
    .activeOffsetX([-16, 16])
    .failOffsetY([-10, 10])
    .onUpdate((e) => {
      if (e.translationX < 0) {
        translateX.value = e.translationX;
      }
    })
    .onEnd((e) => {
      if (e.translationX < -SWIPE_DELETE_THRESHOLD && onRemove) {
        translateX.value = withTiming(-220, { duration: 180 }, () => {
          runOnJS(onRemove)();
        });
      } else {
        translateX.value = withTiming(0, { duration: 180 });
      }
    });

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const deleteBgAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [-SWIPE_DELETE_THRESHOLD, 0],
      [1, 0],
      Extrapolation.CLAMP
    ),
  }));

  const content = (
    <View style={sc.swipeWrap}>
      {onRemove ? (
        <Animated.View style={[sc.deleteBg, deleteBgAnimatedStyle]}>
          <Trash2 size={16} strokeWidth={1.8} color={colors.white} />
          <Text style={sc.deleteBgText}>Remove</Text>
        </Animated.View>
      ) : null}
      <Animated.View style={cardAnimatedStyle}>
        <View style={[sc.card, isActive && sc.cardActive]}>
          <Pressable style={sc.cardMain} onPress={onPress} onLongPress={drag} delayLongPress={200}>
            {imgSrc ? (
              <Image source={{ uri: imgSrc }} style={sc.thumb} />
            ) : (
              <View style={sc.thumbPlaceholder} />
            )}
            <View style={sc.titleRow}>
              <Text style={sc.cardTitle} numberOfLines={2}>{event.title}</Text>
              {goingEvent?.committed && (
                <View style={sc.committedBadge}>
                  <Check size={9} strokeWidth={2.5} color={colors.white} />
                </View>
              )}
            </View>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );

  const wrappedContent = onRemove ? (
    <GestureDetector gesture={swipeGesture}>{content}</GestureDetector>
  ) : content;

  if (drag) {
    return <ScaleDecorator>{wrappedContent}</ScaleDecorator>;
  }

  return wrappedContent;
}

const sc = StyleSheet.create({
  swipeWrap: {
    position: "relative",
    marginBottom: 8,
  },
  deleteBg: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: 112,
    borderRadius: radius.md,
    backgroundColor: "#D06B63",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  deleteBgText: {
    ...typography.xs,
    color: colors.white,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    ...shadows.card,
  },
  cardActive: {
    opacity: 0.9,
    borderColor: colors.primary,
  },
  cardMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  thumb: {
    width: 64,
    height: 64,
  },
  thumbPlaceholder: {
    width: 64,
    height: 64,
    backgroundColor: colors.border,
  },
  titleRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingRight: 8,
  },
  cardTitle: {
    ...typography.body,
    fontWeight: "500",
    color: colors.foreground,
    flex: 1,
  },
  committedBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
});

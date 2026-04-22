import { useState, useEffect, useRef } from "react";
import {
  Modal,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import Animated, {
  cancelAnimation,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
  Easing,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { colors, radius, typography } from "@/lib/theme";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

const DISMISS_THRESHOLD = 100;
const DISMISS_VELOCITY = 800;
const OFFSCREEN = 600;

export default function BottomSheet({
  open,
  onClose,
  title,
  children,
}: BottomSheetProps) {
  const [visible, setVisible] = useState(false);
  const animationCycleRef = useRef(0);
  const translateY = useSharedValue(OFFSCREEN);
  const dragY = useSharedValue(0);
  const backdropOpacity = useSharedValue(0);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value + dragY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  useEffect(() => {
    animationCycleRef.current += 1;
    const cycle = animationCycleRef.current;
    cancelAnimation(translateY);
    cancelAnimation(dragY);
    cancelAnimation(backdropOpacity);

    if (open) {
      translateY.value = OFFSCREEN;
      dragY.value = 0;
      backdropOpacity.value = 0;
      setVisible(true);
      translateY.value = withTiming(0, {
        duration: 280,
        easing: Easing.out(Easing.cubic),
      });
      backdropOpacity.value = withTiming(1, { duration: 220 });
    } else {
      dragY.value = 0;
      translateY.value = withTiming(OFFSCREEN, {
        duration: 220,
        easing: Easing.in(Easing.cubic),
      });
      backdropOpacity.value = withTiming(0, { duration: 200 }, (finished) => {
        if (finished && cycle === animationCycleRef.current) {
          runOnJS(setVisible)(false);
        }
      });
    }
  }, [open]);

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      // Only allow dragging downward
      dragY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      const drag = dragY.value;
      if (drag > DISMISS_THRESHOLD || e.velocityY > DISMISS_VELOCITY) {
        // Absorb current drag offset into translateY so the slide starts from
        // the exact visual position the user released at — no jump
        translateY.value = translateY.value + drag;
        dragY.value = 0;
        translateY.value = withTiming(
          OFFSCREEN,
          { duration: 220, easing: Easing.in(Easing.cubic) },
          () => {
            runOnJS(setVisible)(false);
            runOnJS(onClose)();
          }
        );
        backdropOpacity.value = withTiming(0, { duration: 200 });
      } else {
        // Snap back
        dragY.value = withSpring(0, { damping: 20, stiffness: 300 });
      }
    });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <TouchableWithoutFeedback onPress={onClose}>
          <Animated.View style={[styles.backdrop, backdropStyle]} />
        </TouchableWithoutFeedback>
        <Animated.View style={[styles.sheet, sheetStyle]}>
          <GestureDetector gesture={panGesture}>
            <View style={styles.handleContainer}>
              <View style={styles.handle} />
            </View>
          </GestureDetector>
          <View>
            {title && (
              <View style={styles.titleRow}>
                <Text style={styles.title}>{title}</Text>
              </View>
            )}
            <View style={styles.body}>{children}</View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "transparent",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingBottom: 40,
  },
  handleContainer: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 4,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  titleRow: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  title: {
    ...typography.body,
    fontWeight: "600",
    color: colors.foreground,
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
});

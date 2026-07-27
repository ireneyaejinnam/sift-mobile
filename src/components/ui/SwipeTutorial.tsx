import { useEffect, useState } from "react";
import { Modal, View, Text, Pressable, StyleSheet } from "react-native";
import {
  ArrowRight,
  ArrowLeft,
  ArrowDown,
  Hand,
  SlidersHorizontal,
  Star,
  type LucideIcon,
} from "lucide-react-native";
import { hasGestureTipSeen, setGestureTipSeen } from "@/lib/storage";
import { colors, radius, typography } from "@/lib/theme";

interface Step {
  Icon: LucideIcon;
  tint: string;
  title: string;
  detail: string;
}

const STEPS: Step[] = [
  { Icon: ArrowRight, tint: "#2D6644", title: "Swipe right — Going", detail: "Swipe right on events you want to attend. They land on your Plan." },
  { Icon: ArrowLeft, tint: colors.textSecondary, title: "Swipe left — Not now", detail: "Not feeling it right now? Swipe left. It won't affect your taste." },
  { Icon: ArrowDown, tint: "#C83C3C", title: "Swipe down — Not interested", detail: "Swipe down and we'll show you fewer events like it." },
  { Icon: Hand, tint: colors.primary, title: "Tap for details", detail: "Tap a card to see the full event — location, time, and tickets." },
  { Icon: SlidersHorizontal, tint: colors.primary, title: "Press & hold to tune", detail: "Long-press a card to tell us 'more like this' or 'not my thing'." },
  { Icon: Star, tint: colors.primary, title: "Prefer buttons?", detail: "Use the Interested and Going buttons below the card. 'Go back' undoes your last swipe." },
];

/**
 * Forced, step-by-step first-run tutorial for the swipe deck. Unlike the old
 * static hint list, the user must press Next through every step — there's no
 * dismiss until the end. Shown once (persisted via `sift_gesture_tip_seen`),
 * only when a live card is on screen so the steps have context.
 */
export default function SwipeTutorial({ show }: { show: boolean }) {
  const [seen, setSeen] = useState<boolean | null>(null);
  const [step, setStep] = useState(0);

  useEffect(() => {
    hasGestureTipSeen().then(setSeen);
  }, []);

  // Only render when definitively not-yet-seen AND a card is present.
  if (seen !== false || !show) return null;

  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];
  const { Icon } = current;

  const finish = () => {
    setSeen(true);
    setGestureTipSeen();
  };

  return (
    <Modal transparent animationType="fade" visible>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={[styles.iconWrap, { backgroundColor: `${current.tint}1A` }]}>
            <Icon size={30} strokeWidth={2} color={current.tint} />
          </View>
          <Text style={styles.title}>{current.title}</Text>
          <Text style={styles.detail}>{current.detail}</Text>

          <View style={styles.dots}>
            {STEPS.map((_, i) => (
              <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
            ))}
          </View>

          <Pressable
            onPress={() => (isLast ? finish() : setStep((s) => s + 1))}
            style={styles.nextButton}
          >
            <Text style={styles.nextText}>{isLast ? "Got it" : "Next"}</Text>
          </Pressable>
          <Pressable onPress={finish} style={styles.skipButton} hitSlop={8}>
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>
          <Text style={styles.stepCount}>
            {step + 1} of {STEPS.length}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
  },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  title: {
    ...typography.h3,
    fontSize: 18,
    textAlign: "center",
    marginBottom: 8,
  },
  detail: {
    ...typography.sm,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 21,
    marginBottom: 20,
  },
  dots: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 20,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  dotActive: {
    backgroundColor: colors.primary,
    width: 20,
  },
  nextButton: {
    alignSelf: "stretch",
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: "center",
  },
  nextText: {
    ...typography.body,
    fontWeight: "700",
    color: colors.white,
  },
  skipButton: {
    marginTop: 12,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  skipText: {
    ...typography.sm,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  stepCount: {
    ...typography.xs,
    color: colors.textMuted,
    marginTop: 8,
  },
});

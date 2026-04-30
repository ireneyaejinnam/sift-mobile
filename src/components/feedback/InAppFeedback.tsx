import { useEffect, useState, useCallback } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Pressable,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { track } from "@/lib/track";
import { colors } from "@/lib/theme";

const FIRST_USE_KEY = "sift_first_use_ts";
const FEEDBACK_DONE_KEY = "sift_feedback_submitted";
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// TODO: Replace with real Tally form URL or alternative feedback link
const FEEDBACK_FORM_URL: string | null = null;

type Rating = "loving_it" | "mixed" | "not_for_me";

const RATINGS: { value: Rating; label: string }[] = [
  { value: "loving_it", label: "Loving it" },
  { value: "mixed", label: "Mixed feelings" },
  { value: "not_for_me", label: "Not for me" },
];

export function InAppFeedback() {
  const [visible, setVisible] = useState(false);
  const [selectedRating, setSelectedRating] = useState<Rating | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    checkEligibility();
  }, []);

  async function checkEligibility() {
    try {
      const done = await AsyncStorage.getItem(FEEDBACK_DONE_KEY);
      if (done) return;

      const firstUse = await AsyncStorage.getItem(FIRST_USE_KEY);
      if (!firstUse) {
        // First time — record timestamp, don't show yet
        await AsyncStorage.setItem(FIRST_USE_KEY, Date.now().toString());
        return;
      }

      const elapsed = Date.now() - parseInt(firstUse, 10);
      if (elapsed >= SEVEN_DAYS_MS) {
        setVisible(true);
      }
    } catch {
      // Never break the app for feedback
    }
  }

  const handleRating = useCallback((rating: Rating) => {
    setSelectedRating(rating);
    track("feedback_submitted", {
      rating,
      comment_provided: false,
    });
    setSubmitted(true);
    AsyncStorage.setItem(FEEDBACK_DONE_KEY, "true").catch(() => {});
  }, []);

  const handleTellUsMore = useCallback(() => {
    if (!FEEDBACK_FORM_URL) return;
    track("feedback_submitted", {
      rating: selectedRating,
      comment_provided: true,
    });
    Linking.openURL(FEEDBACK_FORM_URL).catch(() => {});
    setVisible(false);
  }, [selectedRating]);

  const handleDismiss = useCallback(() => {
    // Mark as done so it doesn't keep re-appearing
    AsyncStorage.setItem(FEEDBACK_DONE_KEY, "true").catch(() => {});
    setVisible(false);
  }, []);

  if (!visible) return null;

  return (
    <Modal transparent animationType="fade" visible={visible}>
      <Pressable style={styles.backdrop} onPress={handleDismiss}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={handleDismiss}
            hitSlop={12}
          >
            <Text style={styles.closeText}>X</Text>
          </TouchableOpacity>

          {!submitted ? (
            <>
              <Text style={styles.title}>How is Sift working for you?</Text>
              <Text style={styles.subtitle}>
                Your feedback helps us build a better app.
              </Text>
              <View style={styles.options}>
                {RATINGS.map((r) => (
                  <TouchableOpacity
                    key={r.value}
                    style={styles.optionButton}
                    onPress={() => handleRating(r.value)}
                  >
                    <Text style={styles.optionText}>{r.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          ) : (
            <>
              <Text style={styles.title}>Thanks for your feedback!</Text>
              {FEEDBACK_FORM_URL ? (
                <TouchableOpacity
                  style={styles.tellUsMore}
                  onPress={handleTellUsMore}
                >
                  <Text style={styles.tellUsMoreText}>
                    Tell us more (opens form)
                  </Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={styles.doneButton}
                onPress={handleDismiss}
              >
                <Text style={styles.doneText}>Done</Text>
              </TouchableOpacity>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "center",
    alignItems: "center",
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 24,
    marginHorizontal: 32,
    width: "85%",
    maxWidth: 340,
    position: "relative",
  },
  closeButton: {
    position: "absolute",
    top: 12,
    right: 16,
    zIndex: 1,
  },
  closeText: {
    fontSize: 16,
    color: colors.textMuted,
    fontWeight: "600",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
    textAlign: "center",
    marginBottom: 6,
    marginTop: 4,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: 20,
  },
  options: {
    gap: 10,
  },
  optionButton: {
    backgroundColor: colors.muted,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  optionText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  tellUsMore: {
    marginTop: 16,
    alignItems: "center",
  },
  tellUsMoreText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  doneButton: {
    marginTop: 16,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  doneText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.white,
  },
});

import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft } from "lucide-react-native";
import { useUser } from "@/context/UserContext";
import { setOnboardingDoneFlag } from "@/lib/storage";
import { track } from "@/lib/track";
import {
  BOROUGHS,
  BOROUGHS_NEIGHBORHOODS,
  TRAVEL_RANGES,
} from "@/data/locations";
import type { UserProfile } from "@/types/user";
import { colors, spacing, radius, typography } from "@/lib/theme";

// ── Option data (same as web) ───────────────────────────────

const INTEREST_OPTIONS = [
  { value: "live_music", label: "Live music & concerts" },
  { value: "art_exhibitions", label: "Art exhibitions & galleries" },
  { value: "popups", label: "Pop-ups & sample sales" },
  { value: "outdoor", label: "Outdoor activities & day trips" },
  { value: "fitness", label: "Fitness classes & run clubs" },
  { value: "comedy", label: "Comedy & shows" },
  { value: "food", label: "Food events & tastings" },
  { value: "nightlife", label: "Nightlife & bars" },
  { value: "theater", label: "Theater & performances" },
  { value: "workshops", label: "Workshops & classes" },
];

const VIBE_OPTIONS = [
  { value: "hidden_gems", label: "Show me the hidden gems" },
  { value: "popular_spots", label: "I like popular spots" },
  { value: "surprise_me", label: "Surprise me" },
];

const BUDGET_OPTIONS = [
  { value: "free", label: "Free only" },
  { value: "under_20", label: "Under $20" },
  { value: "under_50", label: "Under $50" },
  { value: "no_limit", label: "No limit" },
];

const DAYS = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" },
];

const TIMES = [
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "evening", label: "Evening" },
  { value: "late_night", label: "Late night" },
];

// ── Pill component ──────────────────────────────────────────

function Pill({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.pill, selected && styles.pillSelected]}
    >
      <Text style={[styles.pillText, selected && styles.pillTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

// ── Option card ─────────────────────────────────────────────

function OptionRow({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.optionRow, selected && styles.optionRowSelected]}
    >
      <Text
        style={[
          styles.optionRowText,
          selected && styles.optionRowTextSelected,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ── Main component ──────────────────────────────────────────

export default function OnboardingFlow() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { setUserProfile, userProfile, isLoggedIn } = useUser();

  // Onboarding is for logged-in users only
  if (!isLoggedIn) {
    router.replace("/(auth)/signin");
    return null;
  }
  const [step, setStep] = useState(1);
  const [initialized, setInitialized] = useState(false);
  const [profile, setProfile] = useState<Partial<UserProfile>>({
    interests: [],
    borough: "",
    neighborhood: "",
    travelRange: "",
    vibe: "",
    budget: "",
    freeDays: [],
    freeTime: [],
  });
  const [showConfirmation, setShowConfirmation] = useState(false);

  // Fire onboarding_started once on mount
  useEffect(() => {
    track("onboarding_started");
  }, []);

  // Initialize from stored profile if editing
  useEffect(() => {
    if (initialized || !userProfile) return;
    setProfile({
      interests: userProfile.interests ?? [],
      borough: userProfile.borough ?? "",
      neighborhood: userProfile.neighborhood ?? "",
      travelRange: userProfile.travelRange ?? "",
      vibe: userProfile.vibe ?? "",
      budget: userProfile.budget ?? "",
      freeDays: userProfile.freeDays ?? [],
      freeTime: userProfile.freeTime ?? [],
    });
    setInitialized(true);
  }, [userProfile, initialized]);

  const neighborhoods = profile.borough
    ? BOROUGHS_NEIGHBORHOODS[profile.borough] ?? []
    : [];

  const toggleArray = useCallback(
    (key: "interests" | "freeDays" | "freeTime", value: string) => {
      setProfile((p) => {
        const arr = (p[key] as string[]) ?? [];
        const has = arr.includes(value);
        return {
          ...p,
          [key]: has ? arr.filter((x) => x !== value) : [...arr, value],
        };
      });
    },
    []
  );

  const handleFinish = useCallback(() => {
    const full: UserProfile = {
      interests: profile.interests ?? [],
      borough: profile.borough ?? "",
      neighborhood: profile.neighborhood ?? "",
      travelRange: profile.travelRange ?? "",
      vibe: profile.vibe ?? "",
      budget: profile.budget ?? "",
      freeDays: profile.freeDays ?? [],
      freeTime: profile.freeTime ?? [],
    };
    setUserProfile(full);
    setOnboardingDoneFlag();
    track("onboarding_step_4_complete", {
      free_days: full.freeDays,
      free_times: full.freeTime,
    });
    track("onboarding_complete", {
      interests: full.interests,
      borough: full.borough,
      budget: full.budget,
    });
    setShowConfirmation(true);
  }, [profile, setUserProfile]);

  const handleBack = () => {
    if (step === 1) {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace("/(auth)/gate");
      }
    } else {
      setStep((s) => Math.max(1, s - 1));
    }
  };

  // ── Confirmation screen ───────────────────────────────────

  if (showConfirmation) {
    return (
      <View style={styles.confirmContainer}>
        <Text style={styles.confirmHeading}>You're all set.</Text>
        <Text style={styles.confirmSub}>Let's find something good.</Text>
        <Pressable
          onPress={() => router.replace("/(tabs)/discover")}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.primaryButtonPressed,
          ]}
        >
          <Text style={styles.primaryButtonText}>Discover events</Text>
        </Pressable>
      </View>
    );
  }

  // ── Progress bar ──────────────────────────────────────────

  const progressPct = (step / 4) * 100;

  return (
    <View style={styles.container}>
      {/* Progress */}
      <View style={[styles.progressTrack, { marginTop: insets.top + 8 }]}>
        <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
      </View>

      {/* Back button */}
      <View style={styles.backRow}>
        <Pressable onPress={handleBack} style={styles.backButton}>
          <ArrowLeft size={16} color={colors.foreground} strokeWidth={1.5} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Step 1: Interests ─────────────────────── */}
        {step === 1 && (
          <View>
            <Text style={styles.heading}>What are you into?</Text>
            <Text style={styles.subtitle}>
              Select at least 2. Tap to toggle.
            </Text>
            <View style={styles.pillGrid}>
              {INTEREST_OPTIONS.map((opt) => (
                <Pill
                  key={opt.value}
                  label={opt.label}
                  selected={(profile.interests ?? []).includes(opt.value)}
                  onPress={() => toggleArray("interests", opt.value)}
                />
              ))}
            </View>
            <Pressable
              onPress={() => {
                track("onboarding_step_1_complete", {
                  interests_count: (profile.interests ?? []).length,
                  interests: profile.interests ?? [],
                });
                setStep(2);
              }}
              disabled={(profile.interests ?? []).length < 2}
              style={[
                styles.primaryButton,
                styles.fullWidth,
                { marginTop: 32 },
                (profile.interests ?? []).length < 2 &&
                  styles.primaryButtonDisabled,
              ]}
            >
              <Text style={styles.primaryButtonText}>Next</Text>
            </Pressable>
          </View>
        )}

        {/* ── Step 2: Location ──────────────────────── */}
        {step === 2 && (
          <View>
            <Text style={styles.heading}>Where in NYC are you?</Text>
            <Text style={styles.subtitle}>Borough</Text>
            <View style={styles.pillGrid}>
              {BOROUGHS.map((b) => (
                <Pill
                  key={b}
                  label={b}
                  selected={profile.borough === b}
                  onPress={() =>
                    setProfile((p) => ({
                      ...p,
                      borough: b,
                      neighborhood: "",
                    }))
                  }
                />
              ))}
            </View>

            {profile.borough ? (
              <>
                <Text style={[styles.subtitle, { marginTop: 24 }]}>
                  Neighborhood
                </Text>
                <View style={styles.pillGrid}>
                  {neighborhoods.map((n) => (
                    <Pill
                      key={n}
                      label={n}
                      selected={profile.neighborhood === n}
                      onPress={() =>
                        setProfile((p) => ({ ...p, neighborhood: n }))
                      }
                    />
                  ))}
                </View>
              </>
            ) : null}

            <Text style={[styles.subtitle, { marginTop: 24 }]}>
              How far will you travel?
            </Text>
            <View style={styles.pillGrid}>
              {TRAVEL_RANGES.map((r) => (
                <Pill
                  key={r.value}
                  label={r.label}
                  selected={profile.travelRange === r.value}
                  onPress={() =>
                    setProfile((p) => ({ ...p, travelRange: r.value }))
                  }
                />
              ))}
            </View>

            <Pressable
              onPress={() => {
                track("onboarding_step_2_complete", {
                  borough: profile.borough,
                  neighborhood: profile.neighborhood,
                  travel_range: profile.travelRange,
                });
                setStep(3);
              }}
              style={[styles.primaryButton, styles.fullWidth, { marginTop: 32 }]}
            >
              <Text style={styles.primaryButtonText}>Next</Text>
            </Pressable>
          </View>
        )}

        {/* ── Step 3: Vibe + Budget ─────────────────── */}
        {step === 3 && (
          <View>
            <Text style={styles.heading}>What's your vibe?</Text>
            <Text style={styles.subtitle}>Pick the one that fits best.</Text>
            <View style={styles.optionList}>
              {VIBE_OPTIONS.map((opt) => (
                <OptionRow
                  key={opt.value}
                  label={opt.label}
                  selected={profile.vibe === opt.value}
                  onPress={() =>
                    setProfile((p) => ({ ...p, vibe: opt.value }))
                  }
                />
              ))}
            </View>

            <Text style={[styles.subtitle, { marginTop: 24 }]}>
              Budget preference
            </Text>
            <View style={styles.pillGrid}>
              {BUDGET_OPTIONS.map((opt) => (
                <Pill
                  key={opt.value}
                  label={opt.label}
                  selected={profile.budget === opt.value}
                  onPress={() =>
                    setProfile((p) => ({ ...p, budget: opt.value }))
                  }
                />
              ))}
            </View>

            <Pressable
              onPress={() => {
                track("onboarding_step_3_complete", {
                  vibe: profile.vibe,
                  budget: profile.budget,
                });
                setStep(4);
              }}
              style={[styles.primaryButton, styles.fullWidth, { marginTop: 32 }]}
            >
              <Text style={styles.primaryButtonText}>Next</Text>
            </Pressable>
          </View>
        )}

        {/* ── Step 4: Your week ─────────────────────── */}
        {step === 4 && (
          <View>
            <Text style={styles.heading}>Your week</Text>
            <Text style={styles.subtitle}>
              Which days are you typically free?
            </Text>
            <View style={styles.pillGrid}>
              {DAYS.map((d) => (
                <Pill
                  key={d.value}
                  label={d.label}
                  selected={(profile.freeDays ?? []).includes(d.value)}
                  onPress={() => toggleArray("freeDays", d.value)}
                />
              ))}
            </View>

            <Text style={[styles.subtitle, { marginTop: 24 }]}>
              Time preference
            </Text>
            <View style={styles.pillGrid}>
              {TIMES.map((t) => (
                <Pill
                  key={t.value}
                  label={t.label}
                  selected={(profile.freeTime ?? []).includes(t.value)}
                  onPress={() => toggleArray("freeTime", t.value)}
                />
              ))}
            </View>

            <Pressable
              onPress={handleFinish}
              style={[styles.primaryButton, styles.fullWidth, { marginTop: 32 }]}
            >
              <Text style={styles.primaryButtonText}>Finish</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  progressTrack: {
    height: 3,
    backgroundColor: colors.border,
  },
  progressFill: {
    height: 3,
    backgroundColor: colors.primary,
  },
  backRow: {
    paddingHorizontal: spacing.page,
    paddingVertical: 12,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  backText: {
    ...typography.sm,
    color: colors.foreground,
  },
  scrollContent: {
    paddingHorizontal: spacing.page,
    paddingBottom: 40,
  },
  heading: {
    ...typography.sectionHeading,
    marginBottom: 8,
  },
  subtitle: {
    ...typography.sm,
    color: colors.textSecondary,
    marginBottom: 20,
    lineHeight: 22,
  },
  pillGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  pill: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  pillSelected: {
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  pillText: {
    ...typography.sm,
    color: colors.foreground,
  },
  pillTextSelected: {
    color: colors.primary,
    fontWeight: "500",
  },
  optionList: {
    gap: 12,
  },
  optionRow: {
    padding: 16,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  optionRowSelected: {
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  optionRowText: {
    ...typography.body,
    fontWeight: "500",
    color: colors.foreground,
  },
  optionRowTextSelected: {
    color: colors.primary,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: radius.md,
    alignItems: "center",
  },
  primaryButtonPressed: {
    opacity: 0.85,
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    ...typography.body,
    fontWeight: "600",
    color: colors.white,
  },
  fullWidth: {
    width: "100%",
  },
  // Confirmation
  confirmContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.page,
    backgroundColor: colors.background,
  },
  confirmHeading: {
    ...typography.sectionHeading,
    textAlign: "center",
    marginBottom: 12,
  },
  confirmSub: {
    ...typography.sm,
    textAlign: "center",
    color: colors.textSecondary,
    marginBottom: 24,
  },
});

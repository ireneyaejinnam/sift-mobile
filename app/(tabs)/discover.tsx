import { useCallback, useState } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  ScrollView,
  StyleSheet,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import ProgressBar from "@/components/layout/ProgressBar";
import OptionCard from "@/components/quiz/OptionCard";
import DateRangePicker from "@/components/quiz/DateRangePicker";
import EventCard from "@/components/events/EventCard";
import EventDetail from "@/components/events/EventDetail";
import ResultsFilterBar from "@/components/results/ResultsFilterBar";
import BottomSheet from "@/components/ui/BottomSheet";
import SaveToListSheet from "@/components/events/SaveToListSheet";
import ShareSheet from "@/components/events/ShareSheet";
import { useToast } from "@/components/ui/Toast";
import { useUser } from "@/context/UserContext";
import { getAllCandidates, getNextCandidate } from "@/lib/eventRecommendations";
import { colors, spacing, radius, typography } from "@/lib/theme";
import type { EventCategory, EventDistance, SiftEvent } from "@/types/event";
import type { Filters, Step } from "@/types/quiz";

const categories: { value: EventCategory; label: string; emoji: string }[] = [
  { value: "arts", label: "Arts & Culture", emoji: "🎨" },
  { value: "music", label: "Live Music", emoji: "🎵" },
  { value: "outdoors", label: "Outdoors", emoji: "🌿" },
  { value: "fitness", label: "Fitness", emoji: "🏃" },
  { value: "comedy", label: "Comedy", emoji: "😂" },
  { value: "food", label: "Food & Drink", emoji: "🍷" },
  { value: "nightlife", label: "Nightlife", emoji: "🌙" },
  { value: "theater", label: "Theater", emoji: "🎭" },
  { value: "workshops", label: "Workshops", emoji: "🛠️" },
  { value: "popups", label: "Pop-ups & Sales", emoji: "🛍️" },
];

const distances: { value: EventDistance; label: string; desc: string }[] = [
  { value: "neighborhood", label: "Keep it close", desc: "Manhattan" },
  { value: "borough", label: "I'll travel a bit", desc: "Manhattan + Brooklyn" },
  { value: "anywhere", label: "Anywhere in NYC", desc: "All boroughs" },
];

interface Slot {
  event: SiftEvent;
  key: string;
}

export default function DiscoverScreen() {
  const router = useRouter();
  const { showToast } = useToast();
  const { userProfile } = useUser();

  const [step, setStep] = useState<Step>("welcome");
  const [filters, setFilters] = useState<Filters>({});
  const [slots, setSlots] = useState<Slot[]>([]);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<SiftEvent | null>(null);
  const [saveSheetEventId, setSaveSheetEventId] = useState<string | null>(null);
  const [shareSheetEvent, setShareSheetEvent] = useState<SiftEvent | null>(null);

  const reset = useCallback(() => {
    setStep("welcome");
    setFilters({});
    setSlots([]);
    setDismissedIds([]);
    setSelectedEvent(null);
  }, []);

  const handleBack = useCallback(() => {
    const flow: Step[] = ["welcome", "category", "date", "distance", "results"];
    const idx = flow.indexOf(step);
    if (idx > 0) setStep(flow[idx - 1]);
  }, [step]);

  const goToResults = useCallback((f: Filters) => {
    const candidates = getAllCandidates(f);
    const initial: Slot[] = candidates.slice(0, 3).map((e) => ({
      event: e,
      key: `${e.id}-${Date.now()}-${Math.random()}`,
    }));
    setSlots(initial);
    setDismissedIds([]);
    setStep("results");
  }, []);

  const handleFiltersChange = useCallback((newFilters: Filters) => {
    setFilters(newFilters);
    const candidates = getAllCandidates(newFilters);
    const newSlots: Slot[] = candidates.slice(0, 3).map((e) => ({
      event: e,
      key: `${e.id}-${Date.now()}-${Math.random()}`,
    }));
    setSlots(newSlots);
    setDismissedIds([]);
  }, []);

  const handleDismissEvent = useCallback(
    (eventId: string) => {
      const nextDismissed = [...dismissedIds, eventId];
      setDismissedIds(nextDismissed);
      setSlots((prev) => {
        const idx = prev.findIndex((s) => s.event.id === eventId);
        if (idx === -1) return prev;
        const shownIds = prev.map((s) => s.event.id).filter((id) => id !== eventId);
        const excluded = [...nextDismissed, ...shownIds];
        const next = getNextCandidate(excluded, filters, userProfile);
        if (!next) return prev.filter((_, i) => i !== idx);
        const updated = [...prev];
        updated[idx] = {
          event: next,
          key: `${next.id}-${Date.now()}-${Math.random()}`,
        };
        return updated;
      });
    },
    [dismissedIds, filters, userProfile]
  );

  // ── Event detail view ──────────────────────────────────

  if (selectedEvent) {
    return (
      <EventDetail
        event={selectedEvent}
        onBack={() => setSelectedEvent(null)}
        onRequestSignIn={() => router.push("/(auth)/signin")}
      />
    );
  }

  // ── Welcome ────────────────────────────────────────────

  if (step === "welcome") {
    return (
      <View style={s.centered}>
        <View style={s.heroContent}>
          <Text style={s.heroHeading}>
            What do you want to do{"\n"}
            <Text style={s.heroItalic}>this weekend?</Text>
          </Text>
          <Text style={s.heroSub}>
            You don't need more options. You need the right 3–5, matched to what
            you actually care about.
          </Text>
          <Text style={s.heroDetail}>
            Tell us what you're into, when you're free, and how far you'll go.
            We'll tell you what's worth your time.
          </Text>
          <Pressable
            onPress={() => setStep("category")}
            style={({ pressed }) => [
              s.primaryButton,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={s.primaryButtonText}>Show me what's happening →</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Quiz steps ─────────────────────────────────────────

  if (step === "category" || step === "date" || step === "distance") {
    return (
      <View style={s.container}>
        <ProgressBar step={step} />
        <ScrollView
          contentContainerStyle={s.quizScroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable onPress={handleBack} style={s.backButton}>
            <ArrowLeft size={16} color={colors.foreground} strokeWidth={1.5} />
            <Text style={s.backText}>Back</Text>
          </Pressable>

          {step === "category" && (
            <View>
              <Text style={s.heading}>What are you in the mood for?</Text>
              <Text style={s.sub}>Select up to 3.</Text>
              <View style={s.catGrid}>
                {categories.map((c) => {
                  const cats = filters.categories ?? [];
                  const isSelected = cats.includes(c.value);
                  const atLimit = cats.length >= 3 && !isSelected;
                  return (
                    <View key={c.value} style={s.catCell}>
                      <OptionCard
                        selected={isSelected}
                        onPress={() => {
                          if (atLimit) return;
                          const next = isSelected
                            ? cats.filter((x) => x !== c.value)
                            : [...cats, c.value];
                          setFilters((f) => ({
                            ...f,
                            categories: next.length > 0 ? next : undefined,
                          }));
                        }}
                      >
                        <Text style={{ fontSize: 24, marginBottom: 4 }}>{c.emoji}</Text>
                        <Text style={s.catLabel}>{c.label}</Text>
                      </OptionCard>
                    </View>
                  );
                })}
              </View>
              <View style={{ marginTop: 20, alignItems: "center" }}>
                <Pressable
                  onPress={() => setStep("date")}
                  disabled={!filters.categories?.length}
                  style={[
                    s.primaryButton,
                    { minWidth: 160 },
                    !filters.categories?.length && { opacity: 0.5 },
                  ]}
                >
                  <Text style={s.primaryButtonText}>Continue</Text>
                </Pressable>
              </View>
            </View>
          )}

          {step === "date" && (
            <View>
              <Text style={s.heading}>When are you free?</Text>
              <Text style={s.sub}>Pick a date range and we'll narrow things down.</Text>
              <DateRangePicker
                dateFrom={filters.dateFrom}
                dateTo={filters.dateTo}
                onChange={(from, to) =>
                  setFilters((f) => ({ ...f, dateFrom: from, dateTo: to }))
                }
              />
              <View style={{ marginTop: 20, alignItems: "center" }}>
                <Pressable
                  onPress={() => setStep("distance")}
                  disabled={!filters.dateFrom || !filters.dateTo}
                  style={[
                    s.primaryButton,
                    { minWidth: 160 },
                    (!filters.dateFrom || !filters.dateTo) && { opacity: 0.5 },
                  ]}
                >
                  <Text style={s.primaryButtonText}>Continue</Text>
                </Pressable>
              </View>
            </View>
          )}

          {step === "distance" && (
            <View>
              <Text style={s.heading}>How far will you go?</Text>
              <Text style={s.sub}>We'll keep it relevant.</Text>
              <View style={{ gap: 12 }}>
                {distances.map((d) => (
                  <OptionCard
                    key={d.value}
                    selected={filters.distance === d.value}
                    onPress={() => {
                      const f = { ...filters, distance: d.value };
                      setFilters(f);
                      setTimeout(() => goToResults(f), 200);
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <Text style={s.catLabel}>{d.label}</Text>
                      <Text style={s.sub}> — {d.desc}</Text>
                    </View>
                  </OptionCard>
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      </View>
    );
  }

  // ── Results ────────────────────────────────────────────

  return (
    <View style={s.container}>
      <FlatList
        data={slots}
        keyExtractor={(item) => item.key}
        contentContainerStyle={s.resultsScroll}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={{ marginBottom: 20 }}>
            {userProfile ? (
              <Text style={s.personalizeHint}>
                Recommendations for you · {userProfile.neighborhood || "NYC"} ·{" "}
                {(userProfile.interests ?? [])
                  .slice(0, 2)
                  .map((i) =>
                    i.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
                  )
                  .join(", ")}
              </Text>
            ) : (
              <Pressable onPress={() => router.push("/(auth)/signin")}>
                <Text style={s.personalizeLink}>Personalize your results →</Text>
              </Pressable>
            )}
            <Text style={s.heading}>
              {slots.length > 0 ? "Here's what we found" : "Hmm, nothing matched"}
            </Text>
            <Text style={s.sub}>
              {slots.length > 0
                ? "Swipe left to skip, or tap a card to learn more."
                : "Try broadening your filters — or just explore everything."}
            </Text>
            <View style={{ marginTop: 12 }}>
              <ResultsFilterBar filters={filters} onChange={handleFiltersChange} />
            </View>
            <Pressable onPress={reset} style={{ marginTop: 12 }}>
              <Text style={{ ...typography.sm, color: colors.primary, fontWeight: "500" }}>
                Start over
              </Text>
            </Pressable>
          </View>
        }
        renderItem={({ item }) => (
          <EventCard
            event={item.event}
            onPress={() => setSelectedEvent(item.event)}
            onDismiss={() => handleDismissEvent(item.event.id)}
            onRequestSignIn={() => router.push("/(auth)/signin")}
            onBookmarkPress={() => setSaveSheetEventId(item.event.id)}
            onSharePress={() => setShareSheetEvent(item.event)}
          />
        )}
        ListEmptyComponent={
          <View style={{ paddingVertical: 48, alignItems: "center" }}>
            <Text style={s.sub}>No events matched all your filters.</Text>
          </View>
        }
      />

      <BottomSheet
        open={!!saveSheetEventId}
        onClose={() => setSaveSheetEventId(null)}
        title="Save to list"
      >
        {saveSheetEventId && (
          <SaveToListSheet
            eventId={saveSheetEventId}
            currentListName={null}
            onClose={() => setSaveSheetEventId(null)}
            onSaved={(name) => showToast(`Saved to ${name}`)}
          />
        )}
      </BottomSheet>

      <BottomSheet
        open={!!shareSheetEvent}
        onClose={() => setShareSheetEvent(null)}
        title="Share"
      >
        {shareSheetEvent && (
          <ShareSheet
            eventId={shareSheetEvent.id}
            eventTitle={shareSheetEvent.title}
            onClose={() => setShareSheetEvent(null)}
          />
        )}
      </BottomSheet>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.page,
    backgroundColor: colors.background,
  },
  heroContent: { maxWidth: 400, width: "100%", alignItems: "center" },
  heroHeading: { ...typography.heroHeading, textAlign: "center", marginBottom: 20 },
  heroItalic: { fontStyle: "italic", color: colors.primary },
  heroSub: {
    ...typography.body,
    textAlign: "center",
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: 12,
  },
  heroDetail: {
    ...typography.sm,
    textAlign: "center",
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: 28,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: radius.md,
    alignItems: "center",
  },
  primaryButtonText: { ...typography.body, fontWeight: "600", color: colors.white },
  quizScroll: {
    paddingTop: Platform.OS === "ios" ? 76 : 36,
    paddingHorizontal: spacing.page,
    paddingBottom: 40,
  },
  backButton: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 28 },
  backText: { ...typography.sm, color: colors.foreground },
  heading: { ...typography.sectionHeading, marginBottom: 8 },
  sub: { ...typography.sm, color: colors.textSecondary, lineHeight: 22, marginBottom: 24 },
  catGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  catCell: { width: "47%" },
  catLabel: { ...typography.body, fontWeight: "500", color: colors.foreground },
  resultsScroll: {
    paddingTop: Platform.OS === "ios" ? 60 : 20,
    paddingHorizontal: spacing.page,
    paddingBottom: 40,
  },
  personalizeHint: { ...typography.sm, color: colors.textSecondary, marginBottom: 12 },
  personalizeLink: {
    ...typography.sm,
    color: colors.primary,
    textDecorationLine: "underline",
    marginBottom: 12,
  },
});

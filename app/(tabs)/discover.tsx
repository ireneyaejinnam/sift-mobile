import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { ArrowLeft, CalendarCheck } from "lucide-react-native";
import ProgressBar from "@/components/layout/ProgressBar";
import OptionCard from "@/components/quiz/OptionCard";
import DateRangePicker from "@/components/quiz/DateRangePicker";
import EventCard from "@/components/events/EventCard";
import SkeletonCard from "@/components/ui/SkeletonCard";
import EventDetail from "@/components/events/EventDetail";
import ResultsFilterBar from "@/components/results/ResultsFilterBar";
import BottomSheet from "@/components/ui/BottomSheet";
import SaveEventSheet from "@/components/events/SaveEventSheet";
import ShareSheet from "@/components/events/ShareSheet";
import { useToast } from "@/components/ui/Toast";
import { useUser } from "@/context/UserContext";
import { getAllCandidates, getNextCandidate } from "@/lib/eventRecommendations";
import { getRecommendations, getRecommendationsFromDB } from "@/lib/recommend";
import type { ScoredEvent } from "@/lib/recommend";
import { fetchEvents } from "@/lib/getEvents";
import { track, setTrackingUserId } from "@/lib/track";
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
  const { userProfile, userEmail, savedEvents, goingEvents } = useUser();
  const planCount = new Set([
    ...savedEvents.map((e) => e.eventId),
    ...goingEvents.map((e) => e.eventId),
  ]).size;

  useEffect(() => {
    if (userEmail) {
      setTrackingUserId(userEmail);
    }
    track("app_open", { has_profile: !!userProfile });
  }, []);

  const [step, setStep] = useState<Step>("welcome");
  const [filters, setFilters] = useState<Filters>({});
  const [slots, setSlots] = useState<Slot[]>([]);
  const [resultPool, setResultPool] = useState<SiftEvent[]>([]);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<SiftEvent | null>(null);
  const [saveSheetEvent, setSaveSheetEvent] = useState<SiftEvent | null>(null);
  const [shareSheetEvent, setShareSheetEvent] = useState<SiftEvent | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const reset = useCallback(() => {
    setStep("welcome");
    setFilters({});
    setSlots([]);
    setResultPool([]);
    setDismissedIds([]);
    setSelectedEvent(null);
  }, []);

  const handleBack = useCallback(() => {
    const flow: Step[] = ["welcome", "category", "date", "distance", "results"];
    const idx = flow.indexOf(step);
    if (idx > 0) setStep(flow[idx - 1]);
  }, [step]);

  const goToResults = useCallback(async (f: Filters) => {
    setLoading(true);
    setStep("results");

    let resultEvents: SiftEvent[];

    try {
      if (userProfile) {
        // Async: fetch from Supabase, score against profile
        const scored = await getRecommendationsFromDB(userProfile, 20);
        const allScored = scored.map((s) => ({
          ...s.event,
          matchReason: s.matchReasons.length > 0
            ? s.matchReasons.slice(0, 3).join(" · ")
            : "Picked for you",
        }));

        // Apply distance filter to all results
        const distanceFiltered = allScored.filter((e) => {
          if (f.distance === "neighborhood" && e.borough !== "Manhattan") return false;
          if (f.distance === "borough" && e.borough !== "Manhattan" && e.borough !== "Brooklyn") return false;
          return true;
        });

        // Priority: quiz category matches first, then everything else
        const quizMatches = distanceFiltered.filter(
          (e) => !f.categories?.length || f.categories.includes(e.category)
        );
        const rest = distanceFiltered.filter(
          (e) => f.categories?.length && !f.categories.includes(e.category)
        );
        resultEvents = [...quizMatches, ...rest];
      } else {
        // Guest: try Supabase first, fall back to local
        const dbEvents = await fetchEvents(f);
        resultEvents = dbEvents.length > 0 ? dbEvents : getAllCandidates(f, [], userProfile);
      }
    } catch {
      // Fallback to local hardcoded data
      if (userProfile) {
        const scored = getRecommendations(userProfile, 20);
        const allFallback = scored.map((s) => ({
          ...s.event,
          matchReason: s.matchReasons.length > 0
            ? s.matchReasons.slice(0, 3).join(" · ")
            : "Picked for you",
        }));
        const fbQuiz = allFallback.filter(
          (e) => !f.categories?.length || f.categories.includes(e.category)
        );
        const fbRest = allFallback.filter(
          (e) => f.categories?.length && !f.categories.includes(e.category)
        );
        resultEvents = [...fbQuiz, ...fbRest];
      } else {
        resultEvents = getAllCandidates(f, [], userProfile);
      }
    }

    setResultPool(resultEvents);
    const initial: Slot[] = resultEvents.slice(0, 3).map((e) => ({
      event: e,
      key: `${e.id}-${Date.now()}-${Math.random()}`,
    }));
    setSlots(initial);
    setDismissedIds([]);
    setLoading(false);
    track("recommendations_viewed", {
      count: initial.length,
      categories: f.categories,
    });
  }, [userProfile]);

  const handleFiltersChange = useCallback(async (newFilters: Filters) => {
    setFilters(newFilters);
    // Re-use goToResults which already handles Supabase + fallback
    await goToResults(newFilters);
  }, [goToResults]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    goToResults(filters);
    setTimeout(() => setRefreshing(false), 600);
  }, [filters, goToResults]);

  const handleDismissEvent = useCallback(
    (eventId: string) => {
      const nextDismissed = [...dismissedIds, eventId];
      setDismissedIds(nextDismissed);
      setSlots((prev) => {
        const idx = prev.findIndex((s) => s.event.id === eventId);
        if (idx === -1) return prev;
        const shownIds = new Set(prev.map((s) => s.event.id));
        const excludedIds = new Set([...nextDismissed, ...shownIds]);

        // Draw next from the pre-ranked result pool (preserves priority order)
        const next = resultPool.find((e) => !excludedIds.has(e.id))
          ?? getNextCandidate([...excludedIds], filters, userProfile);

        if (!next) return prev.filter((_, i) => i !== idx);
        const updated = [...prev];
        updated[idx] = {
          event: next,
          key: `${next.id}-${Date.now()}-${Math.random()}`,
        };
        return updated;
      });
    },
    [dismissedIds, filters, userProfile, resultPool]
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
                    <View style={{ flexDirection: "row", alignItems: "baseline" }}>
                      <Text style={s.catLabel}>{d.label}</Text>
                      <Text style={s.distDesc}> — {d.desc}</Text>
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
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <View style={{ marginBottom: 20 }}>
            <Text style={s.heading}>
              {slots.length > 0
                ? userProfile
                  ? `Your top ${slots.length} picks`
                  : "Here's what we found"
                : "Hmm, nothing matched"}
            </Text>
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
              <Text style={s.sub}>
                {slots.length > 0
                  ? "Swipe left to skip, or tap a card to learn more."
                  : "Try broadening your filters — or just explore everything."}
              </Text>
            )}
            {!userProfile && (
              <Pressable onPress={() => router.push("/(auth)/signin")}>
                <Text style={s.personalizeLink}>Personalize your results →</Text>
              </Pressable>
            )}
            <View style={{ marginTop: 12 }}>
              <ResultsFilterBar filters={filters} onChange={handleFiltersChange} />
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginTop: 10 }}
              contentContainerStyle={{ gap: 8 }}
            >
              {categories.map((c) => {
                const isActive = filters.categories?.includes(c.value);
                return (
                  <Pressable
                    key={c.value}
                    onPress={() => {
                      const current = filters.categories ?? [];
                      const next = isActive
                        ? current.filter((x) => x !== c.value)
                        : [...current, c.value];
                      handleFiltersChange({
                        ...filters,
                        categories: next.length > 0 ? next : undefined,
                      });
                    }}
                    style={[
                      s.categoryPill,
                      isActive && s.categoryPillActive,
                    ]}
                  >
                    <Text
                      style={[
                        s.categoryPillText,
                        isActive && s.categoryPillTextActive,
                      ]}
                    >
                      {c.emoji} {c.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
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
            onPress={() => {
              track("card_tap", { event_id: item.event.id, category: item.event.category });
              setSelectedEvent(item.event);
            }}
            onDismiss={() => handleDismissEvent(item.event.id)}
            onRequestSignIn={() => router.push("/(auth)/signin")}
            onBookmarkPress={() => {
              track("event_saved", { event_id: item.event.id });
              setSaveSheetEvent(item.event);
            }}
            onSharePress={() => {
              track("share_tap", { event_id: item.event.id });
              setShareSheetEvent(item.event);
            }}
          />
        )}
        ListEmptyComponent={
          loading ? (
            <View>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </View>
          ) : (
            <View style={{ paddingVertical: 48, alignItems: "center" }}>
              <Text style={s.heading}>No events matched</Text>
              <Text style={[s.sub, { textAlign: "center", maxWidth: 260 }]}>
                Try broadening your filters or explore a different category.
              </Text>
              <Pressable onPress={reset} style={s.primaryButton}>
                <Text style={s.primaryButtonText}>Start over</Text>
              </Pressable>
            </View>
          )
        }
        ListFooterComponent={
          planCount > 0 && slots.length > 0 ? (
            <Pressable
              onPress={() => router.push("/(tabs)/plan")}
              style={s.planCta}
            >
              <CalendarCheck size={18} strokeWidth={1.5} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={s.planCtaTitle}>Plan your weekend</Text>
                <Text style={s.planCtaSub}>
                  {planCount} event{planCount !== 1 ? "s" : ""} saved
                </Text>
              </View>
              <Text style={s.planCtaArrow}>→</Text>
            </Pressable>
          ) : null
        }
      />

      <BottomSheet
        open={!!saveSheetEvent}
        onClose={() => setSaveSheetEvent(null)}
        title="Save to list"
      >
        {saveSheetEvent && (
          <SaveEventSheet
            event={saveSheetEvent}
            currentListName={null}
            onClose={() => setSaveSheetEvent(null)}
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
  distDesc: { ...typography.sm, color: colors.textSecondary, lineHeight: 22 },
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
  categoryPill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  categoryPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  categoryPillText: {
    ...typography.xs,
    color: colors.textSecondary,
    fontWeight: "500",
  },
  categoryPillTextActive: {
    color: colors.white,
  },
  planCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    padding: 14,
    marginTop: 8,
    marginBottom: 16,
  },
  planCtaTitle: {
    ...typography.sm,
    fontWeight: "600",
    color: colors.primary,
  },
  planCtaSub: {
    ...typography.xs,
    color: colors.textSecondary,
    marginTop: 1,
  },
  planCtaArrow: {
    fontSize: 18,
    color: colors.primary,
    fontWeight: "600",
  },
});

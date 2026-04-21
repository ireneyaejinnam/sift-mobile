import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  BackHandler,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  Easing,
  runOnJS,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, CalendarCheck } from "lucide-react-native";
import ProgressBar from "@/components/layout/ProgressBar";
import OptionCard from "@/components/quiz/OptionCard";
import DateRangePicker from "@/components/quiz/DateRangePicker";
import EventCard from "@/components/events/EventCard";
import SkeletonCard from "@/components/ui/SkeletonCard";
import GestureTutorial from "@/components/ui/GestureTutorial";
import EventDetail from "@/components/events/EventDetail";
import ResultsFilterBar from "@/components/results/ResultsFilterBar";
import BottomSheet from "@/components/ui/BottomSheet";
import SaveEventSheet from "@/components/events/SaveEventSheet";
import GoingDateSheet from "@/components/events/GoingDateSheet";
import ShareSheet from "@/components/events/ShareSheet";
import { useToast } from "@/components/ui/Toast";
import { useUser } from "@/context/UserContext";
import { getAllCandidates, getNextCandidate } from "@/lib/eventRecommendations";
import { fetchAllUpcoming, computeEventScore } from "@/lib/getEvents";
import { loadTasteProfile, recordDislike, recordLike, hydrateTasteProfile } from "@/lib/tasteProfile";
import type { TasteProfile } from "@/lib/tasteProfile";
import { hasGestureTipSeen, setGestureTipSeen, getDismissedEvents, addDismissedEvent } from "@/lib/storage";
import type { DismissedRecord } from "@/lib/storage";
import { track, setTrackingUserId } from "@/lib/track";
import { colors, spacing, radius, typography } from "@/lib/theme";
import type { EventCategory, EventDistance, SiftEvent } from "@/types/event";
import type { Filters, Step } from "@/types/quiz";

const TRANSITION_MSGS = [
  "Finding your picks...",
  "Checking what's on this weekend...",
  "Tailoring for you...",
];

const PICK_GRADIENTS: Partial<Record<EventCategory, [string, string]>> = {
  arts:      ["#C9A882", "#8B5E3C"],
  music:     ["#5B8DB8", "#2C4F70"],
  outdoors:  ["#5A9E6F", "#2D6644"],
  fitness:   ["#C0554A", "#7A2E28"],
  comedy:    ["#B8A840", "#6E6020"],
  food:      ["#C47830", "#7A4810"],
  nightlife: ["#6B4E9E", "#3A2060"],
  theater:   ["#4A7A9E", "#1E4060"],
  workshops: ["#6A9E50", "#304E20"],
  popups:    ["#B87050", "#6A3820"],
};

function buildResultsHeader(
  count: number,
): { headline: string; subline: string } {
  if (count === 0) return { headline: "Nothing matched", subline: "Try a broader search" };
  return {
    headline: "Your picks",
    subline: `${count} event${count === 1 ? "" : "s"} · sorted for you`,
  };
}

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

const INTEREST_TO_CATEGORY: Record<string, EventCategory> = {
  live_music: "music", art_exhibitions: "arts", theater: "theater",
  workshops: "workshops", fitness: "fitness", comedy: "comedy",
  food: "food", outdoor: "outdoors", nightlife: "nightlife", popups: "popups",
};

interface Slot {
  event: SiftEvent | null;
  key: string;
  type: 'event' | 'end-card' | 'divider';
  meta?: { quizCategories?: string[] };
}

export default function DiscoverScreen() {
  const router = useRouter();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  const { isLoggedIn, userProfile, userEmail, savedEvents, goingEvents, toggleGoing } = useUser();
  const planCount = isLoggedIn ? new Set([
    ...savedEvents.map((e) => e.eventId),
    ...goingEvents.map((e) => e.eventId),
  ]).size : 0;

  useEffect(() => {
    if (userEmail) {
      setTrackingUserId(userEmail);
    }
    track("app_open", { has_profile: !!userProfile });
  }, []);

  useEffect(() => {
    getDismissedEvents().then(setDismissedHistory);
  }, []);

  const [step, setStep] = useState<Step>("category");
  const [filters, setFilters] = useState<Filters>({});
  const [slots, setSlots] = useState<Slot[]>([]);
  const [resultPool, setResultPool] = useState<SiftEvent[]>([]);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const [dismissedHistory, setDismissedHistory] = useState<DismissedRecord[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<SiftEvent | null>(null);
  const [saveSheetEvent, setSaveSheetEvent] = useState<SiftEvent | null>(null);
  const [goingSheetEvent, setGoingSheetEvent] = useState<SiftEvent | null>(null);
  const [shareSheetEvent, setShareSheetEvent] = useState<SiftEvent | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showGestureTip, setShowGestureTip] = useState(false);
  const [tasteProfile, setTasteProfile] = useState<TasteProfile | null>(null);
  const loadingRef = useRef(false);
  const expandedToInterestsRef = useRef(false);

  const weekendPicks = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() + 4);
    return resultPool
      .filter((e) => {
        const d = new Date(e.startDate + "T12:00:00");
        return d >= today && d < cutoff && (e.vibeScore ?? 0) >= 7;
      })
      .slice(0, 7);
  }, [resultPool]);

  // Quiz step slide-in animation
  const quizEntrance = useSharedValue(1);
  const quizTranslateX = useSharedValue(0);
  const quizDirectionRef = useRef<1 | -1>(1);
  const quizAnimStyle = useAnimatedStyle(() => ({
    opacity: quizEntrance.value,
    transform: [{ translateX: quizTranslateX.value }],
  }));

  useEffect(() => {
    if (step === "results" || isTransitioning) return;
    const dir = quizDirectionRef.current;
    quizDirectionRef.current = 1;
    quizEntrance.value = 0;
    quizTranslateX.value = dir * 28;
    quizEntrance.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.quad) });
    quizTranslateX.value = withTiming(0, { duration: 260, easing: Easing.out(Easing.quad) });
  }, [step]);

  // Transition animation between quiz and results
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionMsgIdx, setTransitionMsgIdx] = useState(0);
  const transitionRotate = useSharedValue(0);
  const transitionIconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${transitionRotate.value}deg` }],
  }));

  // EventDetail slide animation — transparent modal + Reanimated worklet, no bridge overhead
  const [eventDetailVisible, setEventDetailVisible] = useState(false);
  const eventSlideY = useSharedValue(900);

  const eventDetailStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: eventSlideY.value }],
  }));

  const openEventDetail = useCallback((event: SiftEvent) => {
    setSelectedEvent(event);
    eventSlideY.value = 900;
    setEventDetailVisible(true);
    eventSlideY.value = withSpring(0, { damping: 60, stiffness: 300 });
  }, []);

  const closeEventDetail = useCallback(() => {
    eventSlideY.value = withTiming(900, { duration: 260 }, (finished) => {
      if (finished) {
        runOnJS(setEventDetailVisible)(false);
        runOnJS(setSelectedEvent)(null);
      }
    });
  }, []);

  // Load taste profile (AsyncStorage for guests, Supabase for logged-in)
  useEffect(() => {
    loadTasteProfile().then(setTasteProfile);
  }, [isLoggedIn]);

  // Seed from full save/going history — runs once per install
  useEffect(() => {
    if (!tasteProfile || tasteProfile.seededFromHistory) return;
    const savedIds = savedEvents.map((e) => e.eventId);
    const goingIds = goingEvents.map((e) => e.eventId);
    hydrateTasteProfile(savedIds, goingIds).then((updated) => {
      if (updated) setTasteProfile(updated);
    });
  }, [tasteProfile, savedEvents, goingEvents]);
  // Session-dismissed: never cleared by reset() — events stay gone for the whole session
  const sessionDismissedRef = useRef(new Set<string>());

  // Intercept Android hardware back when mid-quiz to go back one step instead of exiting
  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        if (step !== "category") {
          handleBack();
          return true; // consume the event
        }
        return false;
      };
      const sub = BackHandler.addEventListener("hardwareBackPress", onBack);
      return () => sub.remove();
    }, [step])
  );

  const reset = useCallback(() => {
    setIsTransitioning(false);
    setStep("category");
    setFilters({});
    setSlots([]);
    setResultPool([]);
    setDismissedIds([]);
    setSelectedEvent(null);
  }, []);

  const handleBack = useCallback(() => {
    const flow: Step[] = ["category", "date", "distance", "results"];
    const idx = flow.indexOf(step);
    if (idx > 0) {
      quizDirectionRef.current = -1;
      setStep(flow[idx - 1]);
    }
  }, [step]);

  const goToResults = useCallback(async (f: Filters, opts?: { skipTransition?: boolean }) => {
    if (loadingRef.current) return;
    loadingRef.current = true;

    let msgTimer1: ReturnType<typeof setTimeout> | undefined;
    let msgTimer2: ReturnType<typeof setTimeout> | undefined;
    let minDelay: Promise<void>;

    if (!opts?.skipTransition) {
      // Show transition screen while fetching — minimum 1500ms, waits for fetch if slower
      setIsTransitioning(true);
      setTransitionMsgIdx(0);
      transitionRotate.value = 0;
      transitionRotate.value = withRepeat(
        withTiming(360, { duration: 1200, easing: Easing.linear }),
        -1,
        false
      );
      msgTimer1 = setTimeout(() => setTransitionMsgIdx(1), 500);
      msgTimer2 = setTimeout(() => setTransitionMsgIdx(2), 1000);
      minDelay = new Promise<void>((resolve) => setTimeout(resolve, 1500));
    } else {
      setLoading(true);
      setStep("results");
      minDelay = Promise.resolve();
    }

    // Priority ordering:
    //   Tier 1: Quiz categories (what user just picked)
    //   Tier 2: Onboarding interests (logged-in only, skip for guest)
    //   Tier 3: Everything else in the date range

    const applyDistanceFilter = (list: SiftEvent[]) =>
      list.filter((e) => {
        if (f.distance === "neighborhood" && e.borough !== "Manhattan") return false;
        if (f.distance === "borough" && e.borough !== "Manhattan" && e.borough !== "Brooklyn") return false;
        return true;
      });


    // Re-rank within a tier by composite score × taste weight.
    const applyPrefs = (tier: SiftEvent[], weights: Partial<Record<EventCategory, number>>) => {
      if (Object.keys(weights).length === 0) return tier;
      return [...tier].sort((a, b) => {
        const wa = weights[a.category] ?? 1.0;
        const wb = weights[b.category] ?? 1.0;
        return computeEventScore(b, wb) - computeEventScore(a, wa);
      });
    };

    // Events arrive pre-sorted by composite score (vibe + timeliness + completeness).
    // tieredSort groups them into tiers while preserving that order within each tier.
    const tieredSort = (all: SiftEvent[]) => {
      let pool = applyDistanceFilter(all);

      // Apply date range filter if user picked dates
      if (f.dateFrom && f.dateTo) {
        const from = new Date(f.dateFrom);
        const to = new Date(f.dateTo);
        from.setDate(from.getDate() - 1); // ±1 day padding
        to.setDate(to.getDate() + 1);
        pool = pool.filter((e) => {
          const start = new Date(e.startDate);
          const end = new Date(e.endDate ?? e.startDate);
          return start <= to && end >= from;
        });
      }

      const quizCats = f.categories ?? [];

      // Tier 1: matches quiz categories
      const tier1 = quizCats.length > 0
        ? pool.filter((e) => quizCats.includes(e.category))
            .map((e) => ({ ...e, matchReason: "Matches your mood" }))
        : pool.map((e) => ({ ...e, matchReason: "Picked for you" }));

      if (quizCats.length === 0) return tier1;

      const tier1Ids = new Set(tier1.map((e) => e.id));

      // Tier 2: matches onboarding interests (logged-in only)
      let tier2: SiftEvent[] = [];
      if (userProfile?.interests?.length) {
        const interestCats = userProfile.interests
          .map((i) => INTEREST_TO_CATEGORY[i])
          .filter(Boolean);
        tier2 = pool
          .filter((e) => !tier1Ids.has(e.id) && interestCats.includes(e.category))
          .map((e) => ({ ...e, matchReason: "Based on your interests" }));
      }

      const usedIds = new Set([...tier1Ids, ...tier2.map((e) => e.id)]);

      // Tier 3: everything else
      const tier3 = pool
        .filter((e) => !usedIds.has(e.id))
        .map((e) => ({ ...e, matchReason: e.price === 0 ? "It's free" : "More to explore" }));

      // Re-rank within each tier by composite score × learned category weights
      const weights = tasteProfile?.categoryWeights ?? {};
      return [
        ...applyPrefs(tier1, weights),
        ...applyPrefs(tier2, weights),
        ...applyPrefs(tier3, weights),
      ];
    };

    const fetchAndSort = async (): Promise<SiftEvent[]> => {
      try {
        const categoryWeights = tasteProfile?.categoryWeights;
        const allEvents = await fetchAllUpcoming(500, f.categories, categoryWeights);
        if (allEvents.length > 0) {
          return tieredSort(allEvents).filter(
            (e) => !sessionDismissedRef.current.has(e.id)
          );
        }
        return getAllCandidates(f, [], userProfile);
      } catch {
        showToast("Couldn't connect — showing cached results");
        return getAllCandidates(f, [], userProfile);
      }
    };

    // Run fetch and minimum transition delay in parallel
    const [resultEvents] = await Promise.all([fetchAndSort(), minDelay]);

    clearTimeout(msgTimer1);
    clearTimeout(msgTimer2);

    // Data is ready — populate state before switching screens so no skeleton flash
    expandedToInterestsRef.current = false;
    const initial: Slot[] = resultEvents.slice(0, 3).map((e) => ({
      event: e,
      key: `${e.id}-${Date.now()}-${Math.random()}`,
      type: 'event' as const,
    }));
    setResultPool(resultEvents);
    setSlots(initial);
    setDismissedIds([]);

    if (!opts?.skipTransition) {
      setIsTransitioning(false);
      setStep("results");
    } else {
      setLoading(false);
    }
    loadingRef.current = false;
    track("recommendations_viewed", {
      count: initial.length,
      categories: f.categories,
    });

    // Show gesture tutorial on first ever results view
    hasGestureTipSeen().then((seen) => {
      if (!seen) setShowGestureTip(true);
    });
  }, [userProfile, goingEvents, savedEvents, dismissedHistory, tasteProfile]);

  const handleFiltersChange = useCallback(async (newFilters: Filters) => {
    setFilters(newFilters);
    await goToResults(newFilters, { skipTransition: true });
  }, [goToResults]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    goToResults(filters, { skipTransition: true });
    setTimeout(() => setRefreshing(false), 600);
  }, [filters, goToResults]);

  // Returns the next slot update — end card if pool exhausted, otherwise next event
  const nextSlotUpdate = (
    prev: Slot[],
    idx: number,
    excludedIds: Set<string>,
    quizCategories: string[]
  ): Slot[] => {
    const next = resultPool.find((e) => !excludedIds.has(e.id))
      ?? getNextCandidate([...excludedIds], filters, userProfile);

    if (next) {
      const updated = [...prev];
      updated[idx] = { event: next, key: `${next.id}-${Date.now()}-${Math.random()}`, type: 'event' };
      return updated;
    }

    // Pool exhausted for this slot — check if other event slots are still active
    const otherEventSlots = prev.filter((s, i) => i !== idx && s.type === 'event');

    if (otherEventSlots.length > 0) {
      // Other cards still visible — silently collapse this slot
      return prev.filter((_, i) => i !== idx);
    }

    // Last event slot exhausted — now show the end card if we have interests to expand to
    const interestCats = (userProfile?.interests ?? [])
      .map((i) => INTEREST_TO_CATEGORY[i])
      .filter((c): c is EventCategory => !!c && !quizCategories.includes(c));

    const alreadyHasEndCard = prev.some((s) => s.type === 'end-card');

    if (!expandedToInterestsRef.current && interestCats.length > 0 && !alreadyHasEndCard) {
      return [{
        event: null,
        key: `end-card-${Date.now()}`,
        type: 'end-card',
        meta: { quizCategories },
      }];
    }

    return prev.filter((_, i) => i !== idx);
  };

  const handleDismissEvent = useCallback(
    (eventId: string) => {
      sessionDismissedRef.current.add(eventId);
      const nextDismissed = [...dismissedIds, eventId];
      setDismissedIds(nextDismissed);

      const dismissed = resultPool.find((e) => e.id === eventId);
      if (dismissed?.category) {
        const record: DismissedRecord = {
          eventId,
          category: dismissed.category,
          dismissedAt: new Date().toISOString(),
        };
        addDismissedEvent(record);
        setDismissedHistory((prev) => [...prev, record]);
        recordDislike(eventId, dismissed.category).then(setTasteProfile).catch(() => {});
      }
      setSlots((prev) => {
        const idx = prev.findIndex((s) => s.event?.id === eventId);
        if (idx === -1) return prev;
        const shownIds = new Set(prev.map((s) => s.event?.id).filter(Boolean) as string[]);
        const excludedIds = new Set([...nextDismissed, ...shownIds]);
        return nextSlotUpdate(prev, idx, excludedIds, filters.categories?.map(String) ?? []);
      });
    },
    [dismissedIds, filters, userProfile, resultPool]
  );

  // Advances the slot for a going-swiped event (shared by instant-going and date-picker confirm)
  const advanceGoingSlot = useCallback(
    (eventId: string) => {
      sessionDismissedRef.current.add(eventId);
      const nextDismissed = [...dismissedIds, eventId];
      setDismissedIds(nextDismissed);
      setSlots((prev) => {
        const idx = prev.findIndex((s) => s.event?.id === eventId);
        if (idx === -1) return prev;
        const shownIds = new Set(prev.map((s) => s.event?.id).filter(Boolean) as string[]);
        const excludedIds = new Set([...nextDismissed, ...shownIds]);
        return nextSlotUpdate(prev, idx, excludedIds, filters.categories?.map(String) ?? []);
      });
    },
    [dismissedIds, filters, userProfile, resultPool]
  );

  // Fetches interest-based events and injects them after the end card
  const expandToInterests = useCallback(async () => {
    if (expandedToInterestsRef.current) return;
    expandedToInterestsRef.current = true;

    const interestCats = (userProfile?.interests ?? [])
      .map((i) => INTEREST_TO_CATEGORY[i])
      .filter((c): c is EventCategory => !!c && !(filters.categories ?? []).includes(c));

    if (!interestCats.length) return;

    const events = await fetchAllUpcoming(200, interestCats, tasteProfile?.categoryWeights);
    const alreadyUsed = new Set([...dismissedIds, ...resultPool.map((e) => e.id)]);
    const fresh = events.filter((e) => !alreadyUsed.has(e.id));
    if (!fresh.length) return;

    setResultPool((prev) => [...prev, ...fresh]);
    setSlots(
      fresh.slice(0, 3).map((e) => ({
        event: e,
        key: `${e.id}-${Date.now()}-${Math.random()}`,
        type: 'event' as const,
      }))
    );
  }, [userProfile, filters, dismissedIds, resultPool, tasteProfile]);

  const handleGoingSwipe = useCallback(
    (event: SiftEvent) => {
      if (!isLoggedIn) {
        router.push("/(auth)/signin");
        return;
      }
      const isMultiDate = (event.sessions && event.sessions.length > 1) ||
        (!!event.endDate && event.endDate !== event.startDate);

      if (isMultiDate) {
        // Store the event and open the date picker — advance the slot on confirm
        setGoingSheetEvent(event);
        advanceGoingSlot(event.id);
        return;
      }

      toggleGoing({
        eventId: event.id,
        eventTitle: event.title,
        eventDate: event.startDate,
        eventEndDate: event.endDate,
      });
      track("event_going", { event_id: event.id, source: "swipe" });
      showToast("Marked as going");
      if (event.category) {
        recordLike(event.id, event.category).then(setTasteProfile).catch(() => {});
      }
      advanceGoingSlot(event.id);
    },
    [isLoggedIn, toggleGoing, advanceGoingSlot, showToast]
  );

  // ── Transition screen (must come before quiz check) ────

  if (isTransitioning) {
    return (
      <View style={s.centered}>
        <Animated.View style={[transitionIconStyle, { marginBottom: 24 }]}>
          <Text style={s.transitionIcon}>✦</Text>
        </Animated.View>
        <Text style={s.transitionMsg}>{TRANSITION_MSGS[transitionMsgIdx]}</Text>
      </View>
    );
  }

  // ── Quiz steps ─────────────────────────────────────────

  if (step === "category" || step === "date" || step === "distance") {
    return (
      <View style={s.container}>
        <ProgressBar step={step} />
        <ScrollView
          contentContainerStyle={[s.quizScroll, { paddingTop: insets.top + 28 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View style={quizAnimStyle}>
          {step !== "category" && (
            <Pressable onPress={handleBack} style={s.backButton}>
              <ArrowLeft size={16} color={colors.foreground} strokeWidth={1.5} />
              <Text style={s.backText}>Back</Text>
            </Pressable>
          )}

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
              <View style={{ marginTop: 20, gap: 12, alignItems: "center" }}>
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
                <Pressable
                  onPress={() => {
                    setFilters((f) => ({ ...f, categories: undefined }));
                    setStep("date");
                  }}
                  style={s.browseLinkButton}
                >
                  <Text style={s.browseLinkText}>Surprise me</Text>
                </Pressable>
                <Pressable
                  onPress={() => goToResults({})}
                  style={s.browseLinkButton}
                >
                  <Text style={s.browseLinkText}>Browse everything →</Text>
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
              <View style={{ marginTop: 20, gap: 12, alignItems: "center" }}>
                <Pressable
                  onPress={() => {
                    // If only a start date is picked, treat it as a single-day range
                    if (filters.dateFrom && !filters.dateTo) {
                      setFilters((f) => ({ ...f, dateTo: f.dateFrom }));
                    }
                    setStep("distance");
                  }}
                  disabled={!filters.dateFrom}
                  style={[
                    s.primaryButton,
                    { minWidth: 160 },
                    !filters.dateFrom && { opacity: 0.5 },
                  ]}
                >
                  <Text style={s.primaryButtonText}>Continue</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setFilters((f) => ({ ...f, dateFrom: undefined, dateTo: undefined }));
                    setStep("distance");
                  }}
                  style={s.browseLinkButton}
                >
                  <Text style={s.browseLinkText}>Just browsing — no specific date</Text>
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
          </Animated.View>
        </ScrollView>
      </View>
    );
  }

  // ── Results ────────────────────────────────────────────

  return (
    <View style={s.container}>
      {/* Sticky header — stays put while list scrolls */}
      <View style={[s.stickyHeader, { paddingTop: insets.top + 16 }]}>
        {(() => {
          const { headline, subline } = buildResultsHeader(resultPool.length);
          return (
            <View style={s.resultsHeaderRow}>
              <View style={s.resultsHeaderTextBlock}>
                <Text style={s.resultsHeading}>{loading ? "Sorting picks..." : headline}</Text>
                {!loading && resultPool.length > 0 && (
                  <Text style={s.resultsSubline}>{subline}</Text>
                )}
              </View>
              <Pressable onPress={reset} hitSlop={8}>
                <Text style={s.startOverText}>Start over</Text>
              </Pressable>
            </View>
          );
        })()}
      </View>

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
            {weekendPicks.length >= 2 && (
              <View style={s.weekendSection}>
                <Text style={s.weekendHeading}>Top picks this week</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 10, paddingBottom: 4 }}
                >
                  {weekendPicks.map((pick) => (
                    <LinearGradient
                      key={pick.id}
                      colors={PICK_GRADIENTS[pick.category] ?? ["#6B7280", "#374151"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={s.weekendCard}
                    >
                      <LinearGradient
                        colors={["transparent", "rgba(0,0,0,0.72)"]}
                        style={s.weekendCardOverlay}
                      >
                        <Text
                          style={s.weekendCardTitle}
                          numberOfLines={2}
                          onPress={() => openEventDetail(pick)}
                        >
                          {pick.title}
                        </Text>
                        <Text style={s.weekendCardCategory}>{pick.category}</Text>
                      </LinearGradient>
                    </LinearGradient>
                  ))}
                </ScrollView>
              </View>
            )}
            <GestureTutorial
              visible={showGestureTip}
              onDismiss={() => {
                setShowGestureTip(false);
                setGestureTipSeen();
              }}
            />
            <ResultsFilterBar filters={filters} onChange={handleFiltersChange} />
          </View>
        }
        renderItem={({ item }) => {
          if (item.type === 'divider') {
            return (
              <View style={s.dividerRow}>
                <View style={s.dividerLine} />
                <Text style={s.dividerLabel}>Now showing events for you</Text>
                <View style={s.dividerLine} />
              </View>
            );
          }
          if (item.type === 'end-card') {
            const quizLabels = (item.meta?.quizCategories ?? [])
              .map((c: string) => categories.find((cat) => cat.value === c)?.label ?? c)
              .join(' · ');
            return (
              <View style={s.endCard}>
                <Text style={s.endCardTitle}>
                  {quizLabels ? `That's the good stuff for ${quizLabels}.` : "You've seen it all."}
                </Text>
                <Text style={s.endCardSub}>
                  {quizLabels ? "Here's what else fits your taste —" : "More events based on your interests —"}
                </Text>
                <Pressable onPress={expandToInterests} style={s.endCardButton}>
                  <Text style={s.endCardButtonText}>Keep exploring</Text>
                </Pressable>
              </View>
            );
          }
          if (!item.event) return null;
          return (
            <EventCard
              event={item.event}
              onPress={() => {
                track("card_tap", { event_id: item.event!.id, category: item.event!.category });
                openEventDetail(item.event!);
              }}
              onDismiss={() => handleDismissEvent(item.event!.id)}
              onGoing={() => handleGoingSwipe(item.event!)}
              onRequestSignIn={() => router.push("/(auth)/signin")}
              onBookmarkPress={() => {
                track("event_saved", { event_id: item.event!.id });
                setSaveSheetEvent(item.event!);
              }}
              onSharePress={() => {
                track("share_tap", { event_id: item.event!.id });
                setShareSheetEvent(item.event!);
              }}
            />
          );
        }}
        ListEmptyComponent={
          loading ? (
            <View>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </View>
          ) : (
            <View style={{ paddingVertical: 48, alignItems: "center" }}>
              <Text style={s.heading}>Nothing here.</Text>
              <Text style={[s.sub, { textAlign: "center", maxWidth: 260 }]}>
                Try a wider date range or a different category.
              </Text>
              <Pressable
                onPress={() => goToResults({ ...filters, dateFrom: undefined, dateTo: undefined, distance: "anywhere" }, { skipTransition: true })}
                style={s.primaryButton}
              >
                <Text style={s.primaryButtonText}>Broaden search</Text>
              </Pressable>
              <Pressable onPress={reset} style={s.browseLinkButton}>
                <Text style={s.browseLinkText}>Start over</Text>
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
            onSaved={(name) => {
              showToast(`Saved to ${name}`);
              if (saveSheetEvent?.category) {
                recordLike(saveSheetEvent.id, saveSheetEvent.category)
                  .then(setTasteProfile).catch(() => {});
              }
            }}
          />
        )}
      </BottomSheet>

      <BottomSheet
        open={!!goingSheetEvent}
        onClose={() => setGoingSheetEvent(null)}
        title="Pick a date"
      >
        {goingSheetEvent && (
          <GoingDateSheet
            event={goingSheetEvent}
            onConfirm={(date) => {
              toggleGoing({
                eventId: goingSheetEvent.id,
                eventTitle: goingSheetEvent.title,
                eventDate: date,
                eventEndDate: goingSheetEvent.endDate,
              });
              track("event_going", { event_id: goingSheetEvent.id, source: "swipe" });
              showToast("Marked as going");
              if (goingSheetEvent.category) {
                recordLike(goingSheetEvent.id, goingSheetEvent.category)
                  .then(setTasteProfile).catch(() => {});
              }
              setGoingSheetEvent(null);
            }}
            onCancel={() => setGoingSheetEvent(null)}
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
            eventUrl={shareSheetEvent.eventUrl || shareSheetEvent.link}
            onClose={() => setShareSheetEvent(null)}
          />
        )}
      </BottomSheet>

      <Modal
        visible={eventDetailVisible}
        transparent
        animationType="none"
        onRequestClose={closeEventDetail}
        statusBarTranslucent
      >
        <Animated.View style={[StyleSheet.absoluteFill, eventDetailStyle]}>
          {selectedEvent && (
            <EventDetail
              event={selectedEvent}
              onBack={closeEventDetail}
              onRequestSignIn={() => router.push("/(auth)/signin")}
            />
          )}
        </Animated.View>
      </Modal>
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
  stickyHeader: {
    paddingHorizontal: spacing.page,
    paddingBottom: 8,
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  resultsHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  resultsHeaderTextBlock: {
    flex: 1,
    paddingRight: 12,
  },
  startOverText: {
    ...typography.sm,
    color: colors.textSecondary,
    textDecorationLine: "underline",
    paddingTop: 3,
  },
  resultsScroll: {
    paddingTop: 16,
    paddingHorizontal: spacing.page,
    paddingBottom: 40,
  },
  browseLinkButton: {
    paddingVertical: 8,
  },
  browseLinkText: {
    ...typography.sm,
    color: colors.primary,
    textDecorationLine: "underline",
  },
  resultsHeading: {
    ...typography.sectionHeading,
  },
  resultsSubline: {
    ...typography.xs,
    color: colors.textMuted,
    marginTop: 2,
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
  // End card — shown when result pool is exhausted
  endCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 28,
    alignItems: "center",
    marginBottom: 16,
  },
  endCardTitle: {
    ...typography.sectionHeading,
    textAlign: "center",
    marginBottom: 10,
  },
  endCardSub: {
    ...typography.sm,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 20,
  },
  endCardButton: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: radius.full,
  },
  endCardButtonText: {
    ...typography.sm,
    fontWeight: "600",
    color: colors.white,
  },
  // Divider — shown after interest expansion
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 20,
    marginTop: 4,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  dividerLabel: {
    ...typography.xs,
    color: colors.textSecondary,
    fontWeight: "500",
  },
  transitionIcon: {
    fontSize: 36,
    color: colors.primary,
  },
  transitionMsg: {
    ...typography.sectionHeading,
    textAlign: "center",
    color: colors.foreground,
  },
  weekendSection: {
    marginBottom: 16,
  },
  weekendHeading: {
    ...typography.h3,
    marginBottom: 10,
  },
  weekendCard: {
    width: 140,
    height: 160,
    borderRadius: radius.md,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  weekendCardOverlay: {
    padding: 12,
    paddingTop: 48,
  },
  weekendCardTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#fff",
    lineHeight: 18,
    marginBottom: 3,
  },
  weekendCardCategory: {
    fontSize: 11,
    color: "rgba(255,255,255,0.75)",
    textTransform: "capitalize",
    fontWeight: "500",
  },
});

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  View,
  Text,
  Pressable,
  Modal,
  type LayoutChangeEvent,
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
import {
  ArrowLeft,
  Drama,
  Dumbbell,
  Laugh,
  MapPin,
  Moon,
  Music,
  Palette,
  RotateCcw,
  ShoppingBag,
  Sparkles,
  Trees,
  Trophy,
  Utensils,
  Wrench,
  Zap,
} from "lucide-react-native";
import ProgressBar from "@/components/layout/ProgressBar";
import DateRangePicker from "@/components/quiz/DateRangePicker";
import EventCard from "@/components/events/EventCard";
import SkeletonCard from "@/components/ui/SkeletonCard";
import SwipeTutorial from "@/components/ui/SwipeTutorial";
import TastePrompt from "@/components/ui/TastePrompt";
import EventDetail from "@/components/events/EventDetail";
import ResultsFilterBar from "@/components/results/ResultsFilterBar";
import BottomSheet from "@/components/ui/BottomSheet";
import SaveEventSheet from "@/components/events/SaveEventSheet";
import DeckActionBar from "@/components/events/DeckActionBar";
import OfflineBanner from "@/components/ui/OfflineBanner";
import GoingDateSheet from "@/components/events/GoingDateSheet";
import ShareSheet from "@/components/events/ShareSheet";
import { useToast } from "@/components/ui/Toast";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { saveCachedFeed, loadCachedFeed } from "@/lib/feedCache";
import { emptyNav, canGoBack, advance as navAdvance, goBack as navGoBack, type DeckNav, type DeckAction } from "@/lib/deckHistory";
import { useUser } from "@/context/UserContext";
import { getAllCandidates, getNextCandidate } from "@/lib/eventRecommendations";
import { fetchAllUpcoming, computeEventScore, type TasteContext } from "@/lib/getEvents";
import { loadTasteProfile, recordEventLike, recordEventDislike, recordEventGoing, recordEventSave, undoEventDislike, hydrateTasteProfile, incrementSeenCount } from "@/lib/tasteProfile";
import type { TasteProfile } from "@/lib/tasteProfile";
import { getDismissedEvents, addDismissedEvent } from "@/lib/storage";
import type { DismissedRecord } from "@/lib/storage";
import { track, setTrackingUserId } from "@/lib/track";
import { getOrCreateDeviceId } from "@/lib/storage";
import {
  setInteractionsUserId,
  recordImpression,
  recordSkip,
  recordNeutralSkip,
  undoNeutralSkip,
  undoSkip,
  recordSave as recordSaveInteraction,
  recordGoing as recordGoingInteraction,
  recordShare as recordShareInteraction,
  fetchHiddenEventIds,
  fetchInteractionsMap,
  flushImpressions,
  migrateFromDismissedHistory,
  type EventInteraction,
} from "@/lib/interactions";
import { colors, spacing, radius, typography, shadows } from "@/lib/theme";
import { generateGoogleCalendarUrl, addToDeviceCalendar } from "@/lib/calendar";
import type { BoroughName, EventCategory, EventDistance, SiftEvent } from "@/types/event";
import type { Filters, Step } from "@/types/quiz";

const TRANSITION_MSGS = [
  "Finding your picks...",
  "Checking what's on this weekend...",
  "Tailoring for you...",
];

type CatIcon = React.ComponentType<{ size: number; color: string; strokeWidth: number }>;

const categories: { value: EventCategory; label: string; emoji: string; Icon: CatIcon; chipBg: string; chipFg: string }[] = [
  { value: "arts",      label: "Arts & Culture",  emoji: "🎨", Icon: Palette,     chipBg: "#F5EEE3", chipFg: "#9A7244" },
  { value: "music",     label: "Live Music",       emoji: "🎵", Icon: Music,       chipBg: "#E8EEF7", chipFg: "#3B5A84" },
  { value: "outdoors",  label: "Outdoors",         emoji: "🌿", Icon: Trees,       chipBg: "#E8F0EA", chipFg: "#3A6F50" },
  { value: "fitness",   label: "Fitness",          emoji: "🏃", Icon: Dumbbell,    chipBg: "#F4E6E4", chipFg: "#8A3E38" },
  { value: "comedy",    label: "Comedy",           emoji: "😂", Icon: Laugh,       chipBg: "#F2EFDC", chipFg: "#7A6B28" },
  { value: "food",      label: "Food & Drink",     emoji: "🍷", Icon: Utensils,    chipBg: "#F5E8D6", chipFg: "#8A541A" },
  { value: "nightlife", label: "Nightlife",        emoji: "🌙", Icon: Moon,        chipBg: "#ECE6F3", chipFg: "#4A3070" },
  { value: "theater",   label: "Theater",          emoji: "🎭", Icon: Drama,       chipBg: "#E3ECF4", chipFg: "#2F4E70" },
  { value: "workshops", label: "Workshops",        emoji: "🛠️", Icon: Wrench,      chipBg: "#E8EFDC", chipFg: "#3E5A2B" },
  { value: "popups",    label: "Pop-ups & Sales",  emoji: "🛍️", Icon: ShoppingBag, chipBg: "#F2E4D8", chipFg: "#7A4028" },
  { value: "sports",    label: "Sports",            emoji: "🏆", Icon: Trophy,      chipBg: "#E8F0E8", chipFg: "#2D5A3A" },
];

const boroughOptions: { value: BoroughName; chipBg: string; chipFg: string }[] = [
  { value: "Manhattan",    chipBg: "#E8EDF5", chipFg: "#3A5FA0" },
  { value: "Brooklyn",     chipBg: "#F5EDE8", chipFg: "#A0593A" },
  { value: "Queens",       chipBg: "#EDE8F5", chipFg: "#6B3AA0" },
  { value: "Bronx",        chipBg: "#E8F5ED", chipFg: "#3AA05F" },
  { value: "Staten Island",chipBg: "#E8F4F5", chipFg: "#3A8FA0" },
];

const INTEREST_TO_CATEGORY: Record<string, EventCategory> = {
  live_music: "music", art_exhibitions: "arts", theater: "theater",
  workshops: "workshops", fitness: "fitness", comedy: "comedy",
  food: "food", outdoor: "outdoors", nightlife: "nightlife", popups: "popups",
  sports: "sports",
};

interface Slot {
  event: SiftEvent | null;
  key: string;
  type: 'event' | 'end-card' | 'done' | 'divider';
  meta?: { quizCategories?: string[] };
}

/** True when the user has narrowed the deck with any filter (U5). */
function filtersActive(f: Filters): boolean {
  return !!(
    (f.categories && f.categories.length) ||
    (f.dateFrom && f.dateTo) ||
    (f.boroughs && f.boroughs.length) ||
    f.distance ||
    f.price
  );
}

export default function DiscoverScreen() {
  const router = useRouter();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  const { isLoggedIn, userProfile, userEmail, savedEvents, goingEvents, toggleGoing, isGoing, getSavedListForEvent, addSavedEvent, removeSavedEvent, updateGoingDate, ready } = useUser();
  const { isOnline } = useNetworkStatus();

  const [interactionsMap, setInteractionsMap] = useState<Map<string, EventInteraction>>(new Map());
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

  // Load server-side interactions after identity is resolved
  const loadServerInteractions = useCallback(async () => {
    // Migrate local dismissals first (may create permanently_hidden rows)
    const history = await getDismissedEvents();
    setDismissedHistory(history);
    if (history.length > 0) {
      await migrateFromDismissedHistory(history.map((h) => h.eventId)).catch(() => {});
    }
    // Fetch after migration so newly hidden rows are included
    fetchInteractionsMap().then(setInteractionsMap);
    fetchHiddenEventIds().then(setHiddenIds);
  }, []);

  useEffect(() => {
    // Use Supabase UID if logged in, stable device ID if guest (not email — privacy)
    if (userEmail) {
      import("@/lib/supabase").then(({ supabase }) => {
        supabase?.auth.getUser().then(({ data }) => {
          const uid = data.user?.id ?? userEmail;
          setTrackingUserId(uid);
          setInteractionsUserId(uid, true); // authenticated
          loadServerInteractions();
        }).catch(() => {
          setTrackingUserId(userEmail);
          setInteractionsUserId(userEmail, true);
          loadServerInteractions();
        });
      });
    } else {
      getOrCreateDeviceId().then((id) => {
        setTrackingUserId(id);
        setInteractionsUserId(id); // guest: device ID for local tracking only
      });
      // Guest: load dismissed history from AsyncStorage only (no server calls)
      getDismissedEvents().then(setDismissedHistory);
    }
    track("app_open", { has_profile: !!userProfile });
    return () => { void flushImpressions(); };
  }, []);

  const [entryMode, setEntryMode] = useState<"chooser" | "browse" | "sift">("sift");
  const [step, setStep] = useState<Step>("category");
  const [filters, setFilters] = useState<Filters>({});
  const [slots, setSlots] = useState<Slot[]>([]);
  const [resultPool, setResultPool] = useState<SiftEvent[]>([]);
  const resultPoolRef = useRef<SiftEvent[]>([]);
  useEffect(() => { resultPoolRef.current = resultPool; }, [resultPool]);
  // Bumped after every pagination top-up so the advance-on-grow effect re-runs
  // (covers both "page appended" and "no more pages" cases).
  const [feedTick, setFeedTick] = useState(0);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const [dismissedHistory, setDismissedHistory] = useState<DismissedRecord[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<SiftEvent | null>(null);
  const [saveSheetEvent, setSaveSheetEvent] = useState<SiftEvent | null>(null);
  const [saveDateEvent, setSaveDateEvent] = useState<SiftEvent | null>(null);
  const [saveDateOverride, setSaveDateOverride] = useState<string | undefined>(undefined);
  const [goingSheetEvent, setGoingSheetEvent] = useState<SiftEvent | null>(null);
  const [shareSheetEvent, setShareSheetEvent] = useState<SiftEvent | null>(null);
  const [loading, setLoading] = useState(false);
  const [tasteProfile, setTasteProfile] = useState<TasteProfile | null>(null);
  const [cardStageHeight, setCardStageHeight] = useState(0);
  // Back/forward deck history (see lib/deckHistory). navRef holds the stacks;
  // canBack drives the header "Go back" button; activeEventRef mirrors the card
  // currently on screen so "Go back" can queue it forward.
  const navRef = useRef<DeckNav<SiftEvent>>(emptyNav());
  const [canBack, setCanBack] = useState(false);
  const activeEventRef = useRef<SiftEvent | null>(null);
  const loadingRef = useRef(false);
  const fetchVersionRef = useRef(0);
  const feedCursorRef = useRef(0); // cursor into resultPool for sequential advancement
  const servedCategoryWindowRef = useRef<EventCategory[]>([]);
  const expandedToInterestsRef = useRef(false);
  const expandedInterestCatsRef = useRef<EventCategory[]>([]);

  const commitServedCategory = (category: EventCategory) => {
    servedCategoryWindowRef.current = [...servedCategoryWindowRef.current, category].slice(-4);
  };

  // ── Continuous-deck pagination ────────────────────────────────────────────
  const FEED_PAGE_SIZE = 150;   // events fetched per DB page
  const FEED_PREFETCH = 15;     // top up when cursor is within N of the pool end
  const EXPLORE_ENABLED = false; // inject ~12% discovery wildcards (flag-gated, off)
  const pageRef = useRef(0);            // next page index to fetch
  const hasMoreRef = useRef(true);      // false once a short (< PAGE_SIZE) page returns
  const loadingMoreRef = useRef(false); // in-flight guard

  // Generate a user-facing match reason from the score explanation (display only).
  const getMatchReason = (event: SiftEvent): string => {
    const expl = (event as any).__scoreExplanation;
    if (!expl) return "Picked for you";
    const tb = expl.tasteBreakdown;
    const signals: [string, number][] = [
      ["category", tb.category], ["tags", tb.tags], ["borough", tb.borough], ["price", tb.price],
    ];
    signals.sort((a, b) => b[1] - a[1]);
    const top = signals[0];
    if (top[1] < 0.05) return event.priceLabel === "Free" ? "It's free" : "Picked for you";
    const catLabels: Record<string, string> = {
      arts: "art events", music: "live music", comedy: "comedy", food: "food events",
      outdoors: "outdoors", nightlife: "nightlife", fitness: "fitness", theater: "theater",
      workshops: "workshops", popups: "pop-ups", sports: "sports",
    };
    if (top[0] === "category") return `Because you like ${catLabels[event.category] ?? event.category}`;
    if (top[0] === "tags" && event.tags?.length) return `Because you like ${event.tags[0]}`;
    if (top[0] === "borough" && event.borough) return `Popular in ${event.borough}`;
    if (top[0] === "price" && event.priceLabel === "Free") return "It's free";
    return "Picked for you";
  };

  // Shared feed ranker — used by both the initial load and pagination top-ups so
  // every batch is ordered identically. Pipeline: hidden filter → user filters →
  // quiz hard-filter → composite score (applyPrefs) → match reasons → dedup.
  // Diversity is a single serve-time pass (isOverRepresented in nextSlotUpdate);
  // the hard per-category cap was removed for the continuous deck.
  // Content key collapses duplicate DB rows (different ids, same real event) that
  // the ingest dedup missed — title + date + borough. Two genuinely-distinct
  // same-title/date/borough events would merge, but that's rare and preferable
  // to showing the same event twice.
  const contentKey = (e: SiftEvent) =>
    (e.title ?? "").toLowerCase().replace(/[^a-z0-9]/g, "") + "|" +
    (e.startDate ?? "").slice(0, 10) + "|" + (e.borough ?? "");

  const rankFeedBatch = (
    all: SiftEvent[],
    f: Filters,
    activeProfile: TasteProfile | null,
    existing: SiftEvent[]
  ): SiftEvent[] => {
    const tasteReady = !!userProfile;
    const hasDateRange = !!(f.dateFrom && f.dateTo);

    const impressionPenalty = (eventId: string): number => {
      const interaction = interactionsMap.get(eventId);
      if (!interaction || interaction.impression_count === 0) return 1.0;
      if (interaction.going_count > 0 || interaction.save_count > 0) return 1.0;
      return Math.max(0.3, 1.0 - interaction.impression_count * 0.25);
    };
    const buildTasteCtx = (catWeight: number): TasteContext =>
      tasteReady
        ? {
            categoryWeight: catWeight,
            tagWeights: activeProfile?.tagWeights ?? {},
            boroughWeights: activeProfile?.boroughWeights ?? {},
            pricePreference: activeProfile?.pricePreference ?? { ceiling: null, freeBoost: 0 },
            interactionCount: activeProfile?.interactionCount ?? 0,
          }
        : { categoryWeight: 1.0, tagWeights: {}, boroughWeights: {}, pricePreference: { ceiling: null, freeBoost: 0 }, interactionCount: 0 };
    const applyPrefs = (tier: SiftEvent[], weights: Partial<Record<EventCategory, number>>) =>
      [...tier].sort((a, b) => {
        const wa = weights[a.category] ?? 1.0;
        const wb = weights[b.category] ?? 1.0;
        return (
          computeEventScore(b, wb, impressionPenalty(b.id), buildTasteCtx(wb), hasDateRange) -
          computeEventScore(a, wa, impressionPenalty(a.id), buildTasteCtx(wa), hasDateRange)
        );
      });

    let pool = all.filter((e) => !hiddenIds.has(e.id));
    // Distance / borough filter
    pool = pool.filter((e) => {
      if (f.boroughs && f.boroughs.length > 0) return f.boroughs.includes(e.borough as BoroughName);
      if (f.distance === "neighborhood" && e.borough !== "Manhattan") return false;
      if (f.distance === "borough" && e.borough !== "Manhattan" && e.borough !== "Brooklyn") return false;
      return true;
    });
    // Date-range filter (±1 day padding)
    if (f.dateFrom && f.dateTo) {
      const from = new Date(f.dateFrom); from.setDate(from.getDate() - 1);
      const to = new Date(f.dateTo); to.setDate(to.getDate() + 1);
      pool = pool.filter((e) => {
        const start = new Date(e.startDate);
        const end = new Date(e.endDate ?? e.startDate);
        return start <= to && end >= from;
      });
    }
    // Chosen categories are a hard filter (no "everything else" tier)
    const quizCats = f.categories ?? [];
    const ranked1 = quizCats.length > 0 ? pool.filter((e) => quizCats.includes(e.category)) : pool;
    // Composite score (taste weights only after the questionnaire is done)
    const weights = tasteReady ? (activeProfile?.categoryWeights ?? {}) : {};
    let ranked = applyPrefs(ranked1, weights);
    // Exploration wildcards — flag-gated (default off). Injects ~12% high-quality
    // events from underexplored categories to counter filter bubbles.
    if (EXPLORE_ENABLED) ranked = injectExploreSlots(ranked, pool, weights, quizCats);
    for (const e of ranked) if (!e.matchReason) e.matchReason = getMatchReason(e);
    // Dedup vs already-loaded rows (by id AND content) + session-dismissed +
    // cancelled titles. Content dedup collapses different-id duplicate rows.
    const seenIds = new Set(existing.map((e) => e.id));
    const seenContent = new Set(existing.map(contentKey));
    return ranked.filter((e) => {
      if (seenIds.has(e.id) || sessionDismissedRef.current.has(e.id)) return false;
      const ck = contentKey(e);
      if (seenContent.has(ck)) return false;
      const t = (e.title ?? "").toLowerCase();
      if (t.includes("cancelled") || t.includes("canceled")) return false;
      seenIds.add(e.id);
      seenContent.add(ck);
      return true;
    });
  };

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
  const detailCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const eventDetailStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: eventSlideY.value }],
  }));

  const openEventDetail = useCallback((event: SiftEvent) => {
    // Cancel any pending close timer from a previous close
    if (detailCloseTimer.current) {
      clearTimeout(detailCloseTimer.current);
      detailCloseTimer.current = null;
    }
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
    // Safety net: if animation callback never fires at all (production build
    // re-render interruption), force-close after 300ms. Cancelled by
    // openEventDetail if the user reopens before this fires.
    if (detailCloseTimer.current) clearTimeout(detailCloseTimer.current);
    detailCloseTimer.current = setTimeout(() => {
      setEventDetailVisible(false);
      setSelectedEvent(null);
    }, 300);
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

  // Re-rank the live pool when category weights change (from "More like this" /
  // "Not my thing" taps) so the next card reflects the updated taste. Re-ranks
  // only the UNSERVED remainder with the SAME full scoring as the initial load
  // (rankFeedBatch) — never a second, weaker sort — preserving served order.
  const categoryWeights = tasteProfile?.categoryWeights;
  useEffect(() => {
    if (!categoryWeights || Object.keys(categoryWeights).length === 0) return;
    setResultPool((prev) => {
      if (prev.length === 0) return prev;
      const cursor = feedCursorRef.current;
      const served = prev.slice(0, cursor);
      const remaining = prev.slice(cursor);
      const reranked = rankFeedBatch(remaining, filters, tasteProfile, served);
      const next = [...served, ...reranked];
      resultPoolRef.current = next;
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryWeights]);
  // Session-dismissed: never cleared by reset() — events stay gone for the whole session
  const sessionDismissedRef = useRef(new Set<string>());

  const reset = useCallback(() => {
    loadingRef.current = false;
    expandedToInterestsRef.current = false;
    expandedInterestCatsRef.current = [];
    servedCategoryWindowRef.current = [];
    sessionDismissedRef.current = new Set();
    navRef.current = emptyNav();
    setCanBack(false);
    setIsTransitioning(false);
    setEntryMode("sift");
    setStep("category");
    setFilters({});
    setSlots([]);
    setResultPool([]); resultPoolRef.current = [];
    setDismissedIds([]);
    setSelectedEvent(null);
    sessionDismissedRef.current = new Set();
  }, []);

  const handleBack = useCallback(() => {
    const flow: Step[] = ["category", "date", "distance", "results"];
    const idx = flow.indexOf(step);
    if (idx > 0) {
      quizDirectionRef.current = -1;
      setStep(flow[idx - 1]);
    }
  }, [step]);

  // Intercept Android hardware back when mid-quiz to go back one step instead of exiting
  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        if (entryMode === "sift" && step === "category") {
          reset();
          return true;
        }
        if (step !== "category") {
          handleBack();
          return true;
        }
        return false;
      };
      const sub = BackHandler.addEventListener("hardwareBackPress", onBack);
      return () => sub.remove();
    }, [entryMode, step, handleBack, reset])
  );

  // ── Diversity ─────────────────────────────────────────────────────────────
  // Single diversity pass now lives at SERVE time (isOverRepresented in
  // nextSlotUpdate: >1 of the same category in the last 4 served is deferred).
  // The old build-time capEventsPerCategory (70/cat) + diversifyFeed passes were
  // removed for the continuous deck — the 70 cap truncated single-category
  // filters, and two windowed passes were redundant.

  // ── Explore slots ──────────────────────────────────────────────────────
  // Inject ~10% high-quality wildcards from categories the user hasn't explored much
  const injectExploreSlots = (
    feed: SiftEvent[],
    fullPool: SiftEvent[],
    weights: Partial<Record<EventCategory, number>>,
    filteredCats: EventCategory[]
  ): SiftEvent[] => {
    if (filteredCats.length > 0) return feed; // user explicitly filtered — don't inject
    if (feed.length < 10) return feed;

    const feedIds = new Set(feed.map((e) => e.id));
    // Find categories with low or no weight (underexplored)
    const allCats: EventCategory[] = ["arts","music","comedy","food","outdoors","nightlife","fitness","theater","workshops","popups","sports"];
    const exploreCats = allCats.filter((c) => (weights[c] ?? 1.0) <= 1.0);
    if (exploreCats.length === 0) return feed;

    // Pick high-quality events from underexplored categories not already in feed
    const exploreCandidates = fullPool
      .filter((e) => exploreCats.includes(e.category) && !feedIds.has(e.id))
      .filter((e) => (e.vibeScore ?? 5) >= 6) // only high quality
      .slice(0, Math.ceil(feed.length * 0.12));

    if (exploreCandidates.length === 0) return feed;

    // Insert explore events at every ~8th position
    const result = [...feed];
    let inserted = 0;
    for (const exp of exploreCandidates) {
      const pos = Math.min(8 + inserted * 8, result.length);
      result.splice(pos, 0, { ...exp, matchReason: "Something different" });
      inserted++;
    }
    return result;
  };

  const goToResults = useCallback(async (f: Filters, opts?: { skipTransition?: boolean }) => {
    const version = ++fetchVersionRef.current;
    loadingRef.current = true;

    let msgTimer1: ReturnType<typeof setTimeout> | undefined;
    let msgTimer2: ReturnType<typeof setTimeout> | undefined;
    let minDelay: Promise<void>;

    try {
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

      // Ranking is owned by the shared rankFeedBatch (component scope) so the
      // initial page and pagination top-ups order identically.
      const fetchAndSort = async (): Promise<{ events: SiftEvent[]; rawCount: number }> => {
        try {
          let activeProfile: TasteProfile | null = tasteProfile;
          // Ensure taste profile is loaded (may not be ready on first render)
          if (!activeProfile || Object.keys(activeProfile.categoryWeights).length === 0) {
            activeProfile = await loadTasteProfile();
            setTasteProfile(activeProfile);
          }
          // Taste weights reorder the deck only after the questionnaire is done.
          const cw = userProfile ? activeProfile?.categoryWeights : undefined;
          const raw = await fetchAllUpcoming(FEED_PAGE_SIZE, f.categories, cw, 0);
          if (raw.length > 0) {
            const ranked = rankFeedBatch(raw, f, activeProfile, []);
            console.log('[feed:debug] page0 top 20:', ranked.slice(0, 20).map(e => e.category).join(', '));
            // Cache the ranked page so an offline relaunch has real events to show.
            void saveCachedFeed(ranked);
            return { events: ranked, rawCount: raw.length };
          }
          return { events: getAllCandidates(f, [], userProfile), rawCount: 0 };
        } catch {
          // Offline / fetch failed — prefer the last real feed over the static seed.
          const cached = await loadCachedFeed();
          if (cached.length > 0) {
            showToast("Offline — showing your recent events");
            return { events: rankFeedBatch(cached, f, tasteProfile, []), rawCount: 0 };
          }
          showToast("Couldn't connect — showing cached results");
          return { events: getAllCandidates(f, [], userProfile), rawCount: 0 };
        }
      };

      // Run fetch and minimum transition delay in parallel
      const [fetchResult] = await Promise.all([fetchAndSort(), minDelay]);
      const resultEvents = fetchResult.events;

      // If a newer filter change started while we were fetching, discard these stale results
      if (fetchVersionRef.current !== version) {
        return;
      }

      // Initialise pagination: page 0 is loaded; more pages exist iff it was full.
      pageRef.current = 1;
      hasMoreRef.current = fetchResult.rawCount === FEED_PAGE_SIZE;
      loadingMoreRef.current = false;

      clearTimeout(msgTimer1);
      clearTimeout(msgTimer2);

      // Data is ready — populate state before switching screens so no skeleton flash
      expandedToInterestsRef.current = false;
      const initial: Slot[] = resultEvents.length > 0
        ? resultEvents.slice(0, 1).map((e) => ({
            event: e,
            key: `${e.id}-${Date.now()}-${Math.random()}`,
            type: 'event' as const,
          }))
        : [filtersActive(f)
            // Filter matched nothing from the start → filter-empty state (U5),
            // not "expand to interests".
            ? { event: null, key: `done-${Date.now()}`, type: 'done' as const }
            : { event: null, key: `end-card-${Date.now()}`, type: 'end-card' as const, meta: { quizCategories: f.categories ?? [] } }];
      setResultPool(resultEvents);
      resultPoolRef.current = resultEvents; // sync ref immediately — don't wait for useEffect
      feedCursorRef.current = 1; // first event is already shown in initial slot
      servedCategoryWindowRef.current = resultEvents[0] ? [resultEvents[0].category] : [];
      navRef.current = emptyNav(); // fresh feed — no back/forward history yet
      setCanBack(false);
      setSlots(initial);
      setDismissedIds([]);

      if (!opts?.skipTransition) {
        setIsTransitioning(false);
        setStep("results");
      } else {
        setLoading(false);
      }
      track("recommendations_viewed", {
        count: initial.length,
        categories: f.categories,
      });

    } finally {
      loadingRef.current = false;
    }
  }, [userProfile, goingEvents, savedEvents, dismissedHistory, tasteProfile, interactionsMap, hiddenIds]);

  const handleFiltersChange = useCallback(async (newFilters: Filters) => {
    setFilters(newFilters);
    // Clear stale cards immediately before fetching new ones
    servedCategoryWindowRef.current = [];
    setSlots([]);
    setResultPool([]); resultPoolRef.current = [];
    setDismissedIds([]);
    await goToResults(newFilters, { skipTransition: true });
  }, [goToResults]);

  const startBrowsing = useCallback(() => {
    loadingRef.current = false;
    expandedToInterestsRef.current = false;
    expandedInterestCatsRef.current = [];
    servedCategoryWindowRef.current = [];
    sessionDismissedRef.current = new Set();
    setIsTransitioning(false);
    setEntryMode("browse");
    setStep("category");
    setFilters({});
    setSlots([]);
    setResultPool([]); resultPoolRef.current = [];
    setDismissedIds([]);
    setSelectedEvent(null);
    void goToResults({});
  }, [goToResults]);

  const startSifting = useCallback(() => {
    loadingRef.current = false;
    expandedToInterestsRef.current = false;
    expandedInterestCatsRef.current = [];
    servedCategoryWindowRef.current = [];
    sessionDismissedRef.current = new Set();
    setIsTransitioning(false);
    setEntryMode("sift");
    setStep("category");
    setFilters({});
    setSlots([]);
    setResultPool([]); resultPoolRef.current = [];
    setDismissedIds([]);
    setSelectedEvent(null);
  }, []);

  // Returns the next slot update — end card if pool exhausted, otherwise next event
  // Continuous deck: fetch the next page when the cursor nears the pool end,
  // dedupe against what's loaded, and append. Reuses the shared ranker so
  // appended pages order identically to page 0.
  const maybeLoadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current) return;
    if (feedCursorRef.current < resultPoolRef.current.length - FEED_PREFETCH) return;
    loadingMoreRef.current = true;
    const version = fetchVersionRef.current;
    try {
      const cw = userProfile ? tasteProfile?.categoryWeights : undefined;
      const raw = await fetchAllUpcoming(FEED_PAGE_SIZE, filters.categories, cw, pageRef.current * FEED_PAGE_SIZE);
      if (version !== fetchVersionRef.current) return; // filter changed mid-fetch
      pageRef.current += 1;
      hasMoreRef.current = raw.length === FEED_PAGE_SIZE;
      const fresh = rankFeedBatch(raw, filters, tasteProfile, resultPoolRef.current);
      if (fresh.length > 0) {
        const next = [...resultPoolRef.current, ...fresh];
        resultPoolRef.current = next;
        setResultPool(next);
      }
    } catch {
      // leave hasMore as-is; retried on the next advance
    } finally {
      loadingMoreRef.current = false;
      setFeedTick((t) => t + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, tasteProfile, userProfile, hiddenIds, interactionsMap]);

  const nextSlotUpdate = (
    prev: Slot[],
    idx: number,
    excludedIds: Set<string>,
    quizCategories: string[]
  ): Slot[] => {
    // Advance cursor through the diversified pool sequentially
    const pool = resultPoolRef.current;
    const recentCategories = servedCategoryWindowRef.current.slice(-4);
    const isOverRepresented = (candidate: SiftEvent) =>
      recentCategories.filter((category) => category === candidate.category).length > 1;
    let next: SiftEvent | undefined;
    let diversityFallback: SiftEvent | undefined;
    console.log(`[feed:slot] cursor=${feedCursorRef.current}, pool=${pool.length}`);
    while (feedCursorRef.current < pool.length) {
      const candidate = pool[feedCursorRef.current];
      feedCursorRef.current++;
      if (!excludedIds.has(candidate.id)) {
        if (isOverRepresented(candidate)) {
          diversityFallback ??= candidate;
          continue; // keep scanning for a diverse event
        }
        next = candidate;
        break;
      }
    }
    if (!next) next = diversityFallback;
    if (!next) next = getNextCandidate([...excludedIds], filters, userProfile) ?? undefined;

    if (next) {
      console.log(`[feed:slot] serving: "${next.title?.slice(0,30)}" (${next.category}) cursor now=${feedCursorRef.current}`);
      commitServedCategory(next.category);
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

    // More DB pages exist for this filter — don't end yet. Trigger a top-up and
    // hold on an empty slot (skeleton); the advance-on-grow effect serves the
    // next card once the page lands.
    if (hasMoreRef.current) {
      void maybeLoadMore();
      return [];
    }

    // Last event slot exhausted — now show the end card if we have interests to expand to
    const interestCats = (userProfile?.interests ?? [])
      .map((i) => INTEREST_TO_CATEGORY[i])
      .filter((c): c is EventCategory => !!c && !quizCategories.includes(c));

    const alreadyHasEndCard = prev.some((s) => s.type === 'end-card');

    // When the user explicitly chose categories in the question sequence, never
    // offer to expand into other interest categories — chosen categories are a
    // hard filter. Only offer expansion when no explicit choice was made.
    if (
      quizCategories.length === 0 &&
      !expandedToInterestsRef.current &&
      interestCats.length > 0 &&
      !alreadyHasEndCard
    ) {
      return [{
        event: null,
        key: `end-card-${Date.now()}`,
        type: 'end-card',
        meta: { quizCategories },
      }];
    }

    // All events exhausted (including post-expand batch) — show done card
    return [{ event: null, key: `done-${Date.now()}`, type: 'done' as const }];
  };

  // When a pagination top-up lands (or confirms exhaustion) while we're holding
  // an empty slot, serve the next available card (or fall through to the done card).
  useEffect(() => {
    if (step !== "results") return;
    setSlots((prev) => {
      if (prev.length !== 0) return prev;
      return nextSlotUpdate([], 0, new Set(dismissedIds), filters.categories?.map(String) ?? []);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedTick]);

  // Advance the slot after any dismiss (shared by neutral + hard pass)
  const advanceDismissSlot = useCallback(
    (eventId: string, nextDismissed: string[]) => {
      setSlots((prev) => {
        const idx = prev.findIndex((s) => s.event?.id === eventId);
        if (idx === -1) return prev;
        const shownIds = new Set(prev.map((s) => s.event?.id).filter(Boolean) as string[]);
        const excludedIds = new Set([...nextDismissed, ...shownIds]);
        return nextSlotUpdate(prev, idx, excludedIds, filters.categories?.map(String) ?? []);
      });
      void maybeLoadMore();
    },
    [filters, maybeLoadMore]
  );

  // Drop a specific event into the active card slot (used for back/forward nav).
  const showEventInActiveSlot = useCallback((evt: SiftEvent) => {
    setSlots((prev) => {
      commitServedCategory(evt.category);
      if (prev.length === 0) {
        return [{ event: evt, key: `nav-${evt.id}-${Date.now()}`, type: 'event' }];
      }
      const activeIdx = prev.findIndex((s) => s.type !== 'divider');
      const idx = activeIdx === -1 ? 0 : activeIdx;
      const next = [...prev];
      next[idx] = { event: evt, key: `nav-${evt.id}-${Date.now()}`, type: 'event' };
      return next;
    });
  }, []);

  // Advance after a swipe, honoring nav history: restore a queued forward card if
  // the user had gone back, otherwise serve a fresh one from the pool.
  const advanceAfterAction = useCallback(
    (event: SiftEvent, action: DeckAction | 'going', nextDismissed: string[]) => {
      const { nav, restore } = navAdvance(navRef.current, event, action);
      navRef.current = nav;
      setCanBack(canGoBack(nav));
      if (restore) {
        showEventInActiveSlot(restore);
      } else {
        advanceDismissSlot(event.id, nextDismissed);
      }
    },
    [advanceDismissSlot, showEventInActiveSlot]
  );

  // Left swipe = "Not now" — no taste impact, event resurfaces later
  const handleNeutralSkip = useCallback(
    (eventId: string) => {
      sessionDismissedRef.current.add(eventId);
      const nextDismissed = [...dismissedIds, eventId];
      setDismissedIds(nextDismissed);

      const event = resultPool.find((e) => e.id === eventId);

      // No taste weight update — just increment interaction count + record suppression
      const daysLeft = event?.daysLeft;
      recordNeutralSkip(eventId, daysLeft).catch(() => {});
      // Persist interactionCount so "events seen" reflects all swipes
      incrementSeenCount().then(setTasteProfile).catch(() => {});

      if (event) advanceAfterAction(event, 'neutral', nextDismissed);
      else advanceDismissSlot(eventId, nextDismissed);
    },
    [dismissedIds, resultPool, advanceAfterAction, advanceDismissSlot]
  );

  // Down swipe = "Not interested" — negative taste impact, counts toward permanent hide
  const handleHardPass = useCallback(
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
        recordEventDislike(eventId, dismissed.category, {
          category: dismissed.category,
          tags: dismissed.tags,
          borough: dismissed.borough,
          price: dismissed.price,
        }).then(setTasteProfile).catch(() => {});
        recordSkip(eventId).then((hidden) => {
          if (hidden) {
            setHiddenIds((prev) => new Set([...prev, eventId]));
            // U4: the 3rd pass permanently hides the event — say so ("Go back" in
            // the header brings it back).
            showToast("Got it — we'll stop showing this one. Tap Go back to undo.");
          }
        }).catch(() => {});
      }

      if (dismissed) advanceAfterAction(dismissed, 'hard', nextDismissed);
      else advanceDismissSlot(eventId, nextDismissed);
    },
    [dismissedIds, resultPool, advanceAfterAction, advanceDismissSlot]
  );

  // "Go back" — step back to the most recent reversible card (neutral / hard
  // dismiss). Reverses that card's side-effects and queues the on-screen card
  // forward, so re-deciding the restored card walks you back to where you were.
  const handleGoBack = useCallback(() => {
    const result = navGoBack(navRef.current, activeEventRef.current);
    if (!result) return;
    navRef.current = result.nav;
    setCanBack(canGoBack(result.nav));
    const { item: evt, action } = result.reverse;
    sessionDismissedRef.current.delete(evt.id);
    setDismissedIds((prev) => prev.filter((id) => id !== evt.id));
    if (action === 'hard') {
      undoEventDislike(evt.id, evt.category, {
        category: evt.category, tags: evt.tags, borough: evt.borough, price: evt.price,
      }).then(setTasteProfile).catch(() => {});
      undoSkip(evt.id).catch(() => {});
    } else {
      undoNeutralSkip(evt.id).catch(() => {});
    }
    showEventInActiveSlot(evt);
  }, [showEventInActiveSlot]);

  // Advances the slot for a going-swiped event (shared by instant-going and date-picker confirm)
  const advanceGoingSlot = useCallback(
    (event: SiftEvent) => {
      sessionDismissedRef.current.add(event.id);
      const nextDismissed = [...dismissedIds, event.id];
      setDismissedIds(nextDismissed);
      advanceAfterAction(event, 'going', nextDismissed);
    },
    [dismissedIds, advanceAfterAction]
  );

  // Fetches interest-based events and injects them after the end card
  const expandToInterests = useCallback(async () => {
    if (expandedToInterestsRef.current) return;

    // Chosen categories are a hard filter — never expand into other interest
    // categories when the user explicitly picked categories in the sequence.
    if (filters.categories?.length) {
      setSlots([{ event: null, key: `done-${Date.now()}`, type: 'done' }]);
      return;
    }

    expandedToInterestsRef.current = true;

    const interestCats = (userProfile?.interests ?? [])
      .map((i) => INTEREST_TO_CATEGORY[i])
      .filter((c): c is EventCategory => !!c && !(filters.categories ?? []).includes(c));

    if (!interestCats.length) {
      setSlots([{ event: null, key: `done-${Date.now()}`, type: 'done' }]);
      return;
    }

    const events = await fetchAllUpcoming(200, interestCats, tasteProfile?.categoryWeights);
    const alreadyUsed = new Set([...dismissedIds, ...resultPool.map((e) => e.id)]);
    const fresh = events.filter((e) => !alreadyUsed.has(e.id));
    if (!fresh.length) {
      setSlots([{ event: null, key: `done-${Date.now()}`, type: 'done' }]);
      return;
    }

    expandedInterestCatsRef.current = interestCats;
    setResultPool((prev) => [...prev, ...fresh]);
    commitServedCategory(fresh[0].category);
    setSlots(
      fresh.slice(0, 1).map((e) => ({
        event: e,
        key: `${e.id}-${Date.now()}-${Math.random()}`,
        type: 'event' as const,
      }))
    );
  }, [userProfile, filters, dismissedIds, resultPool, tasteProfile]);

  const activeSlot = slots[0] ?? null;
  const activeQuizLabels = (activeSlot?.meta?.quizCategories ?? [])
    .map((c: string) => categories.find((cat) => cat.value === c)?.label ?? c)
    .join(" · ");

  // Track impression when a new event card becomes active
  useEffect(() => {
    if (activeSlot?.type === 'event' && activeSlot.event) {
      recordImpression(activeSlot.event.id);
    }
    // Mirror the on-screen card so "Go back" can queue it forward.
    activeEventRef.current = activeSlot?.type === 'event' ? activeSlot.event ?? null : null;
  }, [activeSlot?.key]);

  const handleCardStageLayout = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = Math.round(event.nativeEvent.layout.height);
    setCardStageHeight((prev) => (prev === nextHeight ? prev : nextHeight));
  }, []);

  const promptCalendar = useCallback((ev: SiftEvent) => {
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
  }, [showToast]);

  const handleGoingSwipe = useCallback(
    (event: SiftEvent) => {
      // Guests must sign in to save going. Sign-in is a modal (returnTo keeps the
      // deck mounted underneath), so we land back on this exact card afterward.
      if (!isLoggedIn) {
        router.push({ pathname: "/(auth)/signin", params: { returnTo: "/(tabs)/discover" } });
        return;
      }
      const isMultiDate = (event.sessions && event.sessions.length > 1) ||
        (!!event.endDate && event.endDate !== event.startDate);

      if (isMultiDate) {
        // Store the event and open the date picker — advance the slot on confirm
        setGoingSheetEvent(event);
        advanceGoingSlot(event);
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
      promptCalendar(event);
      recordEventGoing(event.id, event.category, {
        category: event.category, tags: event.tags, borough: event.borough, price: event.price,
      }).then(setTasteProfile).catch(() => {});
      recordGoingInteraction(event.id).catch(() => {});
      advanceGoingSlot(event);
    },
    [isLoggedIn, toggleGoing, advanceGoingSlot, showToast, promptCalendar]
  );

  // Interested = if already saved, unsave; otherwise open the Save-to-list sheet
  // so the user picks which list. For a multi-date event, prompt for the date
  // first so it's saved under the date they mean (not the first/past one).
  const handleInterested = useCallback(
    (event: SiftEvent) => {
      // Guests must sign in to save. Modal sign-in preserves the card.
      if (!isLoggedIn) {
        router.push({ pathname: "/(auth)/signin", params: { returnTo: "/(tabs)/discover" } });
        return;
      }
      if (getSavedListForEvent(event.id)) {
        removeSavedEvent(event.id);
        showToast("Removed from your lists");
        return;
      }
      track("event_saved", { event_id: event.id });
      const isMultiDate = (event.sessions && event.sessions.length > 1) ||
        (!!event.endDate && event.endDate !== event.startDate);
      if (isMultiDate) {
        setSaveDateEvent(event);
      } else {
        setSaveDateOverride(undefined);
        setSaveSheetEvent(event);
      }
    },
    [isLoggedIn, getSavedListForEvent, removeSavedEvent, showToast]
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

  if (entryMode === "chooser") {
    return (
      <View style={s.choicePage}>
        <View style={[s.stickyHeader, { paddingTop: insets.top + 16 }]}>
          <Text style={s.stickyHeading}>Discover</Text>
        </View>
        <ScrollView
          contentContainerStyle={[s.choiceScroll, { paddingTop: 18, paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={s.choiceInner}>
            <View style={s.catHeader}>
              <Text style={s.catHeading}>How do you want{"\n"}to explore?</Text>
            </View>

            <View style={s.choiceButtons}>
              <Pressable onPress={startBrowsing} style={[s.choiceAction, s.choiceActionPrimary]}>
                <Text style={s.choiceActionPrimaryText}>Surprise me</Text>
              </Pressable>

              <Pressable onPress={startSifting} style={[s.choiceAction, s.choiceActionSecondary]}>
                <Text style={s.choiceActionSecondaryText}>Sifting Event!</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  // ── Quiz steps ─────────────────────────────────────────

  if (entryMode === "sift" && (step === "category" || step === "date" || step === "distance")) {
    return (
      <View style={s.catPageContainer}>
        <View style={{ paddingTop: insets.top + 16 }} />
        <ProgressBar step={step} />
        <ScrollView
          contentContainerStyle={[s.dateScroll, { paddingTop: 24, paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View style={quizAnimStyle}>
            {/* Nav row — back button or spacer */}
            <View style={s.catNav}>
              {step !== "category" ? (
                <Pressable onPress={handleBack} style={s.quizBackButton}>
                  <ArrowLeft size={16} color={colors.foreground} strokeWidth={1.5} />
                  <Text style={s.quizBackText}>Back</Text>
                </Pressable>
              ) : (
                <View style={s.catNavSpacer} />
              )}
            </View>

            {/* ── Category step ── */}
            {step === "category" && (
              <View>
                <View style={s.catHeader}>
                  <Text style={s.catHeading}>What are you{"\n"}in the mood for?</Text>
                </View>
                <View style={s.catGrid}>
                  {categories.map((c) => {
                    const cats = filters.categories ?? [];
                    const isSelected = cats.includes(c.value);
                    return (
                      <Pressable
                        key={c.value}
                        style={[s.catTile, isSelected && s.catTileSelected]}
                        onPress={() => {
                          const next = isSelected
                            ? cats.filter((x) => x !== c.value)
                            : [...cats, c.value];
                          setFilters((f) => ({
                            ...f,
                            categories: next.length > 0 ? next : undefined,
                          }));
                        }}
                      >
                        <View style={[s.catIconWrap, { backgroundColor: isSelected ? "rgba(255,255,255,0.25)" : c.chipBg }]}>
                          <c.Icon size={16} color={isSelected ? colors.white : c.chipFg} strokeWidth={1.5} />
                        </View>
                        <Text style={[s.catLabel, isSelected && s.catLabelSelected]} numberOfLines={1}>
                          {c.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                  {/* Surprise me tile */}
                  <Pressable
                    style={s.catTile}
                    onPress={() => { setFilters((f) => ({ ...f, categories: undefined })); setStep("date"); }}
                  >
                    <LinearGradient
                      colors={["#C8DCF0", "#D8E9F6", "#E8F2FB"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={[StyleSheet.absoluteFillObject, { borderRadius: radius.full }]}
                    />
                    <View style={[s.catIconWrap, { backgroundColor: "rgba(58,110,165,0.14)" }]}>
                      <Sparkles size={16} color="#3A6EA5" strokeWidth={1.5} />
                    </View>
                    <Text style={[s.catLabel, { color: "#3A6EA5" }]} numberOfLines={1}>Anything works</Text>
                  </Pressable>
                </View>
                <View style={[s.catButtons, { marginTop: 28 }]}>
                  <Pressable
                    onPress={() => setStep("date")}
                    disabled={!filters.categories?.length}
                    style={[s.catContinueButton, !filters.categories?.length && { opacity: 0.4 }]}
                  >
                    <Text style={s.catContinueText}>Continue</Text>
                  </Pressable>
                  <Pressable onPress={startBrowsing} style={s.catBrowseButton}>
                    <Text style={s.catBrowseText}>Browse all events</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* ── Date step ── */}
            {step === "date" && (
              <View>
                <View style={s.catHeader}>
                  <Text style={s.catHeading}>When are you free?</Text>
                </View>
                <View style={s.datePickerWrap}>
                  <DateRangePicker
                    dateFrom={filters.dateFrom}
                    dateTo={filters.dateTo}
                    onChange={(from, to) =>
                      setFilters((f) => ({ ...f, dateFrom: from, dateTo: to }))
                    }
                  />
                </View>
                <View style={[s.catButtons, { marginTop: 28 }]}>
                  <View style={{ alignItems: "center" }}>
                    <Pressable
                      style={s.catTile}
                      onPress={() => {
                        setFilters((f) => ({ ...f, dateFrom: undefined, dateTo: undefined }));
                        setStep("distance");
                      }}
                    >
                      <LinearGradient
                        colors={["#C8DCF0", "#D8E9F6", "#E8F2FB"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[StyleSheet.absoluteFillObject, { borderRadius: radius.full }]}
                      />
                      <View style={[s.catIconWrap, { backgroundColor: "rgba(58,110,165,0.14)" }]}>
                        <Zap size={16} color="#3A6EA5" strokeWidth={1.5} />
                      </View>
                      <Text style={[s.catLabel, { color: "#3A6EA5" }]}>I'm flexible</Text>
                    </Pressable>
                  </View>
                  <Pressable
                    onPress={() => {
                      if (filters.dateFrom && !filters.dateTo) {
                        setFilters((f) => ({ ...f, dateTo: f.dateFrom }));
                      }
                      setStep("distance");
                    }}
                    disabled={!filters.dateFrom}
                    style={[s.catContinueButton, { marginTop: 12 }, !filters.dateFrom && { opacity: 0.4 }]}
                  >
                    <Text style={s.catContinueText}>Continue</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* ── Distance / Borough step ── */}
            {step === "distance" && (
              <View>
                <View style={[s.catHeader, { marginTop: 60 }]}>
                  <Text style={s.catHeading}>Where in NYC?</Text>
                </View>
                <View style={s.catGrid}>
                  {boroughOptions.map((b) => {
                    const selected = (filters.boroughs ?? []).includes(b.value);
                    return (
                      <Pressable
                        key={b.value}
                        style={[s.catTile, selected && s.catTileSelected]}
                        onPress={() => {
                          const cur = filters.boroughs ?? [];
                          const next = selected
                            ? cur.filter((x) => x !== b.value)
                            : [...cur, b.value];
                          setFilters((f) => ({ ...f, boroughs: next.length > 0 ? next : undefined }));
                        }}
                      >
                        <View style={[s.catIconWrap, { backgroundColor: selected ? "rgba(255,255,255,0.25)" : b.chipBg }]}>
                          <MapPin size={16} color={selected ? colors.white : b.chipFg} strokeWidth={1.5} />
                        </View>
                        <Text style={[s.catLabel, selected && s.catLabelSelected]} numberOfLines={1}>
                          {b.value}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                {/* Anywhere — own centered row */}
                <View style={{ alignItems: "center", marginTop: 20 }}>
                  <Pressable
                    style={s.catTile}
                    onPress={() => {
                      const f = { ...filters, boroughs: undefined };
                      setFilters(f);
                      goToResults(f);
                    }}
                  >
                    <LinearGradient
                      colors={["#C8DCF0", "#D8E9F6", "#E8F2FB"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={[StyleSheet.absoluteFillObject, { borderRadius: radius.full }]}
                    />
                    <View style={[s.catIconWrap, { backgroundColor: "rgba(58,110,165,0.14)" }]}>
                      <Sparkles size={16} color="#3A6EA5" strokeWidth={1.5} />
                    </View>
                    <Text style={[s.catLabel, { color: "#3A6EA5" }]} numberOfLines={1}>Anywhere</Text>
                  </Pressable>
                </View>
                <View style={[s.catButtons, { marginTop: 28 }]}>
                  <Pressable
                    onPress={() => goToResults(filters)}
                    disabled={!(filters.boroughs?.length)}
                    style={[s.catContinueButton, !(filters.boroughs?.length) && { opacity: 0.4 }]}
                  >
                    <Text style={s.catContinueText}>Let's explore!</Text>
                  </Pressable>
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
        <Text style={s.stickyHeading}>Discover</Text>
        <View style={[s.headerActions, { top: insets.top + 14 }]}>
          <Pressable
            onPress={handleGoBack}
            disabled={!canBack}
            style={[s.headerPill, !canBack && s.headerPillDisabled]}
            hitSlop={8}
          >
            <ArrowLeft
              size={14}
              color={canBack ? colors.textSecondary : colors.textMuted}
              strokeWidth={1.8}
            />
            <Text style={[s.headerPillText, !canBack && s.headerPillTextDisabled]}>
              Go back
            </Text>
          </Pressable>
          <Pressable onPress={reset} style={s.headerPill} hitSlop={8}>
            <RotateCcw size={14} color={colors.textSecondary} strokeWidth={1.8} />
            <Text style={s.headerPillText}>Reset</Text>
          </Pressable>
        </View>
      </View>


      <View style={s.resultsStage}>
        {!isOnline && <OfflineBanner />}
        <View style={s.resultsFilters}>
          <ResultsFilterBar filters={filters} onChange={handleFiltersChange} />
        </View>

        {/* First-run nudge to set taste — logged-in accounts without a profile */}
        <TastePrompt
          show={isLoggedIn && !userProfile?.interests?.length}
          onPress={() => router.push("/(onboarding)/flow")}
        />

        {/* First-run forced tutorial — press Next through each gesture, once */}
        <SwipeTutorial show={activeSlot?.type === 'event'} />

        {!activeSlot && !loading && (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 40 }}>
            <SkeletonCard />
          </View>
        )}

        {activeSlot?.type === 'divider' && (
          <View style={s.dividerRow}>
            <View style={s.dividerLine} />
            <Text style={s.dividerLabel}>Now showing events for you</Text>
            <View style={s.dividerLine} />
          </View>
        )}

        {activeSlot?.type === 'end-card' && (
          <View style={s.endCard}>
            <Text style={s.endCardTitle}>
              {activeQuizLabels
                ? `That's the good stuff for ${activeQuizLabels}.`
                : "You've seen it all."}
            </Text>
            <Text style={s.endCardSub}>
              {activeQuizLabels
                ? "Here's what else fits your taste"
                : "More events based on your interests"}
            </Text>
            <Pressable onPress={expandToInterests} style={s.endCardButton}>
              <Text style={s.endCardButtonText}>Keep exploring</Text>
            </Pressable>
          </View>
        )}

        {activeSlot?.type === 'done' && (
          <View style={s.endCard}>
            {filtersActive(filters) ? (
              <>
                <Text style={s.endCardTitle}>No events match these filters.</Text>
                <Text style={s.endCardSub}>Clear them to see everything happening.</Text>
                <Pressable onPress={() => handleFiltersChange({})} style={s.endCardButton}>
                  <Text style={s.endCardButtonText}>Clear filters</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={s.endCardTitle}>You've seen it all.</Text>
                <Text style={s.endCardSub}>No more events match your picks right now.</Text>
                <Pressable
                  onPress={() => handleFiltersChange({ ...filters, dateFrom: undefined, dateTo: undefined, distance: undefined, boroughs: undefined })}
                  style={s.endCardButton}
                >
                  <Text style={s.endCardButtonText}>Broaden search</Text>
                </Pressable>
              </>
            )}
            <Pressable onPress={reset} style={[s.browseLinkButton, { marginTop: 8 }]}>
              <Text style={s.browseLinkText}>Start over</Text>
            </Pressable>
          </View>
        )}

        {activeSlot?.type === 'event' && activeSlot.event && (
          <View key={activeSlot.key} style={s.activeCardWrap} onLayout={handleCardStageLayout}>
            <EventCard
              event={activeSlot.event}
              immersive
              immersiveHeight={cardStageHeight}
              onPress={() => {
                track("card_tap", { event_id: activeSlot.event!.id, category: activeSlot.event!.category });
                openEventDetail(activeSlot.event!);
              }}
              onDismiss={() => handleNeutralSkip(activeSlot.event!.id)}
              onHardPass={() => handleHardPass(activeSlot.event!.id)}
              onGoing={() => handleGoingSwipe(activeSlot.event!)}
              onRequestSignIn={() => router.push({ pathname: "/(auth)/signin", params: { returnTo: "/(tabs)/discover" } })}
              onSharePress={() => {
                track("share_tap", { event_id: activeSlot.event!.id });
                setShareSheetEvent(activeSlot.event!);
              }}
            />
          </View>
        )}

        {activeSlot?.type === 'event' && activeSlot.event && (
          <DeckActionBar
            saved={!!getSavedListForEvent(activeSlot.event.id)}
            going={isGoing(activeSlot.event.id)}
            onInterested={() => handleInterested(activeSlot.event!)}
            onInterestedLongPress={() => handleInterested(activeSlot.event!)}
            onGoing={() => handleGoingSwipe(activeSlot.event!)}
            onNotNow={() => handleNeutralSkip(activeSlot.event!.id)}
            onNotInterested={() => handleHardPass(activeSlot.event!.id)}
          />
        )}

        {loading && (
          <View style={s.loadingWrap}>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </View>
        )}
      </View>

      {/* Multi-date save — pick which date before choosing a list */}
      <BottomSheet
        open={!!saveDateEvent}
        onClose={() => setSaveDateEvent(null)}
        title="Pick a date"
      >
        {saveDateEvent && (
          <GoingDateSheet
            event={saveDateEvent}
            confirmLabel="Choose date"
            initialDate={
              goingEvents.find((g) => g.eventId === saveDateEvent.id)?.eventDate ??
              savedEvents.find((s) => s.eventId === saveDateEvent.id)?.eventStartDate ??
              null
            }
            onConfirm={(date) => {
              const ev = saveDateEvent;
              // Keep a going copy's date in sync with the save date.
              updateGoingDate(ev.id, date);
              // Close this sheet, then open the list sheet AFTER its native Modal
              // fully dismisses (~300ms) — iOS can't present two Modals at once.
              setSaveDateEvent(null);
              setTimeout(() => {
                setSaveDateOverride(date);
                setSaveSheetEvent(ev);
              }, 350);
            }}
            onCancel={() => setSaveDateEvent(null)}
          />
        )}
      </BottomSheet>

      <BottomSheet
        open={!!saveSheetEvent}
        onClose={() => { setSaveSheetEvent(null); setSaveDateOverride(undefined); }}
        title="Save to list"
      >
        {saveSheetEvent && (
          <SaveEventSheet
            event={saveSheetEvent}
            currentListName={null}
            dateOverride={saveDateOverride}
            onClose={() => { setSaveSheetEvent(null); setSaveDateOverride(undefined); }}
            onSaved={(name) => {
              showToast(`Saved to ${name}`);
              if (saveSheetEvent) {
                recordEventSave(saveSheetEvent.id, saveSheetEvent.category, {
                  category: saveSheetEvent.category, tags: saveSheetEvent.tags, borough: saveSheetEvent.borough, price: saveSheetEvent.price,
                })
                  .then(setTasteProfile).catch(() => {});
                recordSaveInteraction(saveSheetEvent.id).catch(() => {});
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
            initialDate={
              goingEvents.find((g) => g.eventId === goingSheetEvent.id)?.eventDate ??
              savedEvents.find((s) => s.eventId === goingSheetEvent.id)?.eventStartDate ??
              null
            }
            onConfirm={(date) => {
              toggleGoing({
                eventId: goingSheetEvent.id,
                eventTitle: goingSheetEvent.title,
                eventDate: date,
                eventEndDate: goingSheetEvent.endDate,
              });
              // Keep a saved copy's date in sync with the going date.
              const savedList = getSavedListForEvent(goingSheetEvent.id);
              if (savedList) {
                addSavedEvent(goingSheetEvent.id, savedList, {
                  title: goingSheetEvent.title, startDate: date, endDate: goingSheetEvent.endDate,
                });
              }
              track("event_going", { event_id: goingSheetEvent.id, source: "swipe" });
              showToast("Marked as going");
              promptCalendar({ ...goingSheetEvent, startDate: date, endDate: date });
              recordEventGoing(goingSheetEvent.id, goingSheetEvent.category, {
                category: goingSheetEvent.category, tags: goingSheetEvent.tags, borough: goingSheetEvent.borough, price: goingSheetEvent.price,
              }).then(setTasteProfile).catch(() => {});
              recordGoingInteraction(goingSheetEvent.id).catch(() => {});
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
            onClose={() => {
              if (shareSheetEvent) recordShareInteraction(shareSheetEvent.id).catch(() => {});
              setShareSheetEvent(null);
            }}
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
              onRequestSignIn={() => router.push({ pathname: "/(auth)/signin", params: { returnTo: "/(tabs)/discover" } })}
            />
          )}
        </Animated.View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  choicePage: {
    flex: 1,
    backgroundColor: colors.background,
  },
  choiceScroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.page,
    justifyContent: "center",
  },
  choiceInner: {
    width: "100%",
    maxWidth: 360,
    alignSelf: "center",
  },
  choiceButtons: {
    gap: 12,
  },
  choiceAction: {
    paddingVertical: 15,
    borderRadius: radius.full,
    alignItems: "center",
  },
  choiceActionPrimary: {
    backgroundColor: colors.primary,
  },
  choiceActionPrimaryText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.white,
  },
  choiceActionSecondary: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  choiceActionSecondaryText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.foreground,
  },
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
  heading: { ...typography.sectionHeading, marginBottom: 8 },
  sub: { ...typography.sm, color: colors.textSecondary, lineHeight: 22, marginBottom: 24 },
  // ── Quiz step styles ─────────────────────────────────
  catPageContainer: {
    flex: 1,
    backgroundColor: colors.white,
  },
  dateScroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.page,
  },
  catNav: {
    paddingBottom: 8,
  },
  catNavSpacer: { height: 20 },
  quizBackButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  quizBackText: { ...typography.sm, color: colors.foreground },
  catHeader: {
    alignItems: "center",
    marginTop: 28,
    marginBottom: 28,
  },
  catHeading: {
    fontSize: 26,
    fontWeight: "700",
    color: colors.foreground,
    textAlign: "center",
    lineHeight: 34,
    letterSpacing: -0.4,
    marginBottom: 8,
  },
  catSub: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  catGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 10,
  },
  catTile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    shadowColor: "#111827",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
    overflow: "hidden",
  },
  catTileSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  catIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  catLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.foreground,
  },
  catLabelSelected: { color: colors.white },
  catButtons: {
    paddingHorizontal: 0,
    gap: 10,
  },
  catContinueButton: {
    paddingVertical: 15,
    borderRadius: radius.full,
    alignItems: "center",
    backgroundColor: colors.primary,
  },
  catContinueText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.white,
  },
  catBrowseButton: {
    paddingVertical: 15,
    borderRadius: radius.full,
    alignItems: "center",
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  catBrowseText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.primary,
  },
  datePickerWrap: {
    alignItems: "center",
    marginTop: 8,
  },
  stickyHeader: {
    paddingHorizontal: spacing.page,
    paddingBottom: 8,
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  stickyHeading: {
    ...typography.sectionHeading,
  },
  resultsHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  headerActions: {
    position: "absolute",
    right: spacing.page,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  headerPillDisabled: {
    opacity: 0.5,
  },
  headerPillText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  headerPillTextDisabled: {
    color: colors.textMuted,
  },
  resultsStage: {
    flex: 1,
    paddingTop: 16,
    paddingHorizontal: spacing.page,
    paddingBottom: 20,
  },
  resultsFilters: {
    marginBottom: 14,
  },
  activeCardWrap: {
    flex: 1,
    minHeight: 0,
  },
  loadingWrap: {
    paddingTop: 8,
  },
  browseLinkButton: {
    paddingVertical: 8,
  },
  browseLinkText: {
    ...typography.sm,
    color: colors.primary,
    textDecorationLine: "underline",
  },
  // End card — shown when result pool is exhausted
  endCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 28,
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
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
});

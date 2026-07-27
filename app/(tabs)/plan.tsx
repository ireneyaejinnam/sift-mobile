import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated as NativeAnimated,
  Image,
  type LayoutChangeEvent,
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import EventDetail from "@/components/events/EventDetail";
import CalendarSection from "@/components/profile/CalendarSection";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  CalendarDays,
  CalendarPlus,
  Check,
  ChevronDown,
  ChevronRight,
  Link2,
  List,
  Share2,
} from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import { useToast } from "@/components/ui/Toast";
import { useUser } from "@/context/UserContext";
import { track } from "@/lib/track";
import { recordEventWent } from "@/lib/tasteProfile";
import { recordWent } from "@/lib/interactions";
import { todayNYC } from "@/lib/time";
import { generateGoogleCalendarUrl, shareICSFile } from "@/lib/calendar";
import { fetchEventById } from "@/lib/getEvents";
import { supabase } from "@/lib/supabase";
import { fetchPlanEventOrders, syncPlanEventOrder } from "@/lib/userDataService";
import { events as allEvents } from "@/data/events";
import type { SiftEvent } from "@/types/event";
import type { GoingEvent } from "@/types/user";
import DraggableFlatList, {
  ScaleDecorator,
  type RenderItemParams,
} from "react-native-draggable-flatlist";

const LIST_PAGE_SIZE = 8;

/** A saved event paired with the user's chosen date (going/saved/first). */
type ListItem = { event: SiftEvent; date: string };
import EventPlanCard from "@/components/events/EventPlanCard";
import SavedEventRow from "@/components/events/SavedEventRow";
import { colors, radius, spacing, typography, shadows } from "@/lib/theme";

type PlanStep = "shortlist" | "confirm" | "success";
type PlanViewMode = "calendar" | "list";

function groupByDay(
  eventList: SiftEvent[]
): { label: string; date: string; events: SiftEvent[] }[] {
  const groups: Record<string, SiftEvent[]> = {};
  for (const e of eventList) {
    const d = e.startDate;
    if (!groups[d]) groups[d] = [];
    groups[d].push(e);
  }
  return Object.entries(groups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, evts]) => ({
      label: formatDayLabel(date),
      date,
      events: evts.sort((a, b) => a.time.localeCompare(b.time)),
    }));
}

function formatDayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

function formatTimeShort(time: string): string {
  const match = time.match(/(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)/);
  return match ? match[1] : time.split("\n")[0].trim().slice(0, 20);
}

function formatShortDay(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function PlanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const { isLoggedIn, goingEvents, savedEvents, getAllListNames, isGoing, getGoingEvent, markWent, toggleGoing, removeSavedEvent, reorderCustomLists, refreshFromRemote } = useUser();

  useFocusEffect(
    useCallback(() => {
      if (isLoggedIn) void refreshFromRemote();
    }, [isLoggedIn, refreshFromRemote])
  );
  const [planStep, setPlanStep] = useState<PlanStep>("shortlist");
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [detailEvent, setDetailEvent] = useState<{ event: SiftEvent; goingDate: string } | null>(null);
  // Manual order per day: date → ordered event IDs
  const [dayOrder, setDayOrder] = useState<Record<string, string[]>>({});
  const [isDraggingList, setIsDraggingList] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [hasLoadedRemoteOrder, setHasLoadedRemoteOrder] = useState(false);
  const [viewMode, setViewMode] = useState<PlanViewMode>("calendar");
  const [renderedViewMode, setRenderedViewMode] = useState<PlanViewMode>("calendar");
  const [goingFilter, setGoingFilter] = useState(false);
  const [collapsedLists, setCollapsedLists] = useState<Record<string, boolean>>({});
  const [listVisibleCount, setListVisibleCount] = useState<Record<string, number>>({});
  const [pastExpanded, setPastExpanded] = useState<Record<string, boolean>>({});
  const viewTranslateX = useRef(new NativeAnimated.Value(0)).current;
  const viewOpacity = useRef(new NativeAnimated.Value(1)).current;
  const selectorTranslateX = useRef(new NativeAnimated.Value(0)).current;
  const [viewModeWidth, setViewModeWidth] = useState(0);

  // Get full event objects for saved + going events
  const [dbEvents, setDbEvents] = useState<SiftEvent[]>([]);
  const [dbLoading, setDbLoading] = useState(false);

  const allIds = useMemo(() => {
    return goingEvents.map((e) => e.eventId);
  }, [goingEvents]);

  useEffect(() => {
    if (!isLoggedIn || !supabase) {
      setUserId(null);
      setHasLoadedRemoteOrder(false);
      return;
    }

    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });
  }, [isLoggedIn]);

  // Fetch event details from Supabase for IDs not in hardcoded data.
  // Covers both going and saved events (the List view needs saved details too).
  useEffect(() => {
    const wantedIds = Array.from(
      new Set([...allIds, ...savedEvents.map((sv) => sv.eventId)])
    );
    const missingIds = wantedIds.filter(
      (id) => !allEvents.some((e) => e.id === id)
    );
    if (missingIds.length === 0) {
      setDbLoading(false);
      return;
    }
    setDbLoading(true);
    Promise.all(missingIds.map((id) => fetchEventById(id))).then((results) => {
      setDbEvents(results.filter((e): e is SiftEvent => e !== null));
      setDbLoading(false);
    });
  }, [allIds, savedEvents]);

  const shortlistEvents = useMemo(() => {
    const combined = [...allEvents, ...dbEvents];
    const activeIds = allIds.filter((id) => !removedIds.includes(id));
    return combined
      .filter((e) => activeIds.includes(e.id))
      .map((e) => {
        // Use the user-selected date from goingEvents instead of the event's original startDate
        const goingEntry = goingEvents.find((g) => g.eventId === e.id);
        if (goingEntry && goingEntry.eventDate !== e.startDate) {
          return { ...e, startDate: goingEntry.eventDate };
        }
        return e;
      })
      .sort(
        (a, b) =>
          new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
      );
  }, [allIds, dbEvents, removedIds, goingEvents]);

  const dayGroups = useMemo(() => groupByDay(shortlistEvents), [shortlistEvents]);

  useEffect(() => {
    if (!userId) {
      setHasLoadedRemoteOrder(true);
      return;
    }

    fetchPlanEventOrders(userId).then((rows) => {
      const next: Record<string, string[]> = {};
      for (const row of rows) {
        if (!next[row.planDate]) next[row.planDate] = [];
        next[row.planDate].push(row.eventId);
      }
      setDayOrder(next);
      setHasLoadedRemoteOrder(true);
    });
  }, [userId]);

  // Keep dayOrder in sync as events are added/removed
  useEffect(() => {
    setDayOrder((prev) => {
      const next: Record<string, string[]> = {};
      const changedDates: string[] = [];
      for (const group of dayGroups) {
        const ids = group.events.map((e) => e.id);
        const existing = prev[group.date] ?? [];
        // Preserve existing order, drop removed, append new
        const ordered = [
          ...existing.filter((id) => ids.includes(id)),
          ...ids.filter((id) => !existing.includes(id)),
        ];
        next[group.date] = ordered;
        if (ordered.join("|") !== existing.join("|")) changedDates.push(group.date);
      }

      if (userId && hasLoadedRemoteOrder && changedDates.length > 0) {
        changedDates.forEach((date) => {
          void syncPlanEventOrder(userId, date, next[date] ?? []);
        });
      }

      return next;
    });
  }, [dayGroups, userId, hasLoadedRemoteOrder]);

  const orderedDayGroups = useMemo(() =>
    dayGroups.map((group) => {
      const order = dayOrder[group.date];
      if (!order) return group;
      const eventMap = Object.fromEntries(group.events.map((e) => [e.id, e]));
      return {
        ...group,
        events: order.map((id) => eventMap[id]).filter(Boolean) as SiftEvent[],
      };
    }),
  [dayGroups, dayOrder]);

  const shortlistEventMap = useMemo(
    () => Object.fromEntries(shortlistEvents.map((event) => [event.id, event])),
    [shortlistEvents]
  );

  // List view = your saved lists (Favorites + custom). Each section groups its
  // events by date; the "Going" filter narrows to events you're going to.
  const savedListSections = useMemo(() => {
    const byId = new Map<string, SiftEvent>(
      [...allEvents, ...dbEvents].map((e) => [e.id, e])
    );
    // Order: known list names first (customLists), then any stray list names.
    const listOrder = getAllListNames();
    const savedNames = Array.from(new Set(savedEvents.map((sv) => sv.listName)));
    const orderedNames = [
      ...listOrder.filter((n) => savedNames.includes(n)),
      ...savedNames.filter((n) => !listOrder.includes(n)),
    ];

    const nyToday = todayNYC();
    // The date to place an event under = the user's CHOSEN date: their going date
    // if going, else the date it was saved under, else the event's first date.
    const dateFor = (sv: (typeof savedEvents)[number], event: SiftEvent): string => {
      const g = goingEvents.find((x) => x.eventId === sv.eventId);
      return g?.eventDate ?? sv.eventStartDate ?? event.startDate;
    };
    return orderedNames
      .map((name) => {
        const items = savedEvents
          .filter((sv) => sv.listName === name)
          .map((sv) => {
            const event = byId.get(sv.eventId);
            return event ? { event, date: dateFor(sv, event) } : null;
          })
          .filter((it): it is ListItem => !!it)
          .filter((it) => !goingFilter || isGoing(it.event.id));
        // Upcoming soonest-first; past most-recent-first.
        const upcoming = items
          .filter((it) => it.date >= nyToday)
          .sort((a, b) => a.date.localeCompare(b.date));
        const past = items
          .filter((it) => it.date < nyToday)
          .sort((a, b) => b.date.localeCompare(a.date));
        return { name, upcoming, past };
      })
      .filter((section) => section.upcoming.length + section.past.length > 0);
  }, [allEvents, dbEvents, savedEvents, goingEvents, getAllListNames, goingFilter, isGoing]);

  // A dedicated "Going" section so events you're going to always appear, even if
  // they're not saved into any list. Pinned above the saved lists.
  const goingSection = useMemo((): { name: string; upcoming: ListItem[]; past: ListItem[] } | null => {
    if (goingEvents.length === 0) return null;
    const byId = new Map<string, SiftEvent>([...allEvents, ...dbEvents].map((e) => [e.id, e]));
    const nyToday = todayNYC();
    const items = goingEvents
      .filter((g) => !removedIds.includes(g.eventId))
      .map((g) => {
        const event = byId.get(g.eventId);
        return event ? { event, date: g.eventDate ?? event.startDate } : null;
      })
      .filter((it): it is ListItem => !!it);
    if (items.length === 0) return null;
    const upcoming = items.filter((it) => it.date >= nyToday).sort((a, b) => a.date.localeCompare(b.date));
    const past = items.filter((it) => it.date < nyToday).sort((a, b) => b.date.localeCompare(a.date));
    return { name: "Going", upcoming, past };
  }, [allEvents, dbEvents, goingEvents, removedIds]);

  const openDetail = useCallback(
    (event: SiftEvent, date?: string) => {
      const goingEntry = goingEvents.find((g) => g.eventId === event.id);
      setDetailEvent({ event, goingDate: date ?? goingEntry?.eventDate ?? event.startDate });
    },
    [goingEvents]
  );

  const today = todayNYC();

  // Toggle "went" for a past going event; boost taste only when marking attended.
  const handleToggleWent = useCallback(
    (event: SiftEvent) => {
      const next = !(getGoingEvent(event.id)?.attended ?? false);
      markWent(event.id, next);
      if (next) {
        recordEventWent(event.id, event.category, {
          category: event.category, tags: event.tags, borough: event.borough, price: event.price,
        }).catch(() => {});
        recordWent(event.id).catch(() => {});
      }
    },
    [getGoingEvent, markWent]
  );

  // Rows for a section, with a date sub-label when the date changes.
  const renderRows = (items: ListItem[]) => {
    let prevDate = "";
    return items.map(({ event, date }) => {
      const showDate = date !== prevDate;
      prevDate = date;
      return (
        <View key={event.id}>
          {showDate && <Text style={s.listDateSub}>{formatShortDay(date)}</Text>}
          <SavedEventRow
            event={event}
            going={isGoing(event.id)}
            canMarkWent={isGoing(event.id) && date < today}
            attended={!!getGoingEvent(event.id)?.attended}
            onToggleWent={() => handleToggleWent(event)}
            onPress={() => openDetail(event, date)}
          />
        </View>
      );
    });
  };

  // One list/going section (collapse + paginate + Past subsection). `drag` is
  // only supplied for the draggable saved lists, not the pinned Going section.
  const renderListSection = (
    section: { name: string; upcoming: ListItem[]; past: ListItem[] },
    drag?: () => void,
    isActive?: boolean
  ) => {
    const collapsed = collapsedLists[section.name];
    const visible = listVisibleCount[section.name] ?? LIST_PAGE_SIZE;
    const shownUpcoming = section.upcoming.slice(0, visible);
    const showPast = pastExpanded[section.name];
    const total = section.upcoming.length + section.past.length;
    return (
      <View style={[s.listSection, isActive && s.listSectionActive]}>
        <Pressable
          onPress={() => setCollapsedLists((p) => ({ ...p, [section.name]: !collapsed }))}
          onLongPress={drag}
          delayLongPress={200}
          disabled={isActive}
          style={s.listSectionHeaderRow}
        >
          {collapsed ? (
            <ChevronRight size={16} strokeWidth={2} color={colors.textSecondary} />
          ) : (
            <ChevronDown size={16} strokeWidth={2} color={colors.textSecondary} />
          )}
          <Text style={s.listSectionHeader}>{section.name}</Text>
          <Text style={s.listSectionCount}>{total}</Text>
        </Pressable>
        {!collapsed && (
          <>
            {renderRows(shownUpcoming)}
            {section.upcoming.length > visible && (
              <Pressable
                onPress={() =>
                  setListVisibleCount((p) => ({ ...p, [section.name]: visible + LIST_PAGE_SIZE }))
                }
                style={s.showMoreBtn}
              >
                <Text style={s.showMoreText}>Show more ({section.upcoming.length - visible})</Text>
              </Pressable>
            )}
            {section.past.length > 0 && (
              <>
                <Pressable
                  onPress={() => setPastExpanded((p) => ({ ...p, [section.name]: !showPast }))}
                  style={s.pastToggle}
                >
                  {showPast ? (
                    <ChevronDown size={14} strokeWidth={2} color={colors.textMuted} />
                  ) : (
                    <ChevronRight size={14} strokeWidth={2} color={colors.textMuted} />
                  )}
                  <Text style={s.pastToggleText}>Past ({section.past.length})</Text>
                </Pressable>
                {showPast && renderRows(section.past)}
              </>
            )}
          </>
        )}
      </View>
    );
  };

  const handleRemove = useCallback(
    (eventId: string) => {
      setRemovedIds((prev) => [...prev, eventId]);
      // Also remove from saved and going in context
      removeSavedEvent(eventId);
      const goingEntry = goingEvents.find((g) => g.eventId === eventId);
      if (goingEntry) {
        toggleGoing({
          eventId: goingEntry.eventId,
          eventTitle: goingEntry.eventTitle,
          eventDate: goingEntry.eventDate,
        });
      }
    },
    [goingEvents, toggleGoing, removeSavedEvent]
  );

  const handleConfirm = useCallback(() => {
    // Mark all shortlisted events as "going"
    for (const event of shortlistEvents) {
      const isAlreadyGoing = goingEvents.some(
        (g) => g.eventId === event.id
      );
      if (!isAlreadyGoing) {
        toggleGoing({
          eventId: event.id,
          eventTitle: event.title,
          eventDate: event.startDate,
          eventEndDate: event.endDate,
        });
      }
    }
    setPlanStep("success");
    track("plan_created", { event_count: shortlistEvents.length });
  }, [shortlistEvents, goingEvents, toggleGoing]);

  const handleSharePlan = useCallback(async () => {
    const lines: string[] = ["My weekend plan (via Sift):\n"];
    for (const group of orderedDayGroups) {
      lines.push(group.label);
      for (const e of group.events) {
        const time = formatTimeShort(e.time);
        const price =
          e.price === 0 ? "Free" : e.priceLabel;
        lines.push(`  ${time} - ${e.title} @ ${e.location} - ${price}`);
      }
      lines.push("");
    }
    const text = lines.join("\n");
    await Clipboard.setStringAsync(text);
    showToast("Plan copied to clipboard");
  }, [orderedDayGroups, showToast]);

  const handleStartOver = useCallback(() => {
    setRemovedIds([]);
    setPlanStep("shortlist");
  }, []);

  const changeViewMode = useCallback(
    (nextMode: PlanViewMode, direction?: 1 | -1) => {
      if (nextMode === viewMode) return;
      const resolvedDirection = direction ?? (nextMode === "calendar" ? 1 : -1);
      const offset = 28 * resolvedDirection;
      // Inner area = width - 8 (4px padding on each side). The highlight pill
      // occupies half of that, so translate by (width - 8) / 2 to land it
      // cleanly over the second button without overflowing the container.
      const halfInner = viewModeWidth > 0 ? (viewModeWidth - 8) / 2 : 0;
      const selectorTarget = nextMode === "calendar" ? 0 : halfInner;

      NativeAnimated.timing(selectorTranslateX, {
        toValue: selectorTarget,
        duration: 220,
        useNativeDriver: true,
      }).start();

      NativeAnimated.parallel([
        NativeAnimated.timing(viewTranslateX, {
          toValue: offset,
          duration: 160,
          useNativeDriver: true,
        }),
        NativeAnimated.timing(viewOpacity, {
          toValue: 0,
          duration: 160,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setViewMode(nextMode);
        setRenderedViewMode(nextMode);
        viewTranslateX.setValue(-offset);
        viewOpacity.setValue(0);
        NativeAnimated.parallel([
          NativeAnimated.timing(viewTranslateX, {
            toValue: 0,
            duration: 220,
            useNativeDriver: true,
          }),
          NativeAnimated.timing(viewOpacity, {
            toValue: 1,
            duration: 220,
            useNativeDriver: true,
          }),
        ]).start();
      });
    },
    [viewMode, viewModeWidth, selectorTranslateX, viewOpacity, viewTranslateX]
  );

  const handleViewModeLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const width = event.nativeEvent.layout.width;
      setViewModeWidth(width);
      const halfInner = (width - 8) / 2;
      selectorTranslateX.setValue(viewMode === "calendar" ? 0 : halfInner);
    },
    [selectorTranslateX, viewMode]
  );

  const detailModal = (
    <Modal
      visible={!!detailEvent}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setDetailEvent(null)}
    >
      {detailEvent && (
        <EventDetail
          event={detailEvent.event}
          goingDate={detailEvent.goingDate}
          onBack={() => setDetailEvent(null)}
          onRequestSignIn={() => {
            setDetailEvent(null);
            router.push({ pathname: "/(auth)/signin", params: { returnTo: "/(tabs)/plan" } });
          }}
          hideBack
        />
      )}
    </Modal>
  );

  // ── Empty state ──────────────────────────────────────
  if (shortlistEvents.length === 0 && savedEvents.length === 0 && !dbLoading && planStep === "shortlist") {
    return (
      <View style={s.screen}>
        <View style={[s.stickyHeader, { paddingTop: insets.top + 16 }]}>
          <View style={s.planHeaderRow}>
            <Text style={s.stickyHeading}>Plan</Text>
            <Pressable onPress={() => router.push("/add-event")} style={s.addLinkButton} hitSlop={8}>
              <Link2 size={14} color={colors.primary} strokeWidth={1.8} />
              <Text style={s.addLinkText}>Add from link</Text>
            </Pressable>
          </View>
        </View>
        <View style={s.centered}>
          <Text style={s.emptyHeading}>No events saved yet</Text>
          <Text style={s.emptySub}>
            Browse events on the Discover tab, save the ones you like, then come
            back here to plan your weekend.
          </Text>
          <Pressable
            onPress={() => router.push("/(tabs)/discover")}
            style={s.primaryButton}
          >
            <Text style={s.primaryButtonText}>Browse events</Text>
            <ChevronRight size={16} strokeWidth={2} color={colors.white} />
          </Pressable>
        </View>
        {detailModal}
      </View>
    );
  }

  // ── Success state ────────────────────────────────────
  if (planStep === "success") {
    return (
      <View style={s.screen}>
        <View style={[s.stickyHeader, { paddingTop: insets.top + 16 }]}>
          <Text style={s.stickyHeading}>Plan</Text>
        </View>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.successHeader}>
          <View style={s.successIcon}>
            <Check size={28} strokeWidth={2.5} color={colors.white} />
          </View>
          <Text style={s.successHeading}>You're set for the weekend.</Text>
          <Text style={s.successSub}>
            {shortlistEvents.length} event{shortlistEvents.length !== 1 ? "s" : ""}{" "}
            confirmed. Have an amazing time.
          </Text>
        </View>

        {orderedDayGroups.map((group) => (
          <View key={group.date} style={s.dayGroup}>
            <Text style={s.dayLabel}>{group.label}</Text>
            {group.events.map((event) => (
              <EventPlanCard key={event.id} event={event} onPress={() => openDetail(event)} />
            ))}
          </View>
        ))}

        <View style={s.successActions}>
          <Pressable
            onPress={async () => {
              track("calendar_export", { method: "ics_all", event_count: shortlistEvents.length });
              const ok = await shareICSFile(shortlistEvents);
              if (ok) showToast("Calendar file ready");
              else showToast("Couldn't open calendar");
            }}
            style={s.primaryButton}
          >
            <CalendarPlus size={16} strokeWidth={1.5} color={colors.white} />
            <Text style={s.primaryButtonText}>Add all to calendar</Text>
          </Pressable>
          <Pressable onPress={handleSharePlan} style={[s.shareButton, { marginTop: 10 }]}>
            <Share2 size={16} strokeWidth={1.5} color={colors.primary} />
            <Text style={s.shareButtonText}>Share with friends</Text>
          </Pressable>
          <Pressable onPress={handleStartOver} style={{ marginTop: 12 }}>
            <Text style={s.startOverText}>Plan another weekend</Text>
          </Pressable>
        </View>
      </ScrollView>
      {detailModal}
      </View>
    );
  }

  // ── Confirm step ─────────────────────────────────────
  if (planStep === "confirm") {
    return (
      <View style={s.screen}>
        <View style={[s.stickyHeader, { paddingTop: insets.top + 16 }]}>
          <Text style={s.stickyHeading}>Plan</Text>
        </View>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={s.heading}>Confirm your plan</Text>
        <Text style={s.sub}>
          Here's your lineup. Hit "Looks good" to lock it in.
        </Text>

        {orderedDayGroups.map((group) => (
          <View key={group.date} style={s.dayGroup}>
            <Text style={s.dayLabel}>{group.label}</Text>
            {group.events.map((event) => (
              <EventPlanCard key={event.id} event={event} onPress={() => openDetail(event)} />
            ))}
          </View>
        ))}

        <View style={s.confirmActions}>
          <Pressable onPress={handleConfirm} style={s.primaryButton}>
            <Check size={16} strokeWidth={2} color={colors.white} />
            <Text style={s.primaryButtonText}>Looks good</Text>
          </Pressable>
          <Pressable
            onPress={() => setPlanStep("shortlist")}
            style={s.secondaryButton}
          >
            <Text style={s.secondaryButtonText}>Go back and edit</Text>
          </Pressable>
        </View>
      </ScrollView>
      {detailModal}
      </View>
    );
  }

  // ── Shortlist step (default) ─────────────────────────
  return (
    <View style={s.screen}>
      <View style={[s.stickyHeader, { paddingTop: insets.top + 16 }]}>
        <View style={s.planHeaderRow}>
          <Text style={s.stickyHeading}>Plan</Text>
          <Pressable onPress={() => router.push("/add-event")} style={s.addLinkButton} hitSlop={8}>
            <Link2 size={14} color={colors.primary} strokeWidth={1.8} />
            <Text style={s.addLinkText}>Add from link</Text>
          </Pressable>
        </View>
      </View>
    <ScrollView
      contentContainerStyle={s.scroll}
      showsVerticalScrollIndicator={false}
      scrollEnabled={!isDraggingList}
    >
      <View style={s.viewModeWrap} onLayout={handleViewModeLayout}>
        {viewModeWidth > 0 && (
          <NativeAnimated.View
            pointerEvents="none"
            style={[
              s.viewModeActiveBg,
              {
                width: (viewModeWidth - 8) / 2,
                transform: [{ translateX: selectorTranslateX }],
              },
            ]}
          />
        )}
        <Pressable
          onPress={() => changeViewMode("calendar", 1)}
          style={s.viewModeButton}
        >
          <CalendarDays
            size={15}
            strokeWidth={1.8}
            color={viewMode === "calendar" ? colors.white : colors.textSecondary}
          />
          <Text style={[s.viewModeText, viewMode === "calendar" && s.viewModeTextActive]}>
            Calendar
          </Text>
        </Pressable>
        <Pressable
          onPress={() => changeViewMode("list", -1)}
          style={s.viewModeButton}
        >
          <List
            size={15}
            strokeWidth={1.8}
            color={viewMode === "list" ? colors.white : colors.textSecondary}
          />
          <Text style={[s.viewModeText, viewMode === "list" && s.viewModeTextActive]}>
            List
          </Text>
        </Pressable>
      </View>

      <View style={s.viewModeContent}>
        <NativeAnimated.View
          style={{
            transform: [{ translateX: viewTranslateX }],
            opacity: viewOpacity,
          }}
        >
          {renderedViewMode === "calendar" ? (
            <CalendarSection
              goingEvents={goingEvents}
              savedEvents={[]}
              title={null}
              showSavedDetails={false}
              renderGoingEvents={(calEvents: GoingEvent[], date: string) => {
                const order = dayOrder[date];
                const eventObjs = calEvents
                  .map((ge) => shortlistEventMap[ge.eventId])
                  .filter(Boolean) as SiftEvent[];
                const ordered = order
                  ? [
                      ...order.map((id) => eventObjs.find((e) => e.id === id)).filter(Boolean) as SiftEvent[],
                      ...eventObjs.filter((e) => !order.includes(e.id)),
                    ]
                  : eventObjs;
                return (
                  <DraggableFlatList
                    data={ordered}
                    keyExtractor={(e) => e.id}
                    scrollEnabled={false}
                    activationDistance={12}
                    onDragBegin={() => setIsDraggingList(true)}
                    onDragEnd={({ data }) => {
                      const nextOrder = data.map((e) => e.id);
                      setIsDraggingList(false);
                      setDayOrder((prev) => ({ ...prev, [date]: nextOrder }));
                      if (userId) void syncPlanEventOrder(userId, date, nextOrder);
                    }}
                    onRelease={() => setIsDraggingList(false)}
                    renderItem={({ item, drag, isActive }: RenderItemParams<SiftEvent>) => (
                      <EventPlanCard
                        event={item}
                        onPress={() => openDetail(item)}
                        onRemove={() => handleRemove(item.id)}
                        drag={drag}
                        isActive={isActive}
                      />
                    )}
                  />
                );
              }}
            />
          ) : (
            <>
              <View style={s.listFilterRow}>
                <Pressable
                  onPress={() => setGoingFilter((v) => !v)}
                  style={[s.goingFilterChip, goingFilter && s.goingFilterChipActive]}
                >
                  <Check
                    size={13}
                    strokeWidth={2.5}
                    color={goingFilter ? colors.white : colors.textSecondary}
                  />
                  <Text style={[s.goingFilterText, goingFilter && s.goingFilterTextActive]}>
                    Going
                  </Text>
                </Pressable>
              </View>

              {!goingSection && savedListSections.length === 0 ? (
                <View style={s.listEmpty}>
                  <Text style={s.listEmptyText}>
                    {goingFilter
                      ? "No going events in your lists yet."
                      : "Nothing here yet — press Going or Interested on events to plan them."}
                  </Text>
                </View>
              ) : (
                <>
                  {goingSection && renderListSection(goingSection)}
                  <DraggableFlatList
                    data={savedListSections}
                    keyExtractor={(item) => item.name}
                    scrollEnabled={false}
                    activationDistance={12}
                    onDragBegin={() => setIsDraggingList(true)}
                    onDragEnd={({ data }) => {
                      setIsDraggingList(false);
                      // Persist the new order globally (customLists), keeping any
                      // empty/hidden lists after the visible ones and ignoring strays.
                      const draggedNames = data.map((sec) => sec.name);
                      const known = getAllListNames();
                      const reordered = [
                        ...draggedNames.filter((n) => known.includes(n)),
                        ...known.filter((n) => !draggedNames.includes(n)),
                      ];
                      reorderCustomLists(reordered);
                    }}
                    onRelease={() => setIsDraggingList(false)}
                    renderItem={({ item, drag, isActive }: RenderItemParams<{ name: string; upcoming: ListItem[]; past: ListItem[] }>) => (
                      <ScaleDecorator>{renderListSection(item, drag, isActive)}</ScaleDecorator>
                    )}
                  />
                </>
              )}
            </>
          )}
        </NativeAnimated.View>
      </View>

      {shortlistEvents.length > 0 && (
        <Pressable
          onPress={async () => {
            track("calendar_export", { method: "ics_all", event_count: shortlistEvents.length, source: "plan_shortlist" });
            const ok = await shareICSFile(shortlistEvents);
            if (ok) showToast("Calendar file ready");
            else showToast("Couldn't open calendar");
          }}
          style={[s.primaryButton, { marginTop: 24 }]}
        >
          <CalendarPlus size={16} strokeWidth={1.5} color={colors.white} />
          <Text style={s.primaryButtonText}>Add to Calendar</Text>
        </Pressable>
      )}
    </ScrollView>
    {detailModal}
    </View>
  );
}

const s = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
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
  planHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  addLinkButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  addLinkText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.primary,
  },
  listFilterRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 14,
  },
  goingFilterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 30,
    paddingHorizontal: 12,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  goingFilterChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  goingFilterText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  goingFilterTextActive: {
    color: colors.white,
  },
  listSection: {
    marginBottom: 20,
  },
  listSectionActive: {
    opacity: 0.9,
  },
  listSectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
    paddingVertical: 2,
  },
  listSectionHeader: {
    ...typography.h3,
    flex: 1,
  },
  listSectionCount: {
    ...typography.xs,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  showMoreBtn: {
    paddingVertical: 10,
    alignItems: "center",
  },
  showMoreText: {
    ...typography.sm,
    color: colors.primary,
    fontWeight: "600",
  },
  pastToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 10,
    marginTop: 2,
  },
  pastToggleText: {
    ...typography.xs,
    color: colors.textMuted,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  listDateSub: {
    ...typography.xs,
    color: colors.textSecondary,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 4,
  },
  listEmpty: {
    paddingVertical: 40,
    alignItems: "center",
  },
  listEmptyText: {
    ...typography.sm,
    color: colors.textSecondary,
    textAlign: "center",
    paddingHorizontal: 24,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.page,
    backgroundColor: colors.background,
  },
  scroll: {
    paddingTop: 20,
    paddingHorizontal: spacing.page,
    paddingBottom: 40,
    backgroundColor: colors.background,
    minHeight: "100%",
  },
  heading: { ...typography.sectionHeading, marginBottom: 8 },
  sub: {
    ...typography.sm,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: 24,
  },
  viewModeWrap: {
    flexDirection: "row",
    position: "relative",
    backgroundColor: colors.card,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
    marginBottom: 20,
    width: 220,
    ...shadows.card,
  },
  viewModeActiveBg: {
    position: "absolute",
    top: 4,
    left: 4,
    bottom: 4,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
  },
  viewModeButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.full,
  },
  viewModeText: {
    ...typography.sm,
    color: colors.textSecondary,
    fontWeight: "500",
  },
  viewModeTextActive: {
    color: colors.white,
  },
  viewModeContent: {
    minHeight: 240,
  },

  // Empty state
  emptyHeading: {
    ...typography.sectionHeading,
    textAlign: "center",
    marginBottom: 12,
  },
  emptySub: {
    ...typography.sm,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 28,
    maxWidth: 280,
  },

  // Day groups
  dayGroup: { marginBottom: 20 },
  dayLabel: {
    ...typography.h3,
    color: colors.foreground,
    marginBottom: 10,
  },

  // Buttons
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: radius.full,
  },
  primaryButtonText: {
    ...typography.body,
    fontWeight: "600",
    color: colors.white,
  },
  secondaryButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 10,
  },
  secondaryButtonText: {
    ...typography.body,
    color: colors.foreground,
  },
  confirmActions: { marginTop: 24 },

  // Success
  successHeader: {
    alignItems: "center",
    marginBottom: 32,
  },
  successIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  successHeading: {
    ...typography.sectionHeading,
    textAlign: "center",
    marginBottom: 8,
  },
  successSub: {
    ...typography.sm,
    color: colors.textSecondary,
    textAlign: "center",
  },
  successActions: {
    marginTop: 24,
    alignItems: "center",
  },
  shareButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.primary,
    width: "100%",
  },
  shareButtonText: {
    ...typography.body,
    fontWeight: "500",
    color: colors.primary,
  },
  startOverText: {
    ...typography.sm,
    color: colors.textSecondary,
    textDecorationLine: "underline",
  },
});

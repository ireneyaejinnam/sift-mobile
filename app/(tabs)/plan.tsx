import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Image,
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import EventDetail from "@/components/events/EventDetail";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  CalendarPlus,
  Check,
  ChevronRight,
  Trash2,
  Share2,
} from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import { useToast } from "@/components/ui/Toast";
import { useUser } from "@/context/UserContext";
import { track } from "@/lib/track";
import { generateGoogleCalendarUrl, shareICSFile } from "@/lib/calendar";
import { fetchEventById } from "@/lib/getEvents";
import { events as allEvents } from "@/data/events";
import type { SiftEvent } from "@/types/event";
import DraggableFlatList, {
  ScaleDecorator,
  type RenderItemParams,
} from "react-native-draggable-flatlist";
import { getUnsplashFallback } from "@/lib/unsplashFallback";
import { colors, radius, spacing, typography, shadows } from "@/lib/theme";

type PlanStep = "shortlist" | "confirm" | "success";

function EventPlanCard({
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
  const [fallbackImage, setFallbackImage] = useState<string | null>(null);

  useEffect(() => {
    if (!event.imageUrl) {
      getUnsplashFallback(event.category).then(setFallbackImage);
    }
  }, [event.id, event.category, event.imageUrl]);

  const imgSrc = event.imageUrl ?? fallbackImage;

  return (
    <ScaleDecorator>
      <View style={[sc.card, isActive && sc.cardActive]}>
        <Pressable style={sc.cardMain} onPress={onPress} onLongPress={drag} delayLongPress={200}>
          {imgSrc ? (
            <Image source={{ uri: imgSrc }} style={sc.thumb} />
          ) : (
            <View style={sc.thumbPlaceholder} />
          )}
          <Text style={sc.cardTitle} numberOfLines={2}>{event.title}</Text>
        </Pressable>
        {onRemove && (
          <Pressable onPress={onRemove} style={sc.removeBtn} hitSlop={8}>
            <Trash2 size={16} strokeWidth={1.5} color={colors.textMuted} />
          </Pressable>
        )}
      </View>
    </ScaleDecorator>
  );
}

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

export default function PlanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const { goingEvents, savedEvents, toggleGoing, removeSavedEvent } = useUser();
  const [planStep, setPlanStep] = useState<PlanStep>("shortlist");
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [detailEvent, setDetailEvent] = useState<{ event: SiftEvent; goingDate: string } | null>(null);
  // Manual order per day: date → ordered event IDs
  const [dayOrder, setDayOrder] = useState<Record<string, string[]>>({});
  const [isDraggingList, setIsDraggingList] = useState(false);

  // Get full event objects for saved + going events
  const [dbEvents, setDbEvents] = useState<SiftEvent[]>([]);
  const [dbLoading, setDbLoading] = useState(false);

  const allIds = useMemo(() => {
    const goingIds = goingEvents.map((e) => e.eventId);
    const savedIds = savedEvents.map((e) => e.eventId);
    return [...new Set([...goingIds, ...savedIds])];
  }, [goingEvents, savedEvents]);

  // Fetch event details from Supabase for IDs not in hardcoded data
  useEffect(() => {
    const missingIds = allIds.filter(
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
  }, [allIds]);

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

  // Keep dayOrder in sync as events are added/removed
  useEffect(() => {
    setDayOrder((prev) => {
      const next: Record<string, string[]> = {};
      for (const group of dayGroups) {
        const ids = group.events.map((e) => e.id);
        const existing = prev[group.date] ?? [];
        // Preserve existing order, drop removed, append new
        const ordered = [
          ...existing.filter((id) => ids.includes(id)),
          ...ids.filter((id) => !existing.includes(id)),
        ];
        next[group.date] = ordered;
      }
      return next;
    });
  }, [dayGroups]);

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

  const openDetail = useCallback(
    (event: SiftEvent) => {
      const goingEntry = goingEvents.find((g) => g.eventId === event.id);
      setDetailEvent({ event, goingDate: goingEntry?.eventDate ?? event.startDate });
    },
    [goingEvents]
  );

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
    for (const group of dayGroups) {
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
  }, [dayGroups, showToast]);

  const handleStartOver = useCallback(() => {
    setRemovedIds([]);
    setPlanStep("shortlist");
  }, []);

  const detailModal = (
    <Modal visible={!!detailEvent} animationType="slide" presentationStyle="pageSheet">
      {detailEvent && (
        <EventDetail
          event={detailEvent.event}
          goingDate={detailEvent.goingDate}
          onBack={() => setDetailEvent(null)}
        />
      )}
    </Modal>
  );

  // ── Empty state ──────────────────────────────────────
  if (shortlistEvents.length === 0 && !dbLoading && planStep === "shortlist") {
    return (
      <View style={s.screen}>
        <View style={[s.stickyHeader, { paddingTop: insets.top + 16 }]}>
          <Text style={s.stickyHeading}>Plan</Text>
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

        {dayGroups.map((group) => (
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

        {dayGroups.map((group) => (
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
        <Text style={s.stickyHeading}>Plan</Text>
      </View>
    <ScrollView
      contentContainerStyle={s.scroll}
      showsVerticalScrollIndicator={false}
      scrollEnabled={!isDraggingList}
    >
      {orderedDayGroups.map((group) => (
        <View key={group.date} style={s.dayGroup}>
          <Text style={s.dayLabel}>{group.label}</Text>
          <DraggableFlatList
            data={group.events}
            keyExtractor={(e) => e.id}
            onDragBegin={() => setIsDraggingList(true)}
            onDragEnd={({ data }) =>
              {
                setIsDraggingList(false);
                setDayOrder((prev) => ({ ...prev, [group.date]: data.map((e) => e.id) }));
              }
            }
            onRelease={() => setIsDraggingList(false)}
            scrollEnabled={false}
            activationDistance={12}
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
        </View>
      ))}
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

const sc = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
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
  cardTitle: {
    ...typography.body,
    fontWeight: "500",
    color: colors.foreground,
    flex: 1,
    paddingRight: 8,
  },
  removeBtn: {
    padding: 14,
  },
});

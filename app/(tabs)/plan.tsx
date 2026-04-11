import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  View,
  Text,
  Pressable,
  ScrollView,
  Linking,
  StyleSheet,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import {
  CalendarPlus,
  Check,
  ChevronRight,
  Clock,
  MapPin,
  Ticket,
  Trash2,
  Share2,
  DollarSign,
} from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import * as WebBrowser from "expo-web-browser";
import { useToast } from "@/components/ui/Toast";
import { useUser } from "@/context/UserContext";
import { track } from "@/lib/track";
import { generateGoogleCalendarUrl, shareICSFile } from "@/lib/calendar";
import { fetchEventById } from "@/lib/getEvents";
import { events as allEvents } from "@/data/events";
import type { SiftEvent } from "@/types/event";
import { colors, radius, spacing, typography, shadows } from "@/lib/theme";

type PlanStep = "shortlist" | "confirm" | "success";

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
  const { showToast } = useToast();
  const { goingEvents, savedEvents, toggleGoing, removeSavedEvent } = useUser();
  const [planStep, setPlanStep] = useState<PlanStep>("shortlist");
  const [removedIds, setRemovedIds] = useState<string[]>([]);

  // Get full event objects for saved + going events
  const [dbEvents, setDbEvents] = useState<SiftEvent[]>([]);

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
    if (missingIds.length === 0) return;
    Promise.all(missingIds.map((id) => fetchEventById(id))).then((results) => {
      setDbEvents(results.filter((e): e is SiftEvent => e !== null));
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

  // ── Empty state ──────────────────────────────────────
  if (shortlistEvents.length === 0 && planStep === "shortlist") {
    return (
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
    );
  }

  // ── Success state ────────────────────────────────────
  if (planStep === "success") {
    return (
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
              <View key={event.id} style={s.timelineCard}>
                <View style={s.timelineRow}>
                  <Clock
                    size={14}
                    strokeWidth={1.5}
                    color={colors.textSecondary}
                  />
                  <Text style={s.timelineTime}>
                    {formatTimeShort(event.time)}
                  </Text>
                </View>
                <Pressable onPress={() => router.push(`/event/${event.id}`)}>
                  <Text style={s.timelineTitleLink}>{event.title}</Text>
                </Pressable>
                <View style={s.timelineRow}>
                  <MapPin
                    size={13}
                    strokeWidth={1.5}
                    color={colors.textSecondary}
                  />
                  <Text style={s.timelineMeta}>{event.location}</Text>
                </View>
                <View style={s.timelineRow}>
                  <DollarSign
                    size={13}
                    strokeWidth={1.5}
                    color={colors.textSecondary}
                  />
                  <Text style={s.timelineMeta}>
                    {event.price === 0 ? "Free" : event.priceLabel}
                  </Text>
                </View>
                <View style={s.timelineActions}>
                  <Pressable
                    onPress={() => {
                      Alert.alert("Add to calendar", "Choose your calendar", [
                        {
                          text: "Google Calendar",
                          onPress: () => {
                            track("calendar_export", { event_id: event.id, method: "google" });
                            Linking.openURL(generateGoogleCalendarUrl(event));
                          },
                        },
                        {
                          text: "Apple Calendar",
                          onPress: async () => {
                            track("calendar_export", { event_id: event.id, method: "ics" });
                            const ok = await shareICSFile([event]);
                            if (!ok) showToast("Couldn't open calendar");
                          },
                        },
                        { text: "Cancel", style: "cancel" },
                      ]);
                    }}
                    style={s.calendarLink}
                  >
                    <CalendarPlus
                      size={14}
                      strokeWidth={1.5}
                      color={colors.primary}
                    />
                    <Text style={s.calendarLinkText}>Calendar</Text>
                  </Pressable>
                  {event.ticketUrl && (
                    <Pressable
                      onPress={() => {
                        track("ticket_click", { event_id: event.id, ticket_url: event.ticketUrl });
                        if (event.ticketUrl) WebBrowser.openBrowserAsync(event.ticketUrl);
                      }}
                      style={s.calendarLink}
                    >
                      <Ticket
                        size={14}
                        strokeWidth={1.5}
                        color={colors.primary}
                      />
                      <Text style={s.calendarLinkText}>Tickets</Text>
                    </Pressable>
                  )}
                </View>
              </View>
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
    );
  }

  // ── Confirm step ─────────────────────────────────────
  if (planStep === "confirm") {
    return (
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
              <View key={event.id} style={s.timelineCard}>
                <View style={s.timelineRow}>
                  <Clock
                    size={14}
                    strokeWidth={1.5}
                    color={colors.textSecondary}
                  />
                  <Text style={s.timelineTime}>
                    {formatTimeShort(event.time)}
                  </Text>
                </View>
                <Pressable onPress={() => router.push(`/event/${event.id}`)}>
                  <Text style={s.timelineTitleLink}>{event.title}</Text>
                </Pressable>
                <View style={s.timelineRow}>
                  <MapPin
                    size={13}
                    strokeWidth={1.5}
                    color={colors.textSecondary}
                  />
                  <Text style={s.timelineMeta}>
                    {event.location} · {event.borough}
                  </Text>
                </View>
                <View style={s.timelineRow}>
                  <DollarSign
                    size={13}
                    strokeWidth={1.5}
                    color={colors.textSecondary}
                  />
                  <Text style={s.timelineMeta}>
                    {event.price === 0 ? "Free" : event.priceLabel}
                  </Text>
                </View>
                {event.ticketUrl && (
                  <Pressable
                    onPress={() => { if (event.ticketUrl) WebBrowser.openBrowserAsync(event.ticketUrl); }}
                    style={[s.calendarLink, { marginTop: 8 }]}
                  >
                    <Ticket
                      size={14}
                      strokeWidth={1.5}
                      color={colors.primary}
                    />
                    <Text style={s.calendarLinkText}>Tickets</Text>
                  </Pressable>
                )}
              </View>
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
    );
  }

  // ── Shortlist step (default) ─────────────────────────
  return (
    <ScrollView
      contentContainerStyle={s.scroll}
      showsVerticalScrollIndicator={false}
    >
      <Text style={s.heading}>Your shortlist</Text>
      <Text style={s.sub}>
        {shortlistEvents.length} event{shortlistEvents.length !== 1 ? "s" : ""}{" "}
        saved. Remove any you don't want, then build your plan.
      </Text>

      {dayGroups.map((group) => (
        <View key={group.date} style={s.dayGroup}>
          <Text style={s.dayLabel}>{group.label}</Text>
          {group.events.map((event) => (
            <View key={event.id} style={s.shortlistCard}>
              <View style={s.shortlistContent}>
                <Text style={s.shortlistTitle} numberOfLines={2}>
                  {event.title}
                </Text>
                <View style={s.shortlistMeta}>
                  <Text style={s.shortlistMetaText}>
                    {formatTimeShort(event.time)} · {event.location}
                  </Text>
                </View>
                <Text style={s.shortlistPrice}>
                  {event.price === 0 ? "Free" : event.priceLabel}
                </Text>
              </View>
              <Pressable
                onPress={() => handleRemove(event.id)}
                style={s.removeButton}
                hitSlop={8}
              >
                <Trash2
                  size={16}
                  strokeWidth={1.5}
                  color={colors.textMuted}
                />
              </Pressable>
            </View>
          ))}
        </View>
      ))}

      <View style={{ marginTop: 24 }}>
        <Pressable
          onPress={() => setPlanStep("confirm")}
          style={s.primaryButton}
        >
          <Text style={s.primaryButtonText}>Build my plan</Text>
          <ChevronRight size={16} strokeWidth={2} color={colors.white} />
        </Pressable>
        <Pressable
          onPress={() => router.push("/(tabs)/discover")}
          style={{ marginTop: 12, alignItems: "center" }}
        >
          <Text style={s.addMoreText}>+ Add more events</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.page,
    backgroundColor: colors.background,
  },
  scroll: {
    paddingTop: Platform.OS === "ios" ? 60 : 20,
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

  // Shortlist cards
  shortlistCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 8,
    ...shadows.card,
  },
  shortlistContent: { flex: 1 },
  shortlistTitle: {
    ...typography.body,
    fontWeight: "500",
    color: colors.foreground,
    marginBottom: 4,
  },
  shortlistMeta: { marginBottom: 2 },
  shortlistMetaText: {
    ...typography.xs,
    color: colors.textSecondary,
  },
  shortlistPrice: {
    ...typography.xs,
    color: colors.textSecondary,
    fontWeight: "500",
  },
  removeButton: {
    padding: 8,
    marginLeft: 8,
  },

  // Timeline cards (confirm + success)
  timelineCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 8,
    ...shadows.card,
  },
  timelineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  timelineTime: {
    ...typography.sm,
    fontWeight: "500",
    color: colors.primary,
  },
  timelineTitle: {
    ...typography.body,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: 6,
    marginTop: 2,
  },
  timelineTitleLink: {
    ...typography.body,
    fontWeight: "600",
    color: colors.primary,
    marginBottom: 6,
    marginTop: 2,
    textDecorationLine: "underline" as const,
  },
  timelineMeta: {
    ...typography.xs,
    color: colors.textSecondary,
  },
  timelineActions: {
    flexDirection: "row",
    gap: 16,
    marginTop: 10,
  },

  // Calendar link
  calendarLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  calendarLinkText: {
    ...typography.xs,
    color: colors.primary,
    fontWeight: "500",
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
    borderRadius: radius.md,
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
    borderRadius: radius.md,
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
    borderRadius: radius.md,
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
  addMoreText: {
    ...typography.sm,
    color: colors.primary,
    fontWeight: "500",
  },
});

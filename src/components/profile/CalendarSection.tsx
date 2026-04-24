import { useMemo, useState, type ReactNode } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react-native";
import type { GoingEvent, SavedEvent } from "@/types/user";
import { useUser } from "@/context/UserContext";
import { colors, radius, typography, spacing, shadows } from "@/lib/theme";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function getDaysInMonth(year: number, month: number) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const days: (number | null)[] = [];
  for (let i = 0; i < first.getDay(); i++) days.push(null);
  for (let d = 1; d <= last.getDate(); d++) days.push(d);
  return days;
}

interface CalendarSectionProps {
  goingEvents: GoingEvent[];
  savedEvents: SavedEvent[];
  title?: string | null;
  renderGoingEvents?: (events: GoingEvent[], date: string) => ReactNode;
  showSavedDetails?: boolean;
}

export default function CalendarSection({
  goingEvents,
  savedEvents,
  title = "My Calendar",
  renderGoingEvents,
  showSavedDetails = true,
}: CalendarSectionProps) {
  const router = useRouter();
  const { removeSavedEvent, toggleGoing } = useUser();
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  const days = useMemo(() => getDaysInMonth(viewYear, viewMonth), [viewYear, viewMonth]);
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const { dateToGoing, dateToSaved } = useMemo(() => {
    const dg = new Map<string, GoingEvent[]>();
    const ds = new Map<string, SavedEvent[]>();
    goingEvents.forEach((e) => {
      const list = dg.get(e.eventDate) ?? [];
      list.push(e);
      dg.set(e.eventDate, list);
    });
    savedEvents.forEach((s) => {
      if (!s.eventStartDate) return;
      const list = ds.get(s.eventStartDate) ?? [];
      list.push(s);
      ds.set(s.eventStartDate, list);
    });
    return { dateToGoing: dg, dateToSaved: ds };
  }, [goingEvents, savedEvents]);

  const toDateKey = (day: number) => {
    const m = String(viewMonth + 1).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    return `${viewYear}-${m}-${d}`;
  };

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
    setSelectedDate(null);
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
    setSelectedDate(null);
  };

  const selGoing = selectedDate ? dateToGoing.get(selectedDate) ?? [] : [];
  const selSaved = selectedDate ? dateToSaved.get(selectedDate) ?? [] : [];
  const isSelectedToday = selectedDate === todayKey;

  return (
    <View style={st.section}>
      {title ? <Text style={st.h3}>{title}</Text> : null}

      <View style={st.calendarCard}>
        <View style={st.monthNav}>
          <View style={st.monthChip}>
            <CalendarDays size={14} strokeWidth={1.8} color={colors.textSecondary} />
            <Text style={st.monthLabel}>{monthLabel}</Text>
          </View>
          <View style={st.monthActions}>
            <Pressable onPress={prevMonth} style={st.navButton} hitSlop={8}>
              <ChevronLeft size={18} strokeWidth={2} color={colors.textSecondary} />
            </Pressable>
            <Pressable onPress={nextMonth} style={st.navButton} hitSlop={8}>
              <ChevronRight size={18} strokeWidth={2} color={colors.textSecondary} />
            </Pressable>
          </View>
        </View>

        <View style={st.grid}>
          {WEEKDAYS.map((w, i) => (
            <View key={i} style={st.weekdayCell}>
              <Text style={st.weekday}>{w}</Text>
            </View>
          ))}
          {days.map((day, i) => {
            if (day === null) return <View key={`pad-${i}`} style={st.dayCell} />;
            const key = toDateKey(day);
            const hasGoing = (dateToGoing.get(key) ?? []).length > 0;
            const hasSaved = (dateToSaved.get(key) ?? []).length > 0;
            const isSelected = selectedDate === key;
            const isToday = key === todayKey;
            return (
              <Pressable
                key={key}
                onPress={() => setSelectedDate(isSelected ? null : key)}
                style={[
                  st.dayCell,
                  st.dayButton,
                  hasGoing && st.dayGoing,
                  hasSaved && !hasGoing && st.daySaved,
                  isToday && st.dayToday,
                  isSelected && st.daySelected,
                ]}
              >
                <Text
                  style={[
                    st.dayText,
                    isToday && st.dayTextToday,
                    isSelected && st.dayTextSelected,
                  ]}
                >
                  {day}
                </Text>
                <View style={st.dots}>
                  {hasGoing && <View style={[st.dot, st.dotGoing]} />}
                  {hasSaved && <View style={[st.dot, st.dotSaved]} />}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      {selectedDate && (
        <View style={st.detail}>
          <View style={st.detailHeader}>
            <View>
              {isSelectedToday ? <Text style={st.detailLabelTop}>TODAY</Text> : null}
              <View style={st.detailDateRow}>
                <Text style={st.detailDayNumber}>
                  {new Date(selectedDate + "T12:00:00").getDate()}
                </Text>
                <View>
                  <Text style={st.detailDate}>
                    {new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", {
                      weekday: "long",
                    })}
                  </Text>
                  <Text style={st.detailSummary}>
                    {selGoing.length} going event{selGoing.length !== 1 ? "s" : ""}
                    {showSavedDetails ? ` · ${selSaved.length} saved` : ""}
                  </Text>
                </View>
              </View>
            </View>
          </View>
          {selGoing.length > 0 && (
            <View style={st.cardsList}>
              {renderGoingEvents ? (
                renderGoingEvents(selGoing, selectedDate)
              ) : (
                selGoing.map((e) => (
                  <Pressable key={e.eventId} style={st.eventRow} onPress={() => router.push(`/event/${e.eventId}`)}>
                    <View style={{ flex: 1 }}>
                      <Text style={st.detailItem}>{e.eventTitle}</Text>
                      {e.eventEndDate && e.eventEndDate !== e.eventDate && (
                        <Text style={st.detailSub}>runs through {e.eventEndDate}</Text>
                      )}
                    </View>
                    <Pressable
                      onPress={() => toggleGoing({ eventId: e.eventId, eventTitle: e.eventTitle, eventDate: e.eventDate })}
                      hitSlop={8}
                      style={st.removeBtn}
                    >
                      <X size={14} strokeWidth={2.5} color={colors.textSecondary} />
                    </Pressable>
                  </Pressable>
                ))
              )}
            </View>
          )}
          {showSavedDetails && selSaved.length > 0 && (
            <View>
              <Text style={st.detailLabel}>Saved</Text>
              {selSaved.map((s) => (
                <Pressable key={s.eventId} style={st.eventRow} onPress={() => router.push(`/event/${s.eventId}`)}>
                  <View style={{ flex: 1 }}>
                    <Text style={st.detailItem}>{s.eventTitle}</Text>
                    {s.eventEndDate && s.eventEndDate !== s.eventStartDate && (
                      <Text style={st.detailSub}>runs through {s.eventEndDate}</Text>
                    )}
                  </View>
                  <Pressable
                    onPress={() => removeSavedEvent(s.eventId)}
                    hitSlop={8}
                    style={st.removeBtn}
                  >
                    <X size={14} strokeWidth={2.5} color={colors.textSecondary} />
                  </Pressable>
                </Pressable>
              ))}
            </View>
          )}
          {selGoing.length === 0 && selSaved.length === 0 && (
            <Text style={st.detailEmpty}>No events this day</Text>
          )}
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  section: { marginBottom: 32 },
  h3: { ...typography.h3, marginBottom: 12 },
  calendarCard: {
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  monthChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.full,
    backgroundColor: colors.muted,
  },
  monthActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  navButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  monthLabel: { ...typography.sm, color: colors.foreground, fontWeight: "600" },
  grid: { flexDirection: "row", flexWrap: "wrap", marginTop: 8 },
  weekdayCell: { width: "14.28%", alignItems: "center", marginBottom: 8 },
  weekday: { ...typography.xs, fontWeight: "500", color: colors.textSecondary },
  dayCell: { width: "14.28%", height: 48, alignItems: "center", justifyContent: "center", paddingTop: 4 },
  dayButton: {
    borderRadius: 24,
  },
  dayGoing: {
    backgroundColor: "#E9EEF5",
  },
  daySaved: {
    backgroundColor: "rgba(232, 170, 106, 0.12)",
  },
  dayToday: {
    borderColor: colors.foreground,
    borderWidth: 1.2,
  },
  dayTextToday: {
    fontWeight: "700" as const,
  },
  dayTextSelected: {
    color: colors.white,
  },
  daySelected: {
    backgroundColor: colors.foreground,
  },
  dayText: { ...typography.sm, color: colors.foreground },
  dots: { flexDirection: "row", gap: 3, marginTop: 2, height: 6 },
  dot: { width: 4, height: 4, borderRadius: 2 },
  dotGoing: { backgroundColor: colors.primary },
  dotSaved: { backgroundColor: colors.accent },
  detail: {
    padding: 16,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  detailHeader: {
    marginBottom: 14,
  },
  detailLabelTop: {
    ...typography.xs,
    color: colors.textSecondary,
    fontWeight: "700",
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  detailDateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  detailDayNumber: {
    fontSize: 42,
    lineHeight: 42,
    fontWeight: "700",
    color: colors.foreground,
  },
  detailDate: { ...typography.sm, fontWeight: "600", color: colors.foreground },
  detailSummary: { ...typography.xs, color: colors.textSecondary, marginTop: 2 },
  detailLabel: { ...typography.xs, color: colors.textSecondary, marginBottom: 6 },
  cardsList: {
    gap: 8,
    marginBottom: 8,
  },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    backgroundColor: colors.muted,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  detailItem: { ...typography.sm },
  detailSub: { ...typography.xs, color: colors.textSecondary, marginTop: 1 },
  removeBtn: {
    padding: 2,
    marginLeft: 8,
  },
  detailEmpty: { ...typography.sm, color: colors.textSecondary },
});

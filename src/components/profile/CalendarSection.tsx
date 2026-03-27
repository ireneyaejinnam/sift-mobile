import { useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { ChevronLeft, ChevronRight, X } from "lucide-react-native";
import { events } from "@/data/events";
import type { GoingEvent, SavedEvent } from "@/types/user";
import { useUser } from "@/context/UserContext";
import { colors, radius, typography, spacing } from "@/lib/theme";

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
}

export default function CalendarSection({
  goingEvents,
  savedEvents,
}: CalendarSectionProps) {
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

  const { dateToGoing, dateToSaved } = useMemo(() => {
    const dg = new Map<string, GoingEvent[]>();
    const ds = new Map<string, string[]>();
    goingEvents.forEach((e) => {
      const list = dg.get(e.eventDate) ?? [];
      list.push(e);
      dg.set(e.eventDate, list);
    });
    savedEvents.forEach((s) => {
      const ev = events.find((e) => e.id === s.eventId);
      if (ev) {
        const list = ds.get(ev.startDate) ?? [];
        list.push(s.eventId);
        ds.set(ev.startDate, list);
      }
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
  const selSavedIds = selectedDate ? dateToSaved.get(selectedDate) ?? [] : [];
  const selSavedEvents = selSavedIds
    .map((id) => events.find((e) => e.id === id))
    .filter(Boolean);

  return (
    <View style={st.section}>
      <Text style={st.h3}>My Calendar</Text>

      {/* Month navigation */}
      <View style={st.monthNav}>
        <Pressable onPress={prevMonth} style={st.navButton} hitSlop={8}>
          <ChevronLeft size={18} strokeWidth={2} color={colors.textSecondary} />
        </Pressable>
        <Text style={st.monthLabel}>{monthLabel}</Text>
        <Pressable onPress={nextMonth} style={st.navButton} hitSlop={8}>
          <ChevronRight size={18} strokeWidth={2} color={colors.textSecondary} />
        </Pressable>
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
          return (
            <Pressable
              key={key}
              onPress={() => setSelectedDate(isSelected ? null : key)}
              style={[st.dayCell, st.dayButton, isSelected && st.daySelected]}
            >
              <Text style={st.dayText}>{day}</Text>
              <View style={st.dots}>
                {hasGoing && <View style={st.dotGoing} />}
                {hasSaved && <View style={st.dotSaved} />}
              </View>
            </Pressable>
          );
        })}
      </View>

      {selectedDate && (
        <View style={st.detail}>
          <Text style={st.detailDate}>
            {new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", {
              weekday: "long",
              month: "short",
              day: "numeric",
            })}
          </Text>
          {selGoing.length > 0 && (
            <View style={{ marginBottom: 8 }}>
              <Text style={st.detailLabel}>Going:</Text>
              {selGoing.map((e) => (
                <View key={e.eventId} style={st.eventRow}>
                  <Text style={[st.detailItem, { flex: 1 }]}>{e.eventTitle}</Text>
                  <Pressable
                    onPress={() => toggleGoing({ eventId: e.eventId, eventTitle: e.eventTitle, eventDate: e.eventDate })}
                    hitSlop={8}
                    style={st.removeBtn}
                  >
                    <X size={14} strokeWidth={2.5} color={colors.textSecondary} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
          {selSavedEvents.length > 0 && (
            <View>
              <Text style={st.detailLabel}>Saved:</Text>
              {selSavedEvents.map((e) => (
                <View key={e!.id} style={st.eventRow}>
                  <Text style={[st.detailItem, { flex: 1 }]}>{e!.title}</Text>
                  <Pressable
                    onPress={() => removeSavedEvent(e!.id)}
                    hitSlop={8}
                    style={st.removeBtn}
                  >
                    <X size={14} strokeWidth={2.5} color={colors.textSecondary} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
          {selGoing.length === 0 && selSavedEvents.length === 0 && (
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
  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  navButton: {
    padding: 4,
  },
  monthLabel: { ...typography.sm, color: colors.textSecondary, fontWeight: "600" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  weekdayCell: { width: "14.28%", alignItems: "center", marginBottom: 4 },
  weekday: { ...typography.xs, fontWeight: "600", color: colors.textSecondary },
  dayCell: { width: "14.28%", aspectRatio: 1, alignItems: "center", justifyContent: "center" },
  dayButton: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  daySelected: {
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  dayText: { ...typography.sm, color: colors.foreground },
  dots: { flexDirection: "row", gap: 2, marginTop: 2 },
  dotGoing: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.primary },
  dotSaved: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.accent },
  detail: {
    padding: 12,
    backgroundColor: colors.muted,
    borderRadius: radius.md,
    marginTop: 12,
  },
  detailDate: { ...typography.sm, fontWeight: "600", color: colors.foreground, marginBottom: 8 },
  detailLabel: { ...typography.xs, color: colors.textSecondary },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  detailItem: { ...typography.sm },
  removeBtn: {
    padding: 2,
    marginLeft: 8,
  },
  detailEmpty: { ...typography.sm, color: colors.textSecondary },
});

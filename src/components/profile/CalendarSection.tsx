import { useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { ChevronLeft, ChevronRight, X } from "lucide-react-native";
import type { GoingEvent } from "@/types/user";
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
}

export default function CalendarSection({
  goingEvents,
}: CalendarSectionProps) {
  const router = useRouter();
  const { toggleGoing } = useUser();
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

  const dateToGoing = useMemo(() => {
    const dg = new Map<string, GoingEvent[]>();
    goingEvents.forEach((e) => {
      const list = dg.get(e.eventDate) ?? [];
      list.push(e);
      dg.set(e.eventDate, list);
    });
    return dg;
  }, [goingEvents]);

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

  return (
    <View style={st.section}>
      <Text style={st.h3}>My Calendar</Text>
      <View style={st.card}>
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
                isToday && st.dayToday,
                isSelected && st.daySelected,
              ]}
            >
              <Text style={[st.dayText, isToday && st.dayTextToday]}>{day}</Text>
              {hasGoing && <View style={st.dotGoing} />}
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
          {selGoing.length > 0 ? selGoing.map((e) => (
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
          )) : (
            <Text style={st.detailEmpty}>No events this day</Text>
          )}
        </View>
      )}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  section: { marginBottom: 28 },
  h3: { fontSize: 15, fontWeight: "600", color: colors.foreground, marginBottom: 12 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 16,
    ...shadows.card,
  },
  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  navButton: { padding: 4 },
  monthLabel: { fontSize: 14, fontWeight: "600", color: colors.foreground },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  weekdayCell: { width: "14.28%", alignItems: "center", marginBottom: 6 },
  weekday: { fontSize: 11, fontWeight: "600", color: colors.textMuted },
  dayCell: { width: "14.28%", height: 40, alignItems: "center", justifyContent: "flex-start", paddingTop: 6 },
  dayButton: {
    borderRadius: radius.sm,
  },
  dayGoing: {
    backgroundColor: colors.primaryLight,
  },
  daySaved: {
    backgroundColor: "rgba(232, 170, 106, 0.12)",
  },
  dayToday: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.sm,
  },
  dayTextToday: {
    fontWeight: "700" as const,
    color: colors.primary,
  },
  daySelected: {
    backgroundColor: colors.muted,
    borderRadius: radius.sm,
  },
  dayText: { fontSize: 13, color: colors.foreground },
  dots: { flexDirection: "row", gap: 2, marginTop: 2, height: 5 },
  dotGoing: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.primary },
  dotSaved: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.accent },
  detail: {
    padding: 12,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    marginTop: 12,
  },
  detailDate: { fontSize: 13, fontWeight: "600", color: colors.foreground, marginBottom: 8 },
  detailLabel: { ...typography.xs, color: colors.textSecondary, marginBottom: 2 },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  detailItem: { ...typography.sm },
  detailSub: { ...typography.xs, color: colors.textSecondary, marginTop: 1 },
  removeBtn: { padding: 2, marginLeft: 8 },
  detailEmpty: { ...typography.sm, color: colors.textSecondary },
});

import { useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import type { SiftEvent } from "@/types/event";
import { colors, radius, typography } from "@/lib/theme";

interface GoingDateSheetProps {
  event: SiftEvent;
  onConfirm: (date: string) => void;
  onCancel: () => void;
  confirmLabel?: string;
}

function formatShortDate(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** Returns an array of YYYY-MM-DD strings between start and end (inclusive),
 *  beginning from today if start is already past, capped at 60 dates. */
function getDatesInRange(start: string, end: string): string[] {
  const startD = new Date(start + "T12:00:00");
  const endD = new Date(end + "T12:00:00");
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const from = startD < today ? today : startD;
  const dates: string[] = [];
  const cur = new Date(from);
  while (cur <= endD && dates.length < 60) {
    dates.push(cur.toISOString().split("T")[0]);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

export default function GoingDateSheet({
  event,
  onConfirm,
  onCancel,
  confirmLabel = "Mark as Going",
}: GoingDateSheetProps) {
  // For recurring multi-date events use the pre-computed dates array;
  // for range exhibitions generate dates within the span.
  const options: { date: string; time?: string }[] =
    event.dates && event.dates.length > 1
      ? event.dates.map((d) => ({ date: d.startDate, time: d.time }))
      : getDatesInRange(event.startDate, event.endDate!).map((d) => ({ date: d }));

  const [selected, setSelected] = useState<string>(options[0]?.date ?? event.startDate);

  return (
    <View style={st.container}>
      <Text style={st.title}>Pick your date</Text>
      <Text style={st.sub}>
        {event.dates && event.dates.length > 1
          ? "This event runs on multiple dates — choose the one you'll attend."
          : `This exhibition runs ${formatShortDate(event.startDate)} – ${formatShortDate(event.endDate!)}. Pick the day you're going.`}
      </Text>

      <ScrollView
        style={st.scroll}
        contentContainerStyle={st.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {options.map((opt) => (
          <Pressable
            key={opt.time ? `${opt.date}-${opt.time}` : opt.date}
            onPress={() => setSelected(opt.date)}
            style={[st.option, selected === opt.date && st.optionSelected]}
          >
            <Text
              style={[
                st.optionDate,
                selected === opt.date && st.optionTextActive,
              ]}
            >
              {formatShortDate(opt.date)}
            </Text>
            {opt.time ? (
              <Text
                style={[
                  st.optionTime,
                  selected === opt.date && st.optionTextActive,
                ]}
              >
                {opt.time}
              </Text>
            ) : null}
          </Pressable>
        ))}
      </ScrollView>

      <View style={st.actions}>
        <Pressable onPress={onCancel} style={st.cancelBtn}>
          <Text style={st.cancelText}>Cancel</Text>
        </Pressable>
        <Pressable onPress={() => onConfirm(selected)} style={st.confirmBtn}>
          <Text style={st.confirmText}>{confirmLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  container: { paddingHorizontal: 4, paddingBottom: 8 },
  title: { ...typography.h3, marginBottom: 6 },
  sub: {
    ...typography.sm,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: 16,
  },
  scroll: { maxHeight: 240 },
  scrollContent: { gap: 8, paddingBottom: 4 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  optionSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  optionDate: {
    ...typography.sm,
    fontWeight: "500",
    color: colors.foreground,
  },
  optionTime: {
    ...typography.sm,
    color: colors.textSecondary,
  },
  optionTextActive: {
    color: colors.white,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  cancelText: {
    ...typography.sm,
    fontWeight: "500",
    color: colors.foreground,
  },
  confirmBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
  },
  confirmText: {
    ...typography.sm,
    fontWeight: "600",
    color: colors.white,
  },
});

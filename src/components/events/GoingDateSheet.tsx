import { useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { Calendar } from "react-native-calendars";
import { MapPin } from "lucide-react-native";
import type { SiftEvent, EventSession } from "@/types/event";
import type { UserProfile } from "@/types/user";
import { colors, radius, typography } from "@/lib/theme";
import { scoreSession, getBudgetMax } from "@/lib/recommend";
import { todayNYC, formatNYCDate } from "@/lib/time";

interface GoingDateSheetProps {
  event: SiftEvent;
  onConfirm: (date: string) => void;
  onCancel: () => void;
  confirmLabel?: string;
  userProfile?: UserProfile | null;
}

function formatShortDate(d: string): string {
  return formatNYCDate(d, { weekday: "short", month: "short", day: "numeric" });
}

function formatSessionPrice(s: EventSession): string | null {
  if (s.priceMin === 0) return "Free";
  if (s.priceMin != null && s.priceMax != null && s.priceMin !== s.priceMax) {
    return `$${s.priceMin}–$${s.priceMax}`;
  }
  if (s.priceMin != null) return `$${s.priceMin}`;
  return null;
}


// ── Calendar view for range events ──────────────────────────

function RangeCalendar({
  event,
  onConfirm,
  onCancel,
  confirmLabel,
}: {
  event: SiftEvent;
  onConfirm: (date: string) => void;
  onCancel: () => void;
  confirmLabel: string;
}) {
  const today = todayNYC();
  const effectiveMin = event.startDate > today ? event.startDate : today;
  const maxDate = event.endDate!;
  const [selected, setSelected] = useState<string>(effectiveMin);

  const markedDates = {
    [selected]: {
      selected: true,
      selectedColor: colors.primary,
      selectedTextColor: colors.white,
    },
  };

  return (
    <View style={st.container}>
      <Text style={st.title}>Pick your date</Text>
      <Text style={st.sub}>
        This runs {formatShortDate(event.startDate)} – {formatShortDate(maxDate)}. Pick the day you're going.
      </Text>

      <Calendar
        minDate={effectiveMin}
        maxDate={maxDate}
        current={effectiveMin}
        onDayPress={(day: { dateString: string }) => {
          if (day.dateString >= effectiveMin) setSelected(day.dateString);
        }}
        markedDates={markedDates}
        enableSwipeMonths
        hideExtraDays={false}
        theme={{
          backgroundColor: colors.card,
          calendarBackground: colors.card,
          todayTextColor: colors.primary,
          selectedDayBackgroundColor: colors.primary,
          selectedDayTextColor: colors.white,
          dayTextColor: colors.foreground,
          textDisabledColor: colors.border,
          arrowColor: colors.primary,
          monthTextColor: colors.foreground,
          textMonthFontWeight: "600",
          textDayFontSize: 14,
          textMonthFontSize: 15,
          textDayHeaderFontSize: 12,
          dotColor: colors.primary,
        }}
        style={st.calendar}
      />

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

// ── List view for multi-session events ───────────────────────

export default function GoingDateSheet({
  event,
  onConfirm,
  onCancel,
  confirmLabel = "Mark as Going",
  userProfile,
}: GoingDateSheetProps) {
  const sessions = event.sessions ?? [];
  const isMultiSession = sessions.length > 1;
  const isRangeExhibition =
    !isMultiSession && !!event.endDate && event.endDate !== event.startDate;

  if (isRangeExhibition) {
    return (
      <RangeCalendar
        event={event}
        onConfirm={onConfirm}
        onCancel={onCancel}
        confirmLabel={confirmLabel}
      />
    );
  }

  // Multi-session list
  const budgetMax = userProfile ? getBudgetMax(userProfile.budget) : null;
  const options: EventSession[] =
    isMultiSession && userProfile
      ? [...sessions].sort((a, b) => {
          const scoreA = scoreSession(a, userProfile, budgetMax).pts;
          const scoreB = scoreSession(b, userProfile, budgetMax).pts;
          if (scoreB !== scoreA) return scoreB - scoreA;
          return a.startDate.localeCompare(b.startDate);
        })
      : sessions.length > 0
      ? sessions
      : [{ startDate: event.startDate }];

  const toKey = (s: EventSession) => `${s.startDate}::${s.time ?? ""}`;
  const [selected, setSelected] = useState<string>(
    toKey(options[0] ?? { startDate: event.startDate })
  );

  return (
    <View style={st.container}>
      <Text style={st.title}>Pick your date</Text>
      <Text style={st.sub}>
        This event runs on multiple dates — choose the one you'll attend.
      </Text>

      <ScrollView
        style={st.scroll}
        contentContainerStyle={st.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {options.map((opt, i) => {
          const key = `${opt.startDate}-${opt.time ?? ""}-${opt.location ?? ""}`;
          const isSelected = selected === toKey(opt);
          const isBest = i === 0 && isMultiSession && !!userProfile;
          const price = formatSessionPrice(opt);
          const locationLabel = opt.location ?? opt.address ?? null;

          return (
            <Pressable
              key={key}
              onPress={() => setSelected(toKey(opt))}
              style={[st.option, isSelected && st.optionSelected]}
            >
              <View style={st.optionLeft}>
                <Text style={[st.optionDate, isSelected && st.optionTextActive]}>
                  {formatShortDate(opt.startDate)}
                  {opt.time ? `  ·  ${opt.time}` : ""}
                </Text>
                {locationLabel ? (
                  <View style={st.optionLocationRow}>
                    <MapPin
                      size={11}
                      strokeWidth={1.5}
                      color={isSelected ? colors.white : colors.textSecondary}
                    />
                    <Text
                      style={[st.optionLocation, isSelected && st.optionTextActive]}
                      numberOfLines={1}
                    >
                      {locationLabel}
                    </Text>
                  </View>
                ) : null}
              </View>
              <View style={st.optionRight}>
                {price ? (
                  <Text style={[st.optionPrice, isSelected && st.optionTextActive]}>
                    {price}
                  </Text>
                ) : null}
                {isBest ? (
                  <View style={[st.mostFitBadge, isSelected && st.mostFitBadgeSelected]}>
                    <Text style={[st.mostFitText, isSelected && { color: colors.white }]}>
                      Most Fit
                    </Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={st.actions}>
        <Pressable onPress={onCancel} style={st.cancelBtn}>
          <Text style={st.cancelText}>Cancel</Text>
        </Pressable>
        <Pressable
          onPress={() => onConfirm(selected.split("::")[0])}
          style={st.confirmBtn}
        >
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
  calendar: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 4,
    height: 370,
  },
  scroll: { maxHeight: 280 },
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
  optionLeft: { flex: 1, gap: 3 },
  optionDate: {
    ...typography.sm,
    fontWeight: "500",
    color: colors.foreground,
  },
  optionLocationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  optionLocation: {
    ...typography.xs,
    color: colors.textSecondary,
    flex: 1,
  },
  optionRight: {
    alignItems: "flex-end",
    gap: 4,
    marginLeft: 8,
  },
  optionPrice: {
    ...typography.sm,
    color: colors.textSecondary,
  },
  optionTextActive: { color: colors.white },
  mostFitBadge: {
    backgroundColor: `${colors.primary}20`,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  mostFitBadgeSelected: { backgroundColor: `${colors.white}30` },
  mostFitText: {
    ...typography.xs,
    fontWeight: "600",
    color: colors.primary,
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

import { useMemo } from "react";
import { View, StyleSheet } from "react-native";
import { Calendar } from "react-native-calendars";
import type { DateData, MarkedDates } from "react-native-calendars/src/types";
import { colors, radius } from "@/lib/theme";

interface DateRangePickerProps {
  dateFrom?: string; // "YYYY-MM-DD"
  dateTo?: string;
  onChange: (from: string | undefined, to: string | undefined) => void;
}

export default function DateRangePicker({
  dateFrom,
  dateTo,
  onChange,
}: DateRangePickerProps) {
  const today = new Date().toISOString().split("T")[0];

  const markedDates = useMemo<MarkedDates>(() => {
    if (!dateFrom) return {};

    const marks: MarkedDates = {};

    if (!dateTo || dateFrom === dateTo) {
      marks[dateFrom] = {
        startingDay: true,
        endingDay: true,
        color: colors.primary,
        textColor: colors.white,
      };
      return marks;
    }

    // Mark range
    const start = new Date(dateFrom + "T00:00:00");
    const end = new Date(dateTo + "T00:00:00");
    const cursor = new Date(start);

    while (cursor <= end) {
      const key = cursor.toISOString().split("T")[0];
      const isStart = key === dateFrom;
      const isEnd = key === dateTo;
      marks[key] = {
        startingDay: isStart,
        endingDay: isEnd,
        color: isStart || isEnd ? colors.primary : colors.primaryLight,
        textColor: isStart || isEnd ? colors.white : colors.primary,
      };
      cursor.setDate(cursor.getDate() + 1);
    }

    return marks;
  }, [dateFrom, dateTo]);

  const handleDayPress = (day: DateData) => {
    const selected = day.dateString;

    if (!dateFrom || (dateFrom && dateTo)) {
      // Start new selection
      onChange(selected, undefined);
    } else {
      // Complete the range
      if (selected < dateFrom) {
        onChange(selected, dateFrom);
      } else {
        onChange(dateFrom, selected);
      }
    }
  };

  return (
    <View style={styles.container}>
      <Calendar
        onDayPress={handleDayPress}
        markingType="period"
        markedDates={markedDates}
        minDate={today}
        theme={{
          backgroundColor: colors.white,
          calendarBackground: colors.white,
          textSectionTitleColor: colors.textSecondary,
          selectedDayBackgroundColor: colors.primary,
          selectedDayTextColor: colors.white,
          todayTextColor: colors.primary,
          dayTextColor: colors.foreground,
          textDisabledColor: colors.textMuted,
          arrowColor: colors.primary,
          monthTextColor: colors.foreground,
          textMonthFontWeight: "600",
          textDayFontSize: 15,
          textMonthFontSize: 16,
          textDayHeaderFontSize: 13,
        }}
        style={styles.calendar}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
  },
  calendar: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    width: 340,
  },
});

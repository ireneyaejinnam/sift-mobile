/**
 * Quick date-range presets for the discovery filter bar.
 *
 * Filtering is date-only (no time-of-day), so "Tonight" resolves to today's
 * date range. All ranges are NYC-anchored via time.ts — never raw `new Date()`
 * for the "now" anchor. Pure calendar arithmetic (addDays) uses UTC to stay
 * DST-safe on YYYY-MM-DD strings.
 */
import { todayNYC, nowNYC } from "./time";
import type { Filters } from "@/types/quiz";

export type DatePreset = "tonight" | "this_weekend" | "next_weekend";

export const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "tonight", label: "Tonight" },
  { value: "this_weekend", label: "This weekend" },
  { value: "next_weekend", label: "Next weekend" },
];

export interface DateRange {
  dateFrom: string; // YYYY-MM-DD
  dateTo: string; // YYYY-MM-DD
}

/** Add `n` days to a YYYY-MM-DD string using UTC math (DST-safe). */
function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/**
 * Pure range computation, decoupled from the clock for testability.
 * @param today YYYY-MM-DD for "today"
 * @param dow   day of week for that same day (0 = Sunday … 6 = Saturday)
 */
export function computePresetRange(
  preset: DatePreset,
  today: string,
  dow: number
): DateRange {
  if (preset === "tonight") {
    return { dateFrom: today, dateTo: today };
  }

  if (preset === "this_weekend") {
    // On Sunday the weekend's Saturday has passed → collapse to today.
    if (dow === 0) return { dateFrom: today, dateTo: today };
    const daysUntilSat = (6 - dow + 7) % 7; // Sat→0, Fri→1, … Mon→5
    const sat = addDays(today, daysUntilSat);
    return { dateFrom: sat, dateTo: addDays(sat, 1) };
  }

  // next_weekend — the Sat–Sun block after the current weekend.
  const thisSat = dow === 0 ? addDays(today, -1) : addDays(today, (6 - dow + 7) % 7);
  const nextSat = addDays(thisSat, 7);
  return { dateFrom: nextSat, dateTo: addDays(nextSat, 1) };
}

/** Resolve a preset to a concrete date range anchored to "now" in NYC. */
export function getDatePresetRange(preset: DatePreset): DateRange {
  return computePresetRange(preset, todayNYC(), nowNYC().getDay());
}

/** If the current filters exactly match a preset's range, return that preset. */
export function matchDatePreset(filters: Filters): DatePreset | null {
  if (!filters.dateFrom || !filters.dateTo) return null;
  for (const { value } of DATE_PRESETS) {
    const r = getDatePresetRange(value);
    if (r.dateFrom === filters.dateFrom && r.dateTo === filters.dateTo) return value;
  }
  return null;
}

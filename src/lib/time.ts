/**
 * All date/time operations are anchored to America/New_York.
 * Use these helpers everywhere instead of raw `new Date()` or `.toISOString()`.
 */

const TZ = "America/New_York";

/**
 * Today's date in NYC as a YYYY-MM-DD string.
 * Works correctly regardless of the device's local timezone.
 */
export function todayNYC(): string {
  // en-CA locale gives YYYY-MM-DD format natively
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

/**
 * Current NYC time as a Date object whose UTC value corresponds to
 * the equivalent wall-clock moment in New York.
 * Useful for relative calculations (daysLeft, isUpcoming, etc.).
 */
export function nowNYC(): Date {
  // Convert "what time is it in NYC right now" into a Date
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);

  return new Date(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second")
  );
}

/**
 * Format a YYYY-MM-DD date string for display using NYC timezone.
 * Parses the date at NYC noon to avoid any DST / UTC-offset ambiguity.
 */
export function formatNYCDate(
  dateStr: string,
  options: Intl.DateTimeFormatOptions
): string {
  // T12:00:00Z is noon UTC — always the same calendar date in NYC (UTC-4/5)
  const d = new Date(dateStr + "T12:00:00Z");
  return d.toLocaleDateString("en-US", { ...options, timeZone: TZ });
}

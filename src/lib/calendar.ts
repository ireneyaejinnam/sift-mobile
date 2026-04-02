import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import type { SiftEvent } from "@/types/event";

/**
 * Generate an ICS calendar string for a single event.
 */
function eventToICS(event: SiftEvent): string {
  const uid = `${event.id}@sift-app`;
  const now = formatICSDate(new Date());
  const start = formatICSDate(new Date(event.startDate + "T12:00:00"));
  const end = event.endDate
    ? formatICSDate(new Date(event.endDate + "T23:59:00"))
    : formatICSDate(new Date(event.startDate + "T23:59:00"));
  const summary = escapeICS(event.title);
  const location = escapeICS(`${event.location}, ${event.address}`);
  const description = escapeICS(
    event.description.slice(0, 300) +
      (event.ticketUrl ? `\\n\\nTickets: ${event.ticketUrl}` : "")
  );

  return [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART;VALUE=DATE:${event.startDate.replace(/-/g, "")}`,
    `DTEND;VALUE=DATE:${(event.endDate || event.startDate).replace(/-/g, "")}`,
    `SUMMARY:${summary}`,
    `LOCATION:${location}`,
    `DESCRIPTION:${description}`,
    event.ticketUrl ? `URL:${event.ticketUrl}` : "",
    "END:VEVENT",
  ]
    .filter(Boolean)
    .join("\r\n");
}

function formatICSDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeICS(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/**
 * Generate a full .ics file string for one or more events.
 */
export function generateICSContent(events: SiftEvent[]): string {
  const vevents = events.map(eventToICS).join("\r\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Sift//Weekend Plan//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    vevents,
    "END:VCALENDAR",
  ].join("\r\n");
}

/**
 * Generate a Google Calendar URL for a single event.
 */
export function generateGoogleCalendarUrl(event: SiftEvent): string {
  const start = event.startDate.replace(/-/g, "");
  const end = event.endDate
    ? event.endDate.replace(/-/g, "")
    : start;
  const title = encodeURIComponent(event.title);
  const location = encodeURIComponent(
    `${event.location}, ${event.address}`
  );
  const details = encodeURIComponent(
    event.description.slice(0, 200) +
      (event.ticketUrl ? `\n\nTickets: ${event.ticketUrl}` : "")
  );
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&location=${location}&details=${details}`;
}

/**
 * Save .ics file and open the native share sheet so the user can
 * add it to Apple Calendar, Google Calendar, or any calendar app.
 */
export async function shareICSFile(events: SiftEvent[]): Promise<boolean> {
  try {
    const icsContent = generateICSContent(events);
    const fileName = events.length === 1
      ? `${events[0].title.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 30)}.ics`
      : "sift-weekend-plan.ics";
    const filePath = `${FileSystem.cacheDirectory}${fileName}`;

    await FileSystem.writeAsStringAsync(filePath, icsContent, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(filePath, {
        mimeType: "text/calendar",
        UTI: "com.apple.ical.ics",
        dialogTitle: "Add to Calendar",
      });
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

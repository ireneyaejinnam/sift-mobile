import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as Calendar from "expo-calendar";
import { Platform, Alert } from "react-native";
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
 * Add event directly to the device's default calendar via expo-calendar.
 * Requests calendar permission on first use. Returns true if the event was created.
 */
export async function addToDeviceCalendar(event: SiftEvent): Promise<boolean> {
  try {
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Calendar access needed",
        "Enable calendar access in Settings to add events.",
      );
      return false;
    }

    // Get the default calendar, or find the first writable one
    let calendarId: string | undefined;

    if (Platform.OS === "ios") {
      try {
        const defaultCal = await Calendar.getDefaultCalendarAsync();
        calendarId = defaultCal?.id;
      } catch {
        // No default calendar configured — fall through to writable search
      }
    }

    if (!calendarId) {
      const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
      const writable = calendars.find(
        (c) => c.allowsModifications && c.source?.type === "local"
      ) ?? calendars.find((c) => c.allowsModifications);
      calendarId = writable?.id;
    }

    if (!calendarId) {
      console.warn("[calendar] No writable calendar found");
      return false;
    }

    const startDate = new Date(event.startDate + "T12:00:00");
    const endDate = event.endDate
      ? new Date(event.endDate + "T23:59:00")
      : new Date(event.startDate + "T23:59:00");

    const notes = event.description.slice(0, 500) +
      (event.ticketUrl ? `\n\nTickets: ${event.ticketUrl}` : "") +
      (event.eventUrl ? `\n\nEvent page: ${event.eventUrl}` : "");

    await Calendar.createEventAsync(calendarId, {
      title: event.title,
      startDate,
      endDate,
      location: [event.location, event.address].filter(Boolean).join(", "),
      notes,
      url: event.ticketUrl ?? event.eventUrl ?? undefined,
      allDay: true,
    });

    return true;
  } catch (err) {
    console.warn("[calendar] addToDeviceCalendar failed:", err);
    return false;
  }
}

/**
 * Share .ics file via native share sheet (fallback for bulk export / Android).
 */
export async function shareICSFile(events: SiftEvent[]): Promise<boolean> {
  try {
    const icsContent = generateICSContent(events);
    const fileName = events.length === 1
      ? `${events[0].title.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 30)}.ics`
      : "sift-weekend-plan.ics";

    const file = new File(Paths.cache, fileName);
    try { file.delete(); } catch {}
    file.create();
    file.write(icsContent);

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri, {
        mimeType: "text/calendar",
        UTI: "com.apple.ical.ics",
        dialogTitle: "Add to Calendar",
      });
      return true;
    }
    return false;
  } catch (err) {
    console.warn("[calendar] shareICSFile failed:", err);
    return false;
  }
}

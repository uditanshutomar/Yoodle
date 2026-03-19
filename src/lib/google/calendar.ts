import { getGoogleServices } from "./client";
import { withGoogleRetry } from "./retry-wrapper";
import { calendar_v3 } from "googleapis";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("google:calendar");

export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  start: string;
  end: string;
  location?: string;
  attendees: { email: string; name?: string; responseStatus?: string }[];
  meetLink?: string;
  htmlLink?: string;
  status: string;
  organizer?: { email: string; displayName?: string };
}

export interface CreateEventOptions {
  title: string;
  description?: string;
  start: string; // ISO 8601 datetime or YYYY-MM-DD for all-day events
  end: string; // ISO 8601 datetime or YYYY-MM-DD for all-day events
  location?: string;
  attendees?: string[];
  addMeetLink?: boolean;
  timeZone?: string;
  allDay?: boolean;
  recurrence?: string[]; // RRULE strings, e.g. ["RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=10"]
}

/**
 * List upcoming calendar events.
 */
export async function listEvents(
  userId: string,
  options: {
    maxResults?: number;
    timeMin?: string;
    timeMax?: string;
    calendarId?: string;
  } = {}
): Promise<CalendarEvent[]> {
  const { calendar } = await getGoogleServices(userId);

  const res = await withGoogleRetry(() =>
    calendar.events.list({
      calendarId: options.calendarId || "primary",
      timeMin: options.timeMin || new Date().toISOString(),
      timeMax: options.timeMax,
      maxResults: options.maxResults || 20,
      singleEvents: true,
      orderBy: "startTime",
    })
  );

  return (res.data.items || []).map(formatEvent);
}

/**
 * Create a new calendar event.
 */
export async function createEvent(
  userId: string,
  options: CreateEventOptions
): Promise<CalendarEvent> {
  const { calendar } = await getGoogleServices(userId);

  const timeZone = options.timeZone || "UTC";

  // Detect all-day events: either explicitly flagged or date-only strings (YYYY-MM-DD)
  const isAllDay = options.allDay || (/^\d{4}-\d{2}-\d{2}$/.test(options.start) && /^\d{4}-\d{2}-\d{2}$/.test(options.end));

  const res = await withGoogleRetry(() =>
    calendar.events.insert({
      calendarId: "primary",
      conferenceDataVersion: options.addMeetLink ? 1 : 0,
      requestBody: {
        summary: options.title,
        description: options.description,
        location: options.location,
        start: isAllDay
          ? { date: options.start }
          : { dateTime: options.start, timeZone },
        end: isAllDay
          ? { date: options.end }
          : { dateTime: options.end, timeZone },
        attendees: options.attendees?.map((email) => ({ email })),
        recurrence: options.recurrence,
        conferenceData: options.addMeetLink
          ? {
              createRequest: {
                requestId: `yoodle-${Date.now()}`,
                conferenceSolutionKey: { type: "hangoutsMeet" },
              },
            }
          : undefined,
      },
    })
  );

  return formatEvent(res.data);
}

/**
 * Update an existing calendar event.
 */
export async function updateEvent(
  userId: string,
  eventId: string,
  updates: Partial<CreateEventOptions>
): Promise<CalendarEvent> {
  const { calendar } = await getGoogleServices(userId);

  const timeZone = updates.timeZone || "UTC";
  const requestBody: Record<string, unknown> = {};

  if (updates.title !== undefined) requestBody.summary = updates.title;
  if (updates.description !== undefined) requestBody.description = updates.description;
  if (updates.location !== undefined) requestBody.location = updates.location;
  if (updates.start) {
    requestBody.start = { dateTime: updates.start, timeZone };
  }
  if (updates.end) {
    requestBody.end = { dateTime: updates.end, timeZone };
  }
  if (updates.attendees) {
    requestBody.attendees = updates.attendees.map((email) => ({ email }));
  }

  const res = await withGoogleRetry(() =>
    calendar.events.patch({
      calendarId: "primary",
      eventId,
      requestBody,
    })
  );

  return formatEvent(res.data);
}

/**
 * Get a single calendar event by ID.
 * Returns null if the event is not found, deleted, or inaccessible.
 */
export async function getEvent(
  userId: string,
  eventId: string
): Promise<CalendarEvent | null> {
  try {
    const { calendar } = await getGoogleServices(userId);

    const res = await withGoogleRetry(() =>
      calendar.events.get({
        calendarId: "primary",
        eventId,
      })
    );

    return formatEvent(res.data);
  } catch (err: unknown) {
    const status = (err as { code?: number }).code;
    // 404 (not found), 410 (gone/deleted), or 403 (permission denied) — event is inaccessible
    if (status === 404 || status === 410 || status === 403) return null;
    // Rethrow unexpected errors (network, quota, token expiry) so callers don't
    // treat transient failures as "event does not exist"
    log.error({ err, eventId }, "getEvent failed with unexpected error");
    throw err;
  }
}

/**
 * Delete a calendar event.
 */
export async function deleteEvent(
  userId: string,
  eventId: string
): Promise<void> {
  const { calendar } = await getGoogleServices(userId);

  await withGoogleRetry(() =>
    calendar.events.delete({
      calendarId: "primary",
      eventId,
    })
  );
}

function formatEvent(event: calendar_v3.Schema$Event): CalendarEvent {
  return {
    id: event.id || "",
    title: event.summary || "",
    description: event.description || "",
    start: event.start?.dateTime || event.start?.date || "",
    end: event.end?.dateTime || event.end?.date || "",
    location: event.location ?? undefined,
    attendees: (event.attendees || []).map((a) => ({
      email: a.email || "",
      name: a.displayName ?? undefined,
      responseStatus: a.responseStatus ?? undefined,
    })),
    meetLink:
      event.conferenceData?.entryPoints?.find(
        (ep) => ep.entryPointType === "video"
      )?.uri ?? event.hangoutLink ?? undefined,
    htmlLink: event.htmlLink ?? undefined,
    status: event.status || "confirmed",
    organizer: event.organizer
      ? {
          email: event.organizer.email || "",
          displayName: event.organizer.displayName ?? undefined,
        }
      : undefined,
  };
}

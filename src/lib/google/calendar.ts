import { getGoogleServices } from "./client";
import { calendar_v3 } from "googleapis";

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
  start: string; // ISO 8601
  end: string; // ISO 8601
  location?: string;
  attendees?: string[];
  addMeetLink?: boolean;
  timeZone?: string;
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

  const res = await calendar.events.list({
    calendarId: options.calendarId || "primary",
    timeMin: options.timeMin || new Date().toISOString(),
    timeMax: options.timeMax,
    maxResults: options.maxResults || 20,
    singleEvents: true,
    orderBy: "startTime",
  });

  return (res.data.items || []).map(formatEvent);
}

/**
 * Get a single calendar event by ID.
 */
export async function getEvent(
  userId: string,
  eventId: string,
  calendarId = "primary"
): Promise<CalendarEvent> {
  const { calendar } = await getGoogleServices(userId);

  const res = await calendar.events.get({
    calendarId,
    eventId,
  });

  return formatEvent(res.data);
}

/**
 * Create a new calendar event.
 */
export async function createEvent(
  userId: string,
  options: CreateEventOptions
): Promise<CalendarEvent> {
  const { calendar } = await getGoogleServices(userId);

  const timeZone = options.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;

  const res = await calendar.events.insert({
    calendarId: "primary",
    conferenceDataVersion: options.addMeetLink ? 1 : 0,
    requestBody: {
      summary: options.title,
      description: options.description,
      location: options.location,
      start: {
        dateTime: options.start,
        timeZone,
      },
      end: {
        dateTime: options.end,
        timeZone,
      },
      attendees: options.attendees?.map((email) => ({ email })),
      conferenceData: options.addMeetLink
        ? {
            createRequest: {
              requestId: `yoodle-${Date.now()}`,
              conferenceSolutionKey: { type: "hangoutsMeet" },
            },
          }
        : undefined,
    },
  });

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

  const requestBody: Record<string, unknown> = {};

  if (updates.title) requestBody.summary = updates.title;
  if (updates.description) requestBody.description = updates.description;
  if (updates.location) requestBody.location = updates.location;
  if (updates.start) {
    requestBody.start = { dateTime: updates.start };
  }
  if (updates.end) {
    requestBody.end = { dateTime: updates.end };
  }
  if (updates.attendees) {
    requestBody.attendees = updates.attendees.map((email) => ({ email }));
  }

  const res = await calendar.events.patch({
    calendarId: "primary",
    eventId,
    requestBody,
  });

  return formatEvent(res.data);
}

/**
 * Delete a calendar event.
 */
export async function deleteEvent(
  userId: string,
  eventId: string
): Promise<void> {
  const { calendar } = await getGoogleServices(userId);

  await calendar.events.delete({
    calendarId: "primary",
    eventId,
  });
}

/**
 * Find free/busy time slots.
 */
export async function getFreeBusy(
  userId: string,
  timeMin: string,
  timeMax: string,
  calendarIds: string[] = ["primary"]
): Promise<{ calendarId: string; busy: { start: string; end: string }[] }[]> {
  const { calendar } = await getGoogleServices(userId);

  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin,
      timeMax,
      items: calendarIds.map((id) => ({ id })),
    },
  });

  return Object.entries(res.data.calendars || {}).map(([calendarId, data]) => ({
    calendarId,
    busy: (data.busy || []).map((b) => ({
      start: b.start || "",
      end: b.end || "",
    })),
  }));
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

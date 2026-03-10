import { NextRequest } from "next/server";
import { z } from "zod";
import { withHandler } from "@/lib/api/with-handler";
import { successResponse, errorResponse } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/auth/middleware";
import { BadRequestError } from "@/lib/api/errors";
import { listEvents, createEvent, updateEvent, deleteEvent } from "@/lib/google/calendar";
import { hasGoogleAccess } from "@/lib/google/client";
import connectDB from "@/lib/db/client";
import User from "@/lib/db/models/user";

// ── Validation ──────────────────────────────────────────────────────

const querySchema = z.object({
  timeMin: z.string().datetime().optional(),
  timeMax: z.string().datetime().optional(),
  maxResults: z.coerce.number().int().min(1).max(100).default(30),
});

const createEventSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  start: z.string().min(1, "Start time required."),
  end: z.string().min(1, "End time required."),
  location: z.string().max(500).optional(),
  attendees: z.array(z.string().email()).optional(),
  attendeeUserIds: z.array(z.string()).optional(),
  addMeetLink: z.boolean().optional().default(false),
  timeZone: z.string().optional(),
});

const updateEventSchema = z.object({
  eventId: z.string().min(1, "Event ID required."),
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  location: z.string().max(500).optional(),
  attendees: z.array(z.string().email()).optional(),
});

// ── GET /api/calendar/events ────────────────────────────────────────

/**
 * List calendar events for the authenticated user from Google Calendar.
 * Falls back to an empty list if user hasn't connected Google.
 */
export const GET = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "calendar");
  const userId = await getUserIdFromRequest(req);

  // Check if user has Google access
  const hasAccess = await hasGoogleAccess(userId);
  if (!hasAccess) {
    return errorResponse(
      "NO_GOOGLE_ACCESS",
      "Google Calendar not connected. Connect your Google account in Settings.",
      403
    );
  }

  const searchParams = req.nextUrl.searchParams;
  const { timeMin, timeMax, maxResults } = querySchema.parse({
    timeMin: searchParams.get("timeMin") ?? undefined,
    timeMax: searchParams.get("timeMax") ?? undefined,
    maxResults: searchParams.get("maxResults") ?? 30,
  });

  // Default: show events from start of current week to end of current week
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday
  startOfWeek.setHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);
  endOfWeek.setHours(23, 59, 59, 999);

  const events = await listEvents(userId, {
    timeMin: timeMin || startOfWeek.toISOString(),
    timeMax: timeMax || endOfWeek.toISOString(),
    maxResults,
  });

  return successResponse(events);
});

// ── POST /api/calendar/events ───────────────────────────────────────

/**
 * Create a new Google Calendar event.
 * Optionally adds a Google Meet link and invites attendees.
 */
export const POST = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "calendar");
  const userId = await getUserIdFromRequest(req);

  const hasAccess = await hasGoogleAccess(userId);
  if (!hasAccess) {
    return errorResponse(
      "NO_GOOGLE_ACCESS",
      "Google Calendar not connected. Connect your Google account in Settings.",
      403
    );
  }

  const body = createEventSchema.parse(await req.json());

  // Resolve Yoodle user IDs to email addresses server-side (privacy-preserving)
  let resolvedAttendees = body.attendees || [];
  if (body.attendeeUserIds?.length) {
    await connectDB();
    const users = await User.find({ _id: { $in: body.attendeeUserIds } })
      .select("email")
      .lean();
    const userEmails = users
      .map((u) => u.email)
      .filter((e): e is string => Boolean(e));
    resolvedAttendees = [...new Set([...resolvedAttendees, ...userEmails])];
  }

  const event = await createEvent(userId, {
    title: body.title,
    description: body.description,
    start: body.start,
    end: body.end,
    location: body.location,
    attendees: resolvedAttendees.length > 0 ? resolvedAttendees : undefined,
    addMeetLink: body.addMeetLink,
    timeZone: body.timeZone,
  });

  return successResponse(event, 201);
});

// ── PATCH /api/calendar/events?eventId=xxx ──────────────────────────

/**
 * Update an existing Google Calendar event.
 */
export const PATCH = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "calendar");
  const userId = await getUserIdFromRequest(req);

  const hasAccess = await hasGoogleAccess(userId);
  if (!hasAccess) {
    return errorResponse(
      "NO_GOOGLE_ACCESS",
      "Google Calendar not connected. Connect your Google account in Settings.",
      403
    );
  }

  const body = updateEventSchema.parse(await req.json());
  const { eventId, ...updates } = body;

  const event = await updateEvent(userId, eventId, updates);

  return successResponse(event);
});

// ── DELETE /api/calendar/events?eventId=xxx ──────────────────────────

/**
 * Delete a Google Calendar event.
 */
export const DELETE = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "calendar");
  const userId = await getUserIdFromRequest(req);

  const hasAccess = await hasGoogleAccess(userId);
  if (!hasAccess) {
    return errorResponse(
      "NO_GOOGLE_ACCESS",
      "Google Calendar not connected. Connect your Google account in Settings.",
      403
    );
  }

  const eventId = req.nextUrl.searchParams.get("eventId");
  if (!eventId) {
    throw new BadRequestError("eventId query parameter is required.");
  }

  await deleteEvent(userId, eventId);

  return successResponse({ message: "Event deleted." });
});

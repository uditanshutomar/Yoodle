import { NextRequest } from "next/server";
import { z } from "zod";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { BadRequestError, ForbiddenError } from "@/lib/infra/api/errors";
import mongoose from "mongoose";
import { listEvents, createEvent, updateEvent, deleteEvent } from "@/lib/google/calendar";
import { hasGoogleAccess } from "@/lib/google/client";
import connectDB from "@/lib/infra/db/client";
import User from "@/lib/infra/db/models/user";

// ── Validation ──────────────────────────────────────────────────────

const querySchema = z.object({
  timeMin: z.string().datetime().optional(),
  timeMax: z.string().datetime().optional(),
  maxResults: z.coerce.number().int().min(1).max(100).default(30),
});

const createEventSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  start: z.string().datetime({ message: "Invalid start datetime. Use ISO 8601 format." }),
  end: z.string().datetime({ message: "Invalid end datetime. Use ISO 8601 format." }),
  location: z.string().max(500).optional(),
  attendees: z.array(z.string().email()).optional(),
  attendeeUserIds: z.array(
    z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), {
      message: "Invalid user ID format.",
    })
  ).optional(),
  addMeetLink: z.boolean().optional().default(false),
  timeZone: z.string().optional(),
}).refine((data) => new Date(data.end) > new Date(data.start), {
  message: "End time must be after start time.",
  path: ["end"],
});

const updateEventSchema = z.object({
  eventId: z.string().min(1, "Event ID required.").max(200),
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).optional(),
  start: z.string().datetime({ message: "Invalid start datetime." }).optional(),
  end: z.string().datetime({ message: "Invalid end datetime." }).optional(),
  location: z.string().max(500).optional(),
  attendees: z.array(z.string().email()).optional(),
}).refine(
  (data) => !data.start || !data.end || new Date(data.end) > new Date(data.start),
  { message: "End time must be after start time.", path: ["end"] },
);

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
    throw new ForbiddenError(
      "Google Calendar not connected. Connect your Google account in Settings.",
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
    throw new ForbiddenError(
      "Google Calendar not connected. Connect your Google account in Settings.",
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
    throw new ForbiddenError(
      "Google Calendar not connected. Connect your Google account in Settings.",
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
    throw new ForbiddenError(
      "Google Calendar not connected. Connect your Google account in Settings.",
    );
  }

  const eventId = req.nextUrl.searchParams.get("eventId");
  if (!eventId) {
    throw new BadRequestError("eventId query parameter is required.");
  }

  await deleteEvent(userId, eventId);

  return successResponse({ message: "Event deleted." });
});

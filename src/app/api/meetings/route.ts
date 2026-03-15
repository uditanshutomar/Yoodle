import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import mongoose from "mongoose";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import connectDB from "@/lib/infra/db/client";
import Meeting from "@/lib/infra/db/models/meeting";
import "@/lib/infra/db/models/user"; // register User schema for .populate("hostId")
import { generateMeetingCode } from "@/lib/utils/id";
import { features } from "@/lib/features/flags";

// ── Validation schemas ──────────────────────────────────────────────

const listMeetingsSchema = z.object({
  status: z.enum(["scheduled", "live", "ended", "cancelled"]).optional(),
  type: z.enum(["regular", "ghost"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const createMeetingSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required.")
    .max(200, "Title must be 200 characters or fewer.")
    .optional(),
  description: z
    .string()
    .max(1000, "Description must be 1000 characters or fewer.")
    .optional(),
  type: z.enum(["regular", "ghost"]).default("regular"),
  scheduledAt: z
    .string()
    .datetime({ message: "scheduledAt must be a valid ISO datetime." })
    .optional(),
  settings: z
    .object({
      maxParticipants: z.number().int().min(1).max(100).optional(),
      allowRecording: z.boolean().optional(),
      allowScreenShare: z.boolean().optional(),
      waitingRoom: z.boolean().optional(),
      muteOnJoin: z.boolean().optional(),
    })
    .optional(),
});

// ── GET /api/meetings ───────────────────────────────────────────────

/**
 * List meetings where the authenticated user is host or participant.
 * Supports filtering by status, type, and pagination via limit/offset.
 */
export const GET = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "meetings");
  const userId = await getUserIdFromRequest(req);

  const searchParams = req.nextUrl.searchParams;
  const { status, type, limit, offset } = listMeetingsSchema.parse({
    status: searchParams.get("status") ?? undefined,
    type: searchParams.get("type") ?? undefined,
    limit: searchParams.get("limit") ?? 20,
    offset: searchParams.get("offset") ?? 0,
  });

  await connectDB();

  // NOTE: Stale meeting cleanup is handled by the background job
  // (meeting-cleanup worker, 4h threshold). Removed inline write from
  // this GET handler to avoid write-in-read side effects and threshold
  // mismatch (was 6h here vs 4h in the background job).

  const userObjectId = new mongoose.Types.ObjectId(userId);

  // Build filter: meetings where user is host OR a participant
  const filter: Record<string, unknown> = {
    $or: [
      { hostId: userObjectId },
      { "participants.userId": userObjectId },
    ],
  };

  if (status) {
    filter.status = status;
  }
  if (type) {
    filter.type = type;
  }

  const meetings = await Meeting.find(filter)
    .sort({ scheduledAt: -1, createdAt: -1 })
    .skip(offset)
    .limit(limit)
    .populate("hostId", "name email displayName avatarUrl")
    .lean();

  return successResponse(meetings);
});

// ── POST /api/meetings ──────────────────────────────────────────────

/**
 * Create a new meeting.
 * Auto-generates a meeting code and adds the host as the first participant.
 */
export const POST = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "meetings");
  const userId = await getUserIdFromRequest(req);

  const body = createMeetingSchema.parse(await req.json());
  const { title, description, type, scheduledAt, settings } = body;

  // Enforce max participants from feature flags
  if (settings?.maxParticipants && settings.maxParticipants > features.maxParticipantsPerRoom) {
    return NextResponse.json(
      { success: false, error: { code: "PARTICIPANT_LIMIT", message: `Maximum ${features.maxParticipantsPerRoom} participants allowed on ${features.edition} edition` } },
      { status: 400 }
    );
  }

  await connectDB();

  const code = generateMeetingCode();

  const meeting = await Meeting.create({
    code,
    title: title || "Untitled Meeting",
    description: description || undefined,
    hostId: new mongoose.Types.ObjectId(userId),
    type,
    status: "scheduled",
    scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
    participants: [
      {
        userId: new mongoose.Types.ObjectId(userId),
        role: "host",
        status: "joined",
        joinedAt: new Date(),
      },
    ],
    settings: settings
      ? {
          maxParticipants: settings.maxParticipants ?? 25,
          allowRecording: settings.allowRecording ?? true,
          allowScreenShare: settings.allowScreenShare ?? true,
          waitingRoom: settings.waitingRoom ?? false,
          muteOnJoin: settings.muteOnJoin ?? false,
        }
      : undefined,
  });

  // Populate host info before returning
  await meeting.populate("hostId", "name email displayName avatarUrl");

  return successResponse(meeting, 201);
});

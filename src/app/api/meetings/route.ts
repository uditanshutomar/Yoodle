import { NextRequest } from "next/server";
import { z } from "zod";
import mongoose from "mongoose";
import connectDB from "@/lib/db/client";
import Meeting from "@/lib/db/models/meeting";
import { authenticateRequest } from "@/lib/auth/middleware";
import { generateMeetingCode } from "@/lib/utils/id";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
  serverErrorResponse,
} from "@/lib/utils/api-response";

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
export async function GET(request: NextRequest) {
  try {
    let userId: string;

    try {
      const payload = await authenticateRequest(request);
      userId = payload.userId;
    } catch {
      return unauthorizedResponse();
    }

    const searchParams = request.nextUrl.searchParams;
    const parsed = listMeetingsSchema.safeParse({
      status: searchParams.get("status") ?? undefined,
      type: searchParams.get("type") ?? undefined,
      limit: searchParams.get("limit") ?? 20,
      offset: searchParams.get("offset") ?? 0,
    });

    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path.join(".");
        if (!fieldErrors[path]) {
          fieldErrors[path] = [];
        }
        fieldErrors[path].push(issue.message);
      }
      return errorResponse({
        message: "Validation failed.",
        status: 400,
        errors: fieldErrors,
      });
    }

    const { status, type, limit, offset } = parsed.data;

    await connectDB();

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
  } catch (error) {
    console.error("[Meetings GET Error]", error);
    return serverErrorResponse("Failed to retrieve meetings.");
  }
}

// ── POST /api/meetings ──────────────────────────────────────────────

/**
 * Create a new meeting.
 * Auto-generates a meeting code and adds the host as the first participant.
 */
export async function POST(request: NextRequest) {
  try {
    let userId: string;

    try {
      const payload = await authenticateRequest(request);
      userId = payload.userId;
    } catch {
      return unauthorizedResponse();
    }

    const body = await request.json();

    const parsed = createMeetingSchema.safeParse(body);
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path.join(".");
        if (!fieldErrors[path]) {
          fieldErrors[path] = [];
        }
        fieldErrors[path].push(issue.message);
      }
      return errorResponse({
        message: "Validation failed.",
        status: 400,
        errors: fieldErrors,
      });
    }

    const { title, description, type, scheduledAt, settings } = parsed.data;

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
            allowRecording: settings.allowRecording ?? false,
            allowScreenShare: settings.allowScreenShare ?? true,
            waitingRoom: settings.waitingRoom ?? false,
            muteOnJoin: settings.muteOnJoin ?? false,
          }
        : undefined,
    });

    // Populate host info before returning
    await meeting.populate("hostId", "name email displayName avatarUrl");

    return successResponse(meeting, 201);
  } catch (error) {
    console.error("[Meetings POST Error]", error);
    return serverErrorResponse("Failed to create meeting.");
  }
}

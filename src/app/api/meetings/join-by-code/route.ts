import { NextRequest } from "next/server";
import { z } from "zod";
import mongoose from "mongoose";
import connectDB from "@/lib/db/client";
import Meeting from "@/lib/db/models/meeting";
import { authenticateRequest } from "@/lib/auth/middleware";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
  notFoundResponse,
  serverErrorResponse,
} from "@/lib/utils/api-response";

// ── Validation ──────────────────────────────────────────────────────

const joinByCodeSchema = z.object({
  code: z
    .string()
    .regex(
      /^yoo-[a-z0-9]{3}-[a-z0-9]{3}$/,
      'Meeting code must follow the format "yoo-xxx-xxx".'
    ),
});

// ── Helpers ─────────────────────────────────────────────────────────

function getIceServers() {
  const servers: Record<string, unknown>[] = [
    {
      urls: [
        "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302",
      ],
    },
  ];

  if (process.env.TURN_SERVER_URL) {
    servers.push({
      urls: process.env.TURN_SERVER_URL,
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL,
    });
  }

  return servers;
}

// ── POST /api/meetings/join-by-code ─────────────────────────────────

/**
 * Join a meeting using a meeting code (yoo-xxx-xxx).
 * Same join logic as the /api/meetings/:meetingId/join route.
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

    const parsed = joinByCodeSchema.safeParse(body);
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

    const { code } = parsed.data;

    await connectDB();

    const meeting = await Meeting.findOne({ code: code.toLowerCase() });

    if (!meeting) {
      return notFoundResponse("No meeting found with that code.");
    }

    // Cannot join ended or cancelled meetings
    if (meeting.status === "ended" || meeting.status === "cancelled") {
      return errorResponse({
        message: "This meeting has already ended.",
        status: 400,
      });
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);

    // Check if user is already a participant
    const existingParticipant = meeting.participants.find(
      (p) => p.userId.toString() === userId
    );

    if (existingParticipant) {
      if (existingParticipant.status === "joined") {
        // Already joined, return meeting + ICE servers
        await meeting.populate("hostId", "name email displayName avatarUrl");
        await meeting.populate("participants.userId", "name email displayName avatarUrl");

        return successResponse({
          meeting,
          iceServers: getIceServers(),
        });
      }

      // Rejoin: user was previously invited or left
      existingParticipant.status = "joined";
      existingParticipant.joinedAt = new Date();
      existingParticipant.leftAt = undefined;
    } else {
      // Check maxParticipants limit
      const activeParticipants = meeting.participants.filter(
        (p) => p.status === "joined"
      ).length;

      if (activeParticipants >= meeting.settings.maxParticipants) {
        return errorResponse({
          message: "Meeting has reached the maximum number of participants.",
          status: 400,
        });
      }

      // Add as new participant
      meeting.participants.push({
        userId: userObjectId,
        role: "participant",
        status: "joined",
        joinedAt: new Date(),
      });
    }

    // Activate meeting if it's scheduled
    if (meeting.status === "scheduled") {
      meeting.status = "live";
      meeting.startedAt = new Date();
    }

    await meeting.save();

    // Populate for response
    await meeting.populate("hostId", "name email displayName avatarUrl");
    await meeting.populate("participants.userId", "name email displayName avatarUrl");

    return successResponse({
      meeting,
      iceServers: getIceServers(),
    });
  } catch (error) {
    console.error("[Join By Code Error]", error);
    return serverErrorResponse("Failed to join meeting.");
  }
}

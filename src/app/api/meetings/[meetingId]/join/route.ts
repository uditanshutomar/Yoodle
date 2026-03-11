import { NextRequest } from "next/server";
import { z } from "zod";
import mongoose from "mongoose";
import { withHandler } from "@/lib/api/with-handler";
import { successResponse } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/auth/middleware";
import { BadRequestError, NotFoundError } from "@/lib/api/errors";
import connectDB from "@/lib/db/client";
import Meeting from "@/lib/db/models/meeting";
import { determineTransportMode } from "@/lib/transport/transport-factory";

// ── Helpers ─────────────────────────────────────────────────────────

const MEETING_CODE_REGEX = /^yoo-[a-z0-9]{3}-[a-z0-9]{3}$/;

function buildMeetingFilter(meetingId: string): Record<string, unknown> {
  if (mongoose.Types.ObjectId.isValid(meetingId) && !MEETING_CODE_REGEX.test(meetingId)) {
    return { _id: new mongoose.Types.ObjectId(meetingId) };
  }
  return { code: meetingId.toLowerCase() };
}

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

function getTransportMode(meeting: {
  transportMode?: string;
  participants: { status: string }[];
}): "p2p" | "livekit" {
  if (meeting.transportMode === "p2p" || meeting.transportMode === "livekit") {
    return meeting.transportMode;
  }
  // Use actual joined participant count, not the meeting's max capacity
  const joinedCount = meeting.participants.filter(
    (p) => p.status === "joined",
  ).length;
  return determineTransportMode(joinedCount);
}

// ── Validation ──────────────────────────────────────────────────────

const meetingIdSchema = z.string().min(1, "Meeting ID is required");

// ── POST /api/meetings/:meetingId/join ──────────────────────────────

/**
 * Join a meeting by ObjectId or meeting code.
 *
 * Uses atomic MongoDB operations to prevent race conditions:
 * - Duplicate participant entries are avoided via filter guards.
 * - The maxParticipants limit is enforced inside the query filter
 *   so two concurrent joins cannot both exceed the cap.
 */
export const POST = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "meetings");
  const userId = await getUserIdFromRequest(req);

  const { meetingId } = await context!.params;
  meetingIdSchema.parse(meetingId);

  await connectDB();

  const filter = buildMeetingFilter(meetingId);
  const userObjectId = new mongoose.Types.ObjectId(userId);

  // ── 1. Already joined? Return meeting data (no mutation). ───────
  const alreadyJoined = await Meeting.findOne({
    ...filter,
    participants: { $elemMatch: { userId: userObjectId, status: "joined" } },
  })
    .populate("hostId", "name email displayName avatarUrl")
    .populate("participants.userId", "name email displayName avatarUrl");

  if (alreadyJoined) {
    return successResponse({
      meeting: alreadyJoined,
      iceServers: getIceServers(),
      transportMode: getTransportMode(alreadyJoined),
    });
  }

  // ── 2. Rejoin (participant exists with status left/invited). ────
  const rejoined = await Meeting.findOneAndUpdate(
    {
      ...filter,
      status: { $nin: ["ended", "cancelled"] },
      participants: {
        $elemMatch: { userId: userObjectId, status: { $ne: "joined" } },
      },
    },
    {
      $set: {
        "participants.$.status": "joined",
        "participants.$.joinedAt": new Date(),
      },
      $unset: { "participants.$.leftAt": "" },
    },
    { new: true },
  );

  if (rejoined) {
    // Activate meeting if still scheduled (atomic, idempotent)
    if (rejoined.status === "scheduled") {
      await Meeting.updateOne(
        { _id: rejoined._id, status: "scheduled" },
        { $set: { status: "live", startedAt: new Date() } },
      );
    }

    const updated = await Meeting.findById(rejoined._id)
      .populate("hostId", "name email displayName avatarUrl")
      .populate("participants.userId", "name email displayName avatarUrl");

    return successResponse({
      meeting: updated,
      iceServers: getIceServers(),
      transportMode: getTransportMode(updated!),
    });
  }

  // ── 3. New participant — atomic push with capacity guard. ───────
  //
  // The $expr filter counts *currently joined* participants and only
  // allows the push when the count is below maxParticipants. Because
  // the filter and update are a single atomic operation, two concurrent
  // requests cannot both see a count of N-1 and both succeed.
  const joined = await Meeting.findOneAndUpdate(
    {
      ...filter,
      status: { $nin: ["ended", "cancelled"] },
      "participants.userId": { $ne: userObjectId },
      $expr: {
        $lt: [
          {
            $size: {
              $filter: {
                input: "$participants",
                as: "p",
                cond: { $eq: ["$$p.status", "joined"] },
              },
            },
          },
          "$settings.maxParticipants",
        ],
      },
    },
    {
      $push: {
        participants: {
          userId: userObjectId,
          role: "participant",
          status: "joined",
          joinedAt: new Date(),
        },
      },
    },
    { new: true },
  );

  if (!joined) {
    // Determine the reason for failure so we return an accurate error
    const meeting = await Meeting.findOne(filter);
    if (!meeting) {
      throw new NotFoundError("Meeting not found.");
    }
    if (meeting.status === "ended" || meeting.status === "cancelled") {
      throw new BadRequestError("This meeting has already ended.");
    }
    throw new BadRequestError(
      "Meeting has reached the maximum number of participants.",
    );
  }

  // Activate meeting if still scheduled (atomic, idempotent)
  if (joined.status === "scheduled") {
    await Meeting.updateOne(
      { _id: joined._id, status: "scheduled" },
      { $set: { status: "live", startedAt: new Date() } },
    );
  }

  const populated = await Meeting.findById(joined._id)
    .populate("hostId", "name email displayName avatarUrl")
    .populate("participants.userId", "name email displayName avatarUrl");

  return successResponse({
    meeting: populated,
    iceServers: getIceServers(),
    transportMode: getTransportMode(populated!),
  });
});

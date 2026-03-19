import { NextRequest } from "next/server";
import { z } from "zod";
import mongoose from "mongoose";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { BadRequestError, NotFoundError } from "@/lib/infra/api/errors";
import connectDB from "@/lib/infra/db/client";
import Meeting from "@/lib/infra/db/models/meeting";
import { getQueue, QUEUE_NAMES } from "@/lib/infra/jobs/queue";
import type { PostMeetingCascadePayload } from "@/lib/infra/jobs/types";
import { createLogger } from "@/lib/infra/logger";
import { buildMeetingFilter } from "@/lib/meetings/helpers";

const log = createLogger("meetings:leave");

// ── Validation ──────────────────────────────────────────────────────

const meetingIdSchema = z.string().min(1, "Meeting ID is required");

// ── POST /api/meetings/:meetingId/leave ─────────────────────────────

/**
 * Leave a meeting.
 *
 * Atomically updates the participant status to "left" using
 * findOneAndUpdate so concurrent leave requests cannot conflict.
 * If the host leaves and no other participants remain, ends the meeting.
 */
export const POST = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "meetings");
  const userId = await getUserIdFromRequest(req);

  const { meetingId } = await context!.params;
  meetingIdSchema.parse(meetingId);

  await connectDB();

  const filter = buildMeetingFilter(meetingId);
  const userObjectId = new mongoose.Types.ObjectId(userId);

  // ── Atomically mark participant as "left" ─────────────────────────
  const result = await Meeting.findOneAndUpdate(
    {
      ...filter,
      participants: {
        $elemMatch: { userId: userObjectId, status: "joined" },
      },
    },
    {
      $set: {
        "participants.$.status": "left",
        "participants.$.leftAt": new Date(),
      },
    },
    { new: true },
  ).select("-ghostMessages -ghostNotes");

  if (!result) {
    // Determine the reason for failure
    const meeting = await Meeting.findOne(filter).select("participants").lean();
    if (!meeting) {
      throw new NotFoundError("Meeting not found.");
    }
    const participant = meeting.participants.find(
      (p) => p.userId.toString() === userId,
    );
    if (!participant) {
      throw new BadRequestError("You are not a participant in this meeting.");
    }
    if (participant.status === "left") {
      throw new BadRequestError("You have already left this meeting.");
    }
    throw new BadRequestError("Cannot leave this meeting.");
  }

  // ── Host succession or end meeting ──────────────────────────────────
  const isHost = result.hostId.toString() === userId;
  const remainingParticipants = result.participants.filter(
    (p) => p.userId.toString() !== userId && p.status === "joined",
  );

  if (remainingParticipants.length === 0) {
    // Nobody left — end the meeting regardless of who left
    const endedAt = new Date();

    // End the meeting and mark any remaining non-"left" participants
    // (e.g. participants who crashed and never called /leave) as "left"
    const endResult = await Meeting.updateOne(
      { _id: result._id, status: { $nin: ["ended", "cancelled"] } },
      {
        $set: {
          status: "ended",
          endedAt,
          "participants.$[stale].status": "left",
          "participants.$[stale].leftAt": endedAt,
        },
      },
      {
        arrayFilters: [{ "stale.status": { $ne: "left" } }],
      },
    );

    // Only run post-meeting cascade if we actually ended the meeting
    // (another request may have ended it concurrently)
    const hostIdStr = result.hostId.toString();
    if (endResult.modifiedCount === 0) {
      log.info({ meetingId: result._id.toString() }, "meeting already ended by another request, skipping cascade");
    } else {

    // Enqueue durable post-meeting cascade (calendar end-time sync, system
    // message, MoM, action items, calendar update). Previously a fire-and-forget
    // IIFE — now survives crashes and retries on failure.
    try {
      const payload: PostMeetingCascadePayload = {
        meetingId: result._id.toString(),
        hostId: hostIdStr,
        endedAt: endedAt.toISOString(),
      };

      await getQueue(QUEUE_NAMES.POST_MEETING_CASCADE).add(
        "post-meeting-cascade",
        payload,
        { jobId: `cascade-${result._id.toString()}` },
      );
      log.info({ meetingId: result._id.toString() }, "post-meeting cascade job enqueued");
    } catch (err) {
      // Queue unavailable (no Redis) — log but don't fail the leave request
      log.error({ err, meetingId: result._id.toString() }, "failed to enqueue post-meeting cascade");
    }

    } // end else (endResult.modifiedCount > 0)
  } else if (isHost && remainingParticipants.length > 0) {
    // Host left but others remain — transfer host to the earliest-joined participant
    const newHost = remainingParticipants.sort(
      (a, b) => (a.joinedAt?.getTime() ?? 0) - (b.joinedAt?.getTime() ?? 0),
    )[0];

    if (newHost) {
      await Meeting.updateOne(
        { _id: result._id },
        {
          $set: {
            hostId: newHost.userId,
            "participants.$[newHostFilter].role": "host",
          },
        },
        {
          arrayFilters: [{ "newHostFilter.userId": newHost.userId }],
        },
      );

      log.info(
        { meetingId: result._id.toString(), newHostId: newHost.userId.toString() },
        "host transferred after original host left",
      );
    }
  }

  // Fetch final state with populated fields
  const populated = await Meeting.findById(result._id)
    .populate("hostId", "name displayName avatarUrl")
    .populate("participants.userId", "name displayName avatarUrl")
    .lean();

  if (!populated) {
    throw new NotFoundError("Meeting was removed after leave.");
  }

  return successResponse({ meeting: populated });
});

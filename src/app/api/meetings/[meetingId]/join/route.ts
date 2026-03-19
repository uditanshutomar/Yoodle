import { NextRequest } from "next/server";
import { z } from "zod";
import mongoose from "mongoose";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { AppError, BadRequestError, NotFoundError } from "@/lib/infra/api/errors";
import connectDB from "@/lib/infra/db/client";
import Meeting from "@/lib/infra/db/models/meeting";
import User from "@/lib/infra/db/models/user"; // also registers schema for .populate("hostId")
import { waitingConsumeAdmission, waitingAddToQueue } from "@/lib/infra/redis/cache";
import Conversation from "@/lib/infra/db/models/conversation";
import DirectMessage from "@/lib/infra/db/models/direct-message";
import { getRedisClient } from "@/lib/infra/redis/client";
import { createLogger } from "@/lib/infra/logger";
import { buildMeetingFilter } from "@/lib/meetings/helpers";

const chatLog = createLogger("meetings:chat-link");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureMeetingConversation(meetingId: string, meeting: any) {
  try {
    const participants = meeting.participants
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((p: any) => p.status === "joined" || p.status === "invited")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((p: any) => {
        const uid = p.userId?._id || p.userId;
        return {
          userId: uid instanceof mongoose.Types.ObjectId ? uid : new mongoose.Types.ObjectId(uid.toString()),
          role: uid.toString() === (meeting.hostId?._id || meeting.hostId).toString() ? "admin" as const : "member" as const,
          agentEnabled: false,
          muted: false,
        };
      });

    if (participants.length < 2) return;

    const hostId = meeting.hostId?._id || meeting.hostId;

    // Atomically find-or-create the conversation. Use includeResultMetadata
    // so we can tell whether a new document was inserted (avoids TOCTOU race
    // where two concurrent callers both think the conversation is new).
    const result = await Conversation.findOneAndUpdate(
      { meetingId: new mongoose.Types.ObjectId(meetingId) },
      {
        $setOnInsert: {
          type: "group",
          name: `Meeting: ${(meeting.title as string) || (meeting.code as string)}`,
          participants: participants,
          createdBy: hostId,
        },
      },
      { upsert: true, new: true, includeResultMetadata: true },
    );

    const conv = result.value;
    const wasNewlyCreated = !result.lastErrorObject?.updatedExisting;

    // Only post the "Meeting started" system message when the conversation is newly created
    if (wasNewlyCreated && conv) {
      const msg = await DirectMessage.create({
        conversationId: conv._id,
        senderId: hostId,
        senderType: "user",
        content: "Meeting started — this group chat was created automatically.",
        type: "system",
      });

      await Conversation.updateOne(
        { _id: conv._id },
        {
          $set: {
            lastMessageAt: msg.createdAt,
            lastMessagePreview: msg.content,
            lastMessageSenderId: msg.senderId,
          },
        },
      );

      try {
        const redis = getRedisClient();
        await redis.publish(`chat:${conv._id}`, JSON.stringify({ type: "message", data: msg }));
      } catch (err) { chatLog.warn({ err }, "Redis publish failed"); }
    }
  } catch (err) {
    chatLog.warn({ err, meetingId }, "failed to create meeting conversation");
  }
}

function getHostUserId(meeting: { hostId: unknown }): string {
  const hostId = meeting.hostId as
    | string
    | mongoose.Types.ObjectId
    | { _id?: string | mongoose.Types.ObjectId };

  if (typeof hostId === "string") return hostId;
  if (hostId instanceof mongoose.Types.ObjectId) return hostId.toString();
  if (hostId && typeof hostId === "object" && hostId._id) {
    return hostId._id.toString();
  }

  chatLog.error({ hostId: typeof hostId === 'object' ? JSON.stringify(hostId) : String(hostId) }, "Unable to resolve hostId to string");
  throw new Error("Unable to resolve meeting host ID");
}

function buildRoomSession(
  meeting: {
    hostId: unknown;
    settings?: {
      waitingRoom?: boolean;
      allowRecording?: boolean;
      allowScreenShare?: boolean;
      muteOnJoin?: boolean;
    };
  },
  meetingId: string,
  preferences: {
    audioEnabled: boolean;
    videoEnabled: boolean;
    audioDeviceId?: string;
    videoDeviceId?: string;
  },
  joinDisposition: "joined" | "waiting",
) {
  const muteOnJoin = meeting.settings?.muteOnJoin ?? false;

  return {
    roomId: meetingId,
    hostUserId: getHostUserId(meeting),
    transportMode: "livekit" as const,
    joinDisposition,
    waitingRoomEnabled: meeting.settings?.waitingRoom ?? false,
    media: {
      audioEnabled: muteOnJoin ? false : preferences.audioEnabled,
      videoEnabled: preferences.videoEnabled,
      audioDeviceId: preferences.audioDeviceId,
      videoDeviceId: preferences.videoDeviceId,
    },
    permissions: {
      allowRecording: meeting.settings?.allowRecording ?? false,
      allowScreenShare: meeting.settings?.allowScreenShare ?? true,
    },
  };
}

// ── Validation ──────────────────────────────────────────────────────

const meetingIdSchema = z.string().min(1, "Meeting ID is required");
const joinPreferencesSchema = z.object({
  audioEnabled: z.boolean().optional(),
  videoEnabled: z.boolean().optional(),
  audioDeviceId: z.string().optional(),
  videoDeviceId: z.string().optional(),
});

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

  const parsedPreferences = joinPreferencesSchema.parse(
    await req.json().catch(() => ({})),
  );
  const preferences = {
    audioEnabled: parsedPreferences.audioEnabled ?? true,
    videoEnabled: parsedPreferences.videoEnabled ?? true,
    audioDeviceId: parsedPreferences.audioDeviceId,
    videoDeviceId: parsedPreferences.videoDeviceId,
  };

  await connectDB();

  const filter = buildMeetingFilter(meetingId);
  const userObjectId = new mongoose.Types.ObjectId(userId);

  // ── 1. Already joined? Return meeting data (no mutation). ───────
  const alreadyJoined = await Meeting.findOne({
    ...filter,
    participants: { $elemMatch: { userId: userObjectId, status: "joined" } },
  })
    .populate("hostId", "name displayName avatarUrl")
    .populate("participants.userId", "name displayName avatarUrl")
    .lean();

  if (alreadyJoined) {
    // Fire-and-forget: ensure meeting conversation exists
    ensureMeetingConversation(alreadyJoined._id.toString(), alreadyJoined).catch((err) => chatLog.warn({ err }, "ensureMeetingConversation failed"));

    return successResponse({
      meeting: alreadyJoined,
      roomSession: buildRoomSession(
        alreadyJoined,
        alreadyJoined._id.toString(),
        preferences,
        "joined",
      ),
    });
  }

  const meetingForAccess = await Meeting.findOne(filter)
    .select("hostId settings status participants -ghostMessages -ghostNotes")
    .lean();
  if (!meetingForAccess) {
    throw new NotFoundError("Meeting not found.");
  }

  if (
    (meetingForAccess.status === "ended" || meetingForAccess.status === "cancelled")
  ) {
    throw new BadRequestError("This meeting has already ended.");
  }

  const isHost = getHostUserId(meetingForAccess) === userId;
  const admissionGranted = await waitingConsumeAdmission(
    meetingForAccess._id.toString(),
    userId,
  );

  if (meetingForAccess.settings?.waitingRoom && !isHost && !admissionGranted) {
    // Add the user to the waiting room queue so the host can see them
    const userDoc = await User.findById(userId)
      .select("name displayName avatarUrl")
      .lean();
    const queued = await waitingAddToQueue(
      meetingForAccess._id.toString(),
      userId,
      {
        name: userDoc?.name ?? "Unknown",
        displayName: userDoc?.displayName ?? userDoc?.name ?? "Unknown",
        avatar: userDoc?.avatarUrl ?? null,
      },
    );

    if (!queued) {
      throw new AppError("Unable to join waiting room — please try again.", "REDIS_ERROR", 503);
    }

    return successResponse({
      joinDisposition: "waiting" as const,
      roomSession: buildRoomSession(
        meetingForAccess,
        meetingForAccess._id.toString(),
        preferences,
        "waiting",
      ),
    });
  }

  // ── 2. Rejoin (participant exists with status left/invited). ────
  // Include $expr capacity guard so rejoins also respect maxParticipants.
  const rejoined = await Meeting.findOneAndUpdate(
    {
      ...filter,
      status: { $nin: ["ended", "cancelled"] },
      participants: {
        $elemMatch: { userId: userObjectId, status: { $ne: "joined" } },
      },
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
      .populate("hostId", "name displayName avatarUrl")
      .populate("participants.userId", "name displayName avatarUrl")
      .lean();

    if (!updated) {
      throw new NotFoundError("Meeting not found after rejoin.");
    }

    // Fire-and-forget: ensure meeting conversation exists
    ensureMeetingConversation(updated._id.toString(), updated).catch((err) => chatLog.warn({ err }, "ensureMeetingConversation failed"));

    return successResponse({
      meeting: updated,
      roomSession: buildRoomSession(
        updated,
        updated._id.toString(),
        preferences,
        "joined",
      ),
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
    const meeting = await Meeting.findOne(filter).select("status").lean();
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
    .populate("hostId", "name displayName avatarUrl")
    .populate("participants.userId", "name displayName avatarUrl")
    .lean();

  if (!populated) {
    throw new NotFoundError("Meeting not found after join.");
  }

  // Fire-and-forget: ensure meeting conversation exists
  ensureMeetingConversation(populated._id.toString(), populated).catch((err) => chatLog.warn({ err }, "ensureMeetingConversation failed"));

  return successResponse({
    meeting: populated,
    roomSession: buildRoomSession(
      populated,
      populated._id.toString(),
      preferences,
      "joined",
    ),
  });
});

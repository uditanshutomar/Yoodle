import { NextRequest } from "next/server";
import { z } from "zod";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
} from "@/lib/infra/api/errors";
import connectDB from "@/lib/infra/db/client";
import Meeting from "@/lib/infra/db/models/meeting";
import mongoose from "mongoose";
import {
  getLiveKitUrl,
  getLiveKitApiKey,
  getLiveKitApiSecret,
  isLiveKitConfigured,
} from "@/lib/livekit/config";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("api:livekit-token");

// ── Validation schema ─────────────────────────────────────────────

const MEETING_CODE_REGEX = /^yoo-[a-z0-9]{3}-[a-z0-9]{3}$/;

const tokenRequestSchema = z.object({
  roomId: z.string().min(1, "Room ID is required."),
  name: z.string().min(1, "Display name is required."),
});

// ── POST /api/livekit/token ───────────────────────────────────────

/**
 * Generate a LiveKit access token. Accepts both MongoDB ObjectId
 * and meeting codes as roomId. Enforces maxParticipants by checking
 * the active LiveKit room size before issuing a token.
 */
export const POST = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "meetings");
  const userId = await getUserIdFromRequest(req);

  if (!isLiveKitConfigured()) {
    throw new BadRequestError(
      "LiveKit is not configured. Please set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET.",
    );
  }

  const body = tokenRequestSchema.parse(await req.json());
  const { roomId, name } = body;

  // ── Look up meeting by ObjectId OR meeting code ────────────────
  await connectDB();
  const isObjectId =
    mongoose.Types.ObjectId.isValid(roomId) &&
    !MEETING_CODE_REGEX.test(roomId);
  const meeting = isObjectId
    ? await Meeting.findById(roomId).lean()
    : await Meeting.findOne({ code: roomId.toLowerCase() }).lean();

  if (!meeting) {
    throw new NotFoundError("Meeting not found.");
  }

  // ── Verify caller is a participant ─────────────────────────────
  const isParticipant =
    meeting.hostId.toString() === userId ||
    meeting.participants.some(
      (p) => p.userId.toString() === userId && p.status === "joined",
    );

  if (!isParticipant) {
    throw new ForbiddenError("You are not a participant in this meeting.");
  }

  // ── Enforce maxParticipants via LiveKit room API ───────────────
  const maxParticipants = meeting.settings?.maxParticipants || 50;
  const livekitRoomId = meeting._id.toString();

  try {
    const roomService = new RoomServiceClient(
      getLiveKitUrl(),
      getLiveKitApiKey(),
      getLiveKitApiSecret(),
    );
    const rooms = await roomService.listRooms([livekitRoomId]);
    if (rooms.length > 0 && rooms[0].numParticipants >= maxParticipants) {
      throw new ForbiddenError(
        `Meeting is full (${maxParticipants} participants).`,
      );
    }
  } catch (err) {
    // If it's our own ForbiddenError, re-throw
    if (err instanceof ForbiddenError) throw err;
    // Otherwise LiveKit API is unreachable — allow join (fail open for availability)
    log.warn({ err }, "LiveKit RoomService check failed, allowing join");
  }

  // ── Issue token ────────────────────────────────────────────────
  const token = new AccessToken(getLiveKitApiKey(), getLiveKitApiSecret(), {
    identity: userId,
    name,
    ttl: "6h",
  });

  token.addGrant({
    roomJoin: true,
    room: livekitRoomId,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    canUpdateOwnMetadata: true,
  });

  const jwt = await token.toJwt();

  return successResponse({ token: jwt });
});

import { NextRequest } from "next/server";
import { z } from "zod";
import { AccessToken } from "livekit-server-sdk";
import { withHandler } from "@/lib/api/with-handler";
import { successResponse } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/auth/middleware";
import { BadRequestError, NotFoundError, ForbiddenError } from "@/lib/api/errors";
import connectDB from "@/lib/db/client";
import Meeting from "@/lib/db/models/meeting";
import {
  LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET,
  isLiveKitConfigured,
} from "@/lib/livekit/config";

// ── Validation schema ─────────────────────────────────────────────

const tokenRequestSchema = z.object({
  roomId: z.string().min(1, "Room ID is required."),
  name: z.string().min(1, "Display name is required."),
});

// ── POST /api/livekit/token ───────────────────────────────────────

/**
 * Generate a LiveKit access token for a participant to join a room.
 *
 * The token includes grants for joining the specified room with
 * publish and subscribe permissions.
 *
 * The caller must be an authenticated participant in the meeting.
 * Identity is enforced to match the authenticated userId.
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

  // Verify user is a participant in this meeting
  await connectDB();
  const meeting = await Meeting.findById(roomId).lean();
  if (!meeting) {
    throw new NotFoundError("Meeting not found.");
  }

  const isParticipant =
    meeting.hostId.toString() === userId ||
    meeting.participants.some(
      (p) => p.userId.toString() === userId && p.status === "joined"
    );

  if (!isParticipant) {
    throw new ForbiddenError("You are not a participant in this meeting.");
  }

  // Force identity to the authenticated userId — never trust caller-provided identity
  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: userId,
    name,
    ttl: "6h",
  });

  token.addGrant({
    roomJoin: true,
    room: roomId,
    canPublish: true,
    canSubscribe: true,
  });

  const jwt = await token.toJwt();

  return successResponse({ token: jwt });
});

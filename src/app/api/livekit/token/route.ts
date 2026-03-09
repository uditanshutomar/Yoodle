import { NextRequest } from "next/server";
import { z } from "zod";
import { AccessToken } from "livekit-server-sdk";
import { withHandler } from "@/lib/api/with-handler";
import { successResponse } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/auth/middleware";
import { BadRequestError } from "@/lib/api/errors";
import {
  LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET,
  isLiveKitConfigured,
} from "@/lib/livekit/config";

// ── Validation schema ─────────────────────────────────────────────

const tokenRequestSchema = z.object({
  roomId: z.string().min(1, "Room ID is required."),
  identity: z.string().min(1, "Identity is required."),
  name: z.string().min(1, "Display name is required."),
});

// ── POST /api/livekit/token ───────────────────────────────────────

/**
 * Generate a LiveKit access token for a participant to join a room.
 *
 * The token includes grants for joining the specified room with
 * publish and subscribe permissions.
 */
export const POST = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "meetings");
  await getUserIdFromRequest(req);

  if (!isLiveKitConfigured()) {
    throw new BadRequestError(
      "LiveKit is not configured. Please set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET.",
    );
  }

  const body = tokenRequestSchema.parse(await req.json());
  const { roomId, identity, name } = body;

  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity,
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

import { NextRequest } from "next/server";
import { z } from "zod";
import { withHandler } from "@/lib/api/with-handler";
import { successResponse } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/auth/middleware";
import { ephemeralStore } from "@/lib/ghost/ephemeral-store";
import connectDB from "@/lib/db/client";
import User from "@/lib/db/models/user";

// -- Validation ----------------------------------------------------------------

const createGhostRoomSchema = z.object({
  title: z
    .string()
    .min(1, "Title cannot be empty.")
    .max(100, "Title must be 100 characters or fewer.")
    .optional(),
});

// -- GET /api/ghost-rooms ------------------------------------------------------

/**
 * List active ghost rooms that the authenticated user is participating in.
 */
export const GET = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);

  const rooms = await ephemeralStore.getRoomsForUser(userId);

  return successResponse(rooms);
});

// -- POST /api/ghost-rooms -----------------------------------------------------

/**
 * Create a new ghost room. The authenticated user becomes the host.
 */
export const POST = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // Empty body is fine -- title is optional
  }

  const parsed = createGhostRoomSchema.parse(body);
  const { title } = parsed;

  // Look up the user's real name to use in ghost room
  await connectDB();
  const user = await User.findById(userId).select("name displayName").lean();
  const hostName = user?.displayName || user?.name || "Unknown";

  const room = await ephemeralStore.createRoom(userId, hostName, title);

  // Serialise the Map for the JSON response
  const participantsArray = Array.from(room.participants.values());

  return successResponse(
    {
      roomId: room.roomId,
      code: room.code,
      title: room.title,
      hostId: room.hostId,
      createdAt: room.createdAt,
      expiresAt: room.expiresAt,
      participantCount: participantsArray.length,
      participants: participantsArray,
    },
    201
  );
});

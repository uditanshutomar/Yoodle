import { NextRequest } from "next/server";
import { z } from "zod";
import { authenticateRequest } from "@/lib/auth/middleware";
import { ephemeralStore } from "@/lib/ghost/ephemeral-store";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
  serverErrorResponse,
} from "@/lib/utils/api-response";

// ── Validation ────────────────────────────────────────────────────────

const createGhostRoomSchema = z.object({
  title: z
    .string()
    .min(1, "Title cannot be empty.")
    .max(100, "Title must be 100 characters or fewer.")
    .optional(),
});

// ── GET /api/ghost-rooms ──────────────────────────────────────────────

/**
 * List active ghost rooms that the authenticated user is participating in.
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

    const rooms = await ephemeralStore.getRoomsForUser(userId);

    return successResponse(rooms);
  } catch (error) {
    console.error("[Ghost Rooms GET Error]", error);
    return serverErrorResponse("Failed to retrieve ghost rooms.");
  }
}

// ── POST /api/ghost-rooms ─────────────────────────────────────────────

/**
 * Create a new ghost room. The authenticated user becomes the host.
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

    let body: Record<string, unknown> = {};
    try {
      body = await request.json();
    } catch {
      // Empty body is fine — title is optional
    }

    const parsed = createGhostRoomSchema.safeParse(body);
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

    const { title } = parsed.data;

    const room = await ephemeralStore.createRoom(userId, userId, title);

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
  } catch (error) {
    console.error("[Ghost Rooms POST Error]", error);
    return serverErrorResponse("Failed to create ghost room.");
  }
}

import { NextRequest } from "next/server";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { AppError, NotFoundError } from "@/lib/infra/api/errors";
import connectDB from "@/lib/infra/db/client";
import Meeting from "@/lib/infra/db/models/meeting";
import {
  waitingCheckStatus,
  waitingGetQueue,
} from "@/lib/infra/redis/cache";
import { buildMeetingFilter } from "@/lib/meetings/helpers";

/**
 * GET /api/meetings/[meetingId]/waiting-status
 *
 * Dual-purpose endpoint:
 *
 * 1. **Joiner** — passes `?userId=X` to check their own admission status.
 *    Returns `{ status: "waiting" | "admitted" | "denied" }`.
 *
 * 2. **Host** — no userId param. Returns the list of users currently in
 *    the waiting room queue so the host UI can render admit/deny buttons.
 *    Returns `{ users: WaitingUser[] }`.
 */
export const GET = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "meetings");
  const authenticatedUserId = await getUserIdFromRequest(req);
  const { meetingId } = await context!.params;

  await connectDB();

  // Resolve meeting to get the canonical _id
  const filter = buildMeetingFilter(meetingId);

  const meeting = await Meeting.findOne(filter).select("_id hostId").lean();
  if (!meeting) throw new NotFoundError("Meeting not found.");

  const roomId = meeting._id.toString();

  // ── Joiner mode: check own admission status ─────────────────────
  // Use the authenticated user's ID — not a query param — to prevent IDOR.
  // The `?mode=check` param signals "check my own status" without leaking
  // the ability to query arbitrary user IDs.
  const mode = req.nextUrl.searchParams.get("mode");
  if (mode === "check") {
    const status = await waitingCheckStatus(roomId, authenticatedUserId);
    if (status === "unknown") {
      throw new AppError("Unable to check waiting room status — please try again.", "REDIS_ERROR", 503);
    }
    return successResponse({ status });
  }

  // Legacy support: if ?userId is passed, only allow checking your own status
  const queryUserId = req.nextUrl.searchParams.get("userId");
  if (queryUserId) {
    if (queryUserId !== authenticatedUserId) {
      throw new NotFoundError("Meeting not found."); // Don't reveal IDOR attempt
    }
    const status = await waitingCheckStatus(roomId, authenticatedUserId);
    if (status === "unknown") {
      throw new AppError("Unable to check waiting room status — please try again.", "REDIS_ERROR", 503);
    }
    return successResponse({ status });
  }

  // ── Host mode: return waiting room queue ────────────────────────
  const hostId = (meeting as unknown as { hostId: { toString(): string } }).hostId.toString();
  if (hostId !== authenticatedUserId) {
    throw new NotFoundError("Meeting not found."); // Only host can see the queue
  }
  const users = await waitingGetQueue(roomId);
  if (users === null) {
    throw new AppError("Unable to load waiting room — please try again.", "REDIS_ERROR", 503);
  }
  return successResponse({ users });
});

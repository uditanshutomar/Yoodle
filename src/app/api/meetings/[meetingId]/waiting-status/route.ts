import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { NotFoundError } from "@/lib/infra/api/errors";
import connectDB from "@/lib/infra/db/client";
import Meeting from "@/lib/infra/db/models/meeting";
import {
  waitingCheckStatus,
  waitingGetQueue,
} from "@/lib/infra/redis/cache";

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
  await getUserIdFromRequest(req); // auth check
  const { meetingId } = await context!.params;

  await connectDB();

  // Resolve meeting to get the canonical _id
  const MEETING_CODE_REGEX = /^yoo-[a-z0-9]{3}-[a-z0-9]{3}$/;
  const filter = mongoose.Types.ObjectId.isValid(meetingId) && !MEETING_CODE_REGEX.test(meetingId)
    ? { _id: new mongoose.Types.ObjectId(meetingId) }
    : { code: meetingId.toLowerCase() };

  const meeting = await Meeting.findOne(filter).select("_id hostId").lean();
  if (!meeting) throw new NotFoundError("Meeting not found.");

  const roomId = meeting._id.toString();

  // ── Joiner mode: check own admission status ─────────────────────
  const queryUserId = req.nextUrl.searchParams.get("userId");
  if (queryUserId) {
    const status = await waitingCheckStatus(roomId, queryUserId);
    return successResponse({ status });
  }

  // ── Host mode: return waiting room queue ────────────────────────
  const users = await waitingGetQueue(roomId);
  return successResponse({ users });
});

import { NextRequest } from "next/server";
import { z } from "zod";
import mongoose from "mongoose";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { NotFoundError, BadRequestError } from "@/lib/infra/api/errors";
import connectDB from "@/lib/infra/db/client";
import Meeting from "@/lib/infra/db/models/meeting";
import { createLogger } from "@/lib/infra/logger";
import { buildMeetingFilter } from "@/lib/meetings/helpers";

const log = createLogger("meetings:transfer-host");

// ── Validation ──────────────────────────────────────────────────────

const transferSchema = z.object({
  newHostUserId: z.string().min(1, "New host user ID is required").refine(
    (val) => mongoose.Types.ObjectId.isValid(val),
    { message: "Invalid user ID format." }
  ),
});

// ── POST /api/meetings/:meetingId/transfer-host ─────────────────────

/**
 * Transfer host role to another participant in the meeting.
 * Only the current host can transfer.
 */
export const POST = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "meetings");
  const userId = await getUserIdFromRequest(req);

  const { meetingId } = await context!.params;
  const body = transferSchema.parse(await req.json());

  await connectDB();

  const filter = buildMeetingFilter(meetingId);

  // Can't transfer to yourself
  if (body.newHostUserId === userId) {
    throw new BadRequestError("You are already the host.");
  }

  // Atomic transfer: filter ensures caller is host, meeting is active,
  // and target is a joined participant — prevents TOCTOU races.
  const result = await Meeting.findOneAndUpdate(
    {
      ...filter,
      hostId: new mongoose.Types.ObjectId(userId),
      status: { $nin: ["ended", "cancelled"] },
      participants: {
        $elemMatch: {
          userId: new mongoose.Types.ObjectId(body.newHostUserId),
          status: "joined",
        },
      },
    },
    { $set: { hostId: new mongoose.Types.ObjectId(body.newHostUserId) } },
    { new: true },
  );

  if (!result) {
    // Determine reason for failure
    const meeting = await Meeting.findOne(filter).select("hostId status").lean();
    if (!meeting) throw new NotFoundError("Meeting not found.");
    if (meeting.status === "ended" || meeting.status === "cancelled") {
      throw new BadRequestError("Cannot transfer host in an ended or cancelled meeting.");
    }
    if (meeting.hostId.toString() !== userId) {
      throw new BadRequestError("Only the current host can transfer the host role.");
    }
    throw new BadRequestError(
      "Target user is not an active participant in this meeting.",
    );
  }

  log.info(
    {
      meetingId: result._id.toString(),
      previousHostId: userId,
      newHostId: body.newHostUserId,
    },
    "host manually transferred",
  );

  return successResponse({
    meetingId: result._id.toString(),
    newHostUserId: body.newHostUserId,
  });
});

import { NextRequest } from "next/server";
import { z } from "zod";
import mongoose from "mongoose";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { BadRequestError, NotFoundError, ForbiddenError } from "@/lib/infra/api/errors";
import connectDB from "@/lib/infra/db/client";
import Meeting from "@/lib/infra/db/models/meeting";
import User from "@/lib/infra/db/models/user";
import { publishNotification } from "@/lib/notifications/publish";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("meetings:invite");

const inviteSchema = z.object({
  email: z.string().email("Invalid email address"),
});

/**
 * POST /api/meetings/[meetingId]/invite
 * Invite a user to a meeting by email. Sends an in-app notification.
 */
export const POST = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "meetings");
  const userId = await getUserIdFromRequest(req);
  const { meetingId } = await context!.params;

  if (!mongoose.Types.ObjectId.isValid(meetingId)) {
    throw new BadRequestError("Invalid meeting ID.");
  }

  const body = inviteSchema.parse(await req.json());
  const { email } = body;

  await connectDB();

  // Verify meeting exists and caller is a participant
  const meeting = await Meeting.findById(meetingId)
    .select("title code hostId participants status")
    .lean();

  if (!meeting) {
    throw new NotFoundError("Meeting not found.");
  }

  if (meeting.status === "ended" || meeting.status === "cancelled") {
    throw new BadRequestError("This meeting has already ended.");
  }

  const isParticipant = meeting.participants.some(
    (p) => p.userId.toString() === userId,
  );
  if (!isParticipant) {
    throw new ForbiddenError("You are not a participant in this meeting.");
  }

  // Find the invited user
  const invitedUser = await User.findOne({ email }).select("_id name").lean();

  if (!invitedUser) {
    throw new NotFoundError("No user found with that email address.");
  }

  // Check if already a participant
  const alreadyJoined = meeting.participants.some(
    (p) => p.userId.toString() === invitedUser._id.toString(),
  );
  if (alreadyJoined) {
    throw new BadRequestError("This user is already in the meeting.");
  }

  // Get inviter name for notification
  const inviter = await User.findById(userId).select("name displayName").lean();
  const inviterName = inviter?.displayName || inviter?.name || "Someone";

  // Send in-app notification
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const meetingLink = `${baseUrl}/meetings/join?code=${meeting.code}`;

  await publishNotification({
    userId: invitedUser._id.toString(),
    type: "meeting_invite",
    title: `${inviterName} invited you to: ${meeting.title}`,
    body: `Join with code ${meeting.code}`,
    sourceType: "meeting",
    sourceId: meetingId,
    priority: "urgent",
  });

  log.info(
    { meetingId, invitedEmail: email, invitedUserId: invitedUser._id.toString() },
    "meeting invite sent",
  );

  return successResponse({ invited: true, meetingLink });
});

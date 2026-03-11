import { NextRequest } from "next/server";
import { z } from "zod";
import mongoose from "mongoose";
import { withHandler } from "@/lib/api/with-handler";
import { successResponse } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/auth/middleware";
import { NotFoundError, ForbiddenError } from "@/lib/api/errors";
import connectDB from "@/lib/db/client";
import Meeting from "@/lib/db/models/meeting";
import ChatMessage from "@/lib/db/models/chat-message";

// ── Helpers ─────────────────────────────────────────────────────────

const MEETING_CODE_REGEX = /^yoo-[a-z0-9]{3}-[a-z0-9]{3}$/;

function buildMeetingFilter(meetingId: string): Record<string, unknown> {
  if (
    mongoose.Types.ObjectId.isValid(meetingId) &&
    !MEETING_CODE_REGEX.test(meetingId)
  ) {
    return { _id: new mongoose.Types.ObjectId(meetingId) };
  }
  return { code: meetingId.toLowerCase() };
}

// ── Validation ──────────────────────────────────────────────────────

const meetingIdSchema = z.string().min(1, "Meeting ID is required");

// ── GET /api/meetings/:meetingId/chat ───────────────────────────────

/**
 * Get persisted chat history for a regular meeting.
 * Only participants and the host can access.
 */
export const GET = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "meetings");
  const userId = await getUserIdFromRequest(req);

  const { meetingId } = await context!.params;
  meetingIdSchema.parse(meetingId);

  await connectDB();

  // Find the meeting and verify access
  const filter = buildMeetingFilter(meetingId);
  const meeting = await Meeting.findOne(filter).lean();

  if (!meeting) {
    throw new NotFoundError("Meeting not found.");
  }

  // Verify user is host or participant
  const isHost = meeting.hostId.toString() === userId;
  const isParticipant = meeting.participants.some(
    (p) => p.userId?.toString() === userId
  );

  if (!isHost && !isParticipant) {
    throw new ForbiddenError(
      "You must be a participant to view chat history."
    );
  }

  // Fetch persisted chat messages
  const messages = await ChatMessage.find({ meetingCode: meeting.code })
    .sort({ timestamp: 1 })
    .lean();

  return successResponse({
    meetingCode: meeting.code,
    messages: messages.map((m) => ({
      id: m.messageId,
      senderId: m.senderId,
      senderName: m.senderName,
      content: m.content,
      type: m.type,
      timestamp: m.timestamp,
    })),
  });
});

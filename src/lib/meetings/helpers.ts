import mongoose from "mongoose";

export const MEETING_CODE_REGEX = /^yoo-[a-z0-9]{3}-[a-z0-9]{3}$/;

export function buildMeetingFilter(meetingId: string): Record<string, unknown> {
  if (
    mongoose.Types.ObjectId.isValid(meetingId) &&
    !MEETING_CODE_REGEX.test(meetingId)
  ) {
    return { _id: new mongoose.Types.ObjectId(meetingId) };
  }
  return { code: meetingId.toLowerCase() };
}

export function isHostOrParticipant(
  meeting: { hostId: mongoose.Types.ObjectId; participants: { userId: mongoose.Types.ObjectId }[] },
  userId: string,
): boolean {
  if (meeting.hostId.toString() === userId) return true;
  return meeting.participants.some((p) => p.userId?.toString() === userId);
}

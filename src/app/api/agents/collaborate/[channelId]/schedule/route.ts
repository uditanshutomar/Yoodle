import { NextRequest } from "next/server";
import { z } from "zod";
import { withHandler } from "@/lib/api/with-handler";
import { successResponse } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/auth/middleware";
import { BadRequestError, NotFoundError, ForbiddenError } from "@/lib/api/errors";
import connectDB from "@/lib/db/client";
import AgentChannel from "@/lib/db/models/agent-channel";
import Meeting from "@/lib/db/models/meeting";
import { getFreeBusy, createEvent } from "@/lib/google/calendar";
import { hasGoogleAccess } from "@/lib/google/client";
import { findCollabSlots } from "@/lib/ai/agent-services";
import { generateMeetingCode } from "@/lib/utils/id";

const collabScheduleSchema = z.object({
  taskTitle: z.string().min(1).max(500),
  durationMinutes: z.number().min(15).max(480),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  workStartHour: z.number().min(0).max(23).optional().default(9),
  workEndHour: z.number().min(1).max(24).optional().default(17),
  /** Auto-create calendar events for the best slot on both users' calendars */
  autoSchedule: z.boolean().optional().default(false),
});

/**
 * POST /api/agents/collaborate/:channelId/schedule
 * Cross-reference both participants' calendars to find the best
 * shared time for collaborative work. Each agent only accesses
 * its own user's calendar via their Google tokens.
 */
export const POST = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "ai");
  const userId = await getUserIdFromRequest(req);

  const { channelId } = await context!.params;
  if (!channelId?.match(/^[0-9a-fA-F]{24}$/)) {
    throw new BadRequestError("Invalid channel ID");
  }

  const body = collabScheduleSchema.parse(await req.json());

  await connectDB();

  const channel = await AgentChannel.findById(channelId);
  if (!channel) {
    throw new NotFoundError("Channel not found.");
  }

  if (channel.status !== "active") {
    throw new BadRequestError("This collaboration channel is closed.");
  }

  const isParticipant = channel.participants.some(
    (p) => p.userId.toString() === userId
  );
  if (!isParticipant) {
    throw new ForbiddenError("You are not a participant of this channel.");
  }

  // Get both participants
  const participantA = channel.participants.find(
    (p) => p.userId.toString() === userId
  );
  const participantB = channel.participants.find(
    (p) => p.userId.toString() !== userId
  );

  if (!participantA || !participantB) {
    throw new Error("Channel is missing participant data.");
  }

  // Check Google access for both
  const [hasAccessA, hasAccessB] = await Promise.all([
    hasGoogleAccess(participantA.userId.toString()),
    hasGoogleAccess(participantB.userId.toString()),
  ]);

  if (!hasAccessA) {
    throw new BadRequestError("You need to connect your Google account for scheduling.");
  }
  if (!hasAccessB) {
    throw new BadRequestError(
      `${participantB.userName} hasn't connected their Google account. Scheduling requires both users to have Google Calendar access.`
    );
  }

  const now = new Date();
  const fromDate = body.fromDate || now.toISOString();
  const toDate =
    body.toDate ||
    new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

  // Each agent accesses ONLY its own user's calendar
  const [freeBusyA, freeBusyB] = await Promise.all([
    getFreeBusy(participantA.userId.toString(), fromDate, toDate),
    getFreeBusy(participantB.userId.toString(), fromDate, toDate),
  ]);

  const busyA = freeBusyA.flatMap((cal) => cal.busy);
  const busyB = freeBusyB.flatMap((cal) => cal.busy);

  // AI finds the best overlapping free slots
  const result = await findCollabSlots(
    participantA.userName,
    busyA,
    participantB.userName,
    busyB,
    body.taskTitle,
    body.durationMinutes,
    { from: fromDate, to: toDate },
    { start: body.workStartHour, end: body.workEndHour }
  );

  // Auto-schedule if requested and we have slots
  let scheduledEvent = null;
  if (body.autoSchedule && result.bestSlots.length > 0) {
    const bestSlot = result.bestSlots[0];

    // Create a Yoodle meeting room for the collaboration session
    const meetingCode = generateMeetingCode();
    const meeting = await Meeting.create({
      code: meetingCode,
      title: `[Collab] ${body.taskTitle}`,
      description: `Collaborative work session scheduled by Doodle.\nTopic: ${channel.topic}`,
      hostId: participantA.userId,
      type: "regular",
      status: "scheduled",
      scheduledAt: new Date(bestSlot.start),
      participants: [
        {
          userId: participantA.userId,
          role: "host",
          status: "invited",
        },
        {
          userId: participantB.userId,
          role: "co-host",
          status: "invited",
        },
      ],
      settings: {
        allowRecording: true,
        allowScreenShare: true,
      },
    });

    const yoodleRoomLink = `/meeting/${meetingCode}`;
    const eventDescription = `Collaborative work session: "${body.taskTitle}"\nScheduled by Doodle via Yoodle collaboration.\n\nJoin Yoodle Room: ${yoodleRoomLink}`;

    // Create calendar events on BOTH users' calendars using actual email addresses
    const [eventA, eventB] = await Promise.all([
      createEvent(participantA.userId.toString(), {
        title: `[Collab] ${body.taskTitle}`,
        description: eventDescription,
        start: bestSlot.start,
        end: bestSlot.end,
        attendees: [participantB.userEmail],
        addMeetLink: false,
      }).catch((err) => {
        console.error("[Collab Schedule A Error]", err);
        return null;
      }),
      createEvent(participantB.userId.toString(), {
        title: `[Collab] ${body.taskTitle}`,
        description: eventDescription,
        start: bestSlot.start,
        end: bestSlot.end,
        attendees: [participantA.userEmail],
        addMeetLink: false,
      }).catch((err) => {
        console.error("[Collab Schedule B Error]", err);
        return null;
      }),
    ]);

    scheduledEvent = {
      start: bestSlot.start,
      end: bestSlot.end,
      eventIdA: eventA?.id,
      eventIdB: eventB?.id,
      meetingCode,
      meetingId: meeting._id.toString(),
      yoodleRoomLink,
    };

    // Add a system message to the channel
    channel.messages.push({
      fromAgentId: participantA.agentId,
      fromUserId: participantA.userId,
      fromUserName: "Doodle",
      content: `Scheduled collaborative work: "${body.taskTitle}" at ${bestSlot.start}\nYoodle Room: ${yoodleRoomLink}`,
      type: "system",
      timestamp: new Date(),
    });
    await channel.save();
  }

  return successResponse({
    bestSlots: result.bestSlots,
    conflicts: result.conflicts,
    scheduledEvent,
    participantA: { name: participantA.userName, busyBlockCount: busyA.length },
    participantB: { name: participantB.userName, busyBlockCount: busyB.length },
  });
});

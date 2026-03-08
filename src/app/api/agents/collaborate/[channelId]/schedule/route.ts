import { NextRequest } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/db/client";
import AgentChannel from "@/lib/db/models/agent-channel";
import User from "@/lib/db/models/user";
import { authenticateRequest } from "@/lib/auth/middleware";
import { getFreeBusy, createEvent } from "@/lib/google/calendar";
import { hasGoogleAccess } from "@/lib/google/client";
import { findCollabSlots } from "@/lib/ai/agent-services";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
  forbiddenResponse,
  notFoundResponse,
  serverErrorResponse,
} from "@/lib/utils/api-response";

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
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  try {
    let userId: string;
    try {
      const payload = await authenticateRequest(request);
      userId = payload.userId;
    } catch {
      return unauthorizedResponse();
    }

    const { channelId } = await params;

    const body = await request.json();
    const parsed = collabScheduleSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse({
        message: "Validation failed.",
        status: 400,
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    await connectDB();

    const channel = await AgentChannel.findById(channelId);
    if (!channel) {
      return notFoundResponse("Channel not found.");
    }

    if (channel.status !== "active") {
      return errorResponse("This collaboration channel is closed.", 400);
    }

    const isParticipant = channel.participants.some(
      (p) => p.userId.toString() === userId
    );
    if (!isParticipant) {
      return forbiddenResponse("You are not a participant of this channel.");
    }

    // Get both participants
    const participantA = channel.participants.find(
      (p) => p.userId.toString() === userId
    )!;
    const participantB = channel.participants.find(
      (p) => p.userId.toString() !== userId
    )!;

    // Check Google access for both
    const [hasAccessA, hasAccessB] = await Promise.all([
      hasGoogleAccess(participantA.userId.toString()),
      hasGoogleAccess(participantB.userId.toString()),
    ]);

    if (!hasAccessA) {
      return errorResponse("You need to connect your Google account for scheduling.", 400);
    }
    if (!hasAccessB) {
      return errorResponse(
        `${participantB.userName} hasn't connected their Google account. Scheduling requires both users to have Google Calendar access.`,
        400
      );
    }

    const now = new Date();
    const fromDate = parsed.data.fromDate || now.toISOString();
    const toDate =
      parsed.data.toDate ||
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
      parsed.data.taskTitle,
      parsed.data.durationMinutes,
      { from: fromDate, to: toDate },
      { start: parsed.data.workStartHour, end: parsed.data.workEndHour }
    );

    // Auto-schedule if requested and we have slots
    let scheduledEvent = null;
    if (parsed.data.autoSchedule && result.bestSlots.length > 0) {
      const bestSlot = result.bestSlots[0];

      // Create events on BOTH users' calendars
      const eventDescription = `Collaborative work session: "${parsed.data.taskTitle}"\nScheduled by Doodle via Yoodle collaboration.`;

      const [eventA, eventB] = await Promise.all([
        createEvent(participantA.userId.toString(), {
          title: `[Collab] ${parsed.data.taskTitle}`,
          description: eventDescription,
          start: bestSlot.start,
          end: bestSlot.end,
          attendees: [participantB.userName],
          addMeetLink: true,
        }).catch((err) => {
          console.error("[Collab Schedule A Error]", err);
          return null;
        }),
        createEvent(participantB.userId.toString(), {
          title: `[Collab] ${parsed.data.taskTitle}`,
          description: eventDescription,
          start: bestSlot.start,
          end: bestSlot.end,
          attendees: [participantA.userName],
          addMeetLink: true,
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
        meetLink: eventA?.meetLink || eventB?.meetLink,
      };

      // Add a system message to the channel
      channel.messages.push({
        fromAgentId: participantA.agentId,
        fromUserId: participantA.userId,
        fromUserName: "Doodle",
        content: `Scheduled collaborative work: "${parsed.data.taskTitle}" at ${bestSlot.start}`,
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
  } catch (error) {
    console.error("[Collab Schedule Error]", error);
    return serverErrorResponse("Failed to find collaborative schedule.");
  }
}

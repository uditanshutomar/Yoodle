import { NextRequest } from "next/server";
import { z } from "zod";
import { withHandler } from "@/lib/api/with-handler";
import { successResponse } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/auth/middleware";
import { BadRequestError } from "@/lib/api/errors";
import connectDB from "@/lib/db/client";
import Agent from "@/lib/db/models/agent";
import AgentTask from "@/lib/db/models/agent-task";
import { getFreeBusy, createEvent } from "@/lib/google/calendar";
import { hasGoogleAccess } from "@/lib/google/client";
import { withRetry, isTransientError } from "@/lib/utils/retry";
import { suggestSchedule } from "@/lib/ai/agent-services";

const scheduleSchema = z.object({
  /** Optional specific task IDs to schedule. If empty, schedules all pending tasks. */
  taskIds: z.array(z.string()).optional(),
  /** Date range to look for slots (defaults to next 7 days) */
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  /** Working hours (24h format, defaults to 9-17) */
  workStartHour: z.number().min(0).max(23).optional().default(9),
  workEndHour: z.number().min(1).max(24).optional().default(17),
  /** Auto-create calendar events for suggested slots */
  autoSchedule: z.boolean().optional().default(false),
});

/**
 * POST /api/agents/schedule
 * Get smart scheduling suggestions for pending tasks.
 * Analyzes calendar availability and task priorities to find optimal work windows.
 * Optionally auto-creates calendar events.
 */
export const POST = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "ai");
  const userId = await getUserIdFromRequest(req);

  const body = scheduleSchema.parse(await req.json());

  await connectDB();

  const googleAccess = await hasGoogleAccess(userId);
  if (!googleAccess) {
    throw new BadRequestError("Google account required for scheduling.");
  }

  // Get tasks to schedule
  const taskFilter: Record<string, unknown> = {
    userId,
    status: { $in: ["pending", "in_progress"] },
  };
  if (body.taskIds?.length) {
    taskFilter._id = { $in: body.taskIds };
  }

  const tasks = await AgentTask.find(taskFilter)
    .sort({ priority: 1, dueDate: 1 })
    .limit(20)
    .lean();

  if (tasks.length === 0) {
    return successResponse({ suggestions: [], message: "No pending tasks to schedule." });
  }

  // Get calendar busy blocks
  const now = new Date();
  const fromDate = body.fromDate || now.toISOString();
  const toDate =
    body.toDate ||
    new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const freeBusyResult = await withRetry(() => getFreeBusy(userId, fromDate, toDate), { retryOn: isTransientError });
  const busyBlocks = freeBusyResult.flatMap((cal) => cal.busy);

  // Get AI scheduling suggestions
  const taskInputs = tasks.map((t) => ({
    title: t.title,
    estimatedMinutes: t.estimatedMinutes || 60,
    priority: t.priority as "high" | "medium" | "low",
    dueDate: t.dueDate?.toISOString(),
  }));

  const suggestions = await suggestSchedule(
    taskInputs,
    busyBlocks,
    { start: body.workStartHour, end: body.workEndHour },
    { from: fromDate, to: toDate }
  );

  // Auto-schedule if requested
  const scheduledEvents: { taskTitle: string; eventId: string; start: string; end: string }[] = [];

  if (body.autoSchedule && suggestions.length > 0) {
    for (const suggestion of suggestions) {
      const bestSlot = suggestion.suggestedSlots[0];
      if (!bestSlot) continue;

      try {
        const event = await withRetry(
          () => createEvent(userId, {
            title: `[Focus] ${suggestion.taskTitle}`,
            description: `Scheduled by Doodle for focused work.\nPriority: ${suggestion.priority}\nEstimated: ${suggestion.estimatedMinutes} minutes`,
            start: bestSlot.start,
            end: bestSlot.end,
          }),
          { retryOn: isTransientError }
        );

        scheduledEvents.push({
          taskTitle: suggestion.taskTitle,
          eventId: event.id,
          start: bestSlot.start,
          end: bestSlot.end,
        });

        // Update the task with the calendar event
        const matchingTask = tasks.find((t) => t.title === suggestion.taskTitle);
        if (matchingTask) {
          await AgentTask.findByIdAndUpdate(matchingTask._id, {
            googleCalendarEventId: event.id,
            scheduledStart: new Date(bestSlot.start),
            scheduledEnd: new Date(bestSlot.end),
            status: "in_progress",
          });
        }
      } catch (err) {
        console.error("[Auto Schedule Error]", err);
      }
    }
  }

  // Update agent activity
  await Agent.findOneAndUpdate(
    { userId },
    { $set: { lastActiveAt: new Date() } }
  );

  return successResponse({
    suggestions: suggestions.map((s) => ({
      taskTitle: s.taskTitle,
      estimatedMinutes: s.estimatedMinutes,
      priority: s.priority,
      suggestedSlots: s.suggestedSlots,
    })),
    scheduledEvents,
    busyBlockCount: busyBlocks.length,
    tasksAnalyzed: tasks.length,
  });
});

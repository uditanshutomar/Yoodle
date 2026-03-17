import { createLogger } from "@/lib/infra/logger";

const log = createLogger("context-enricher");
const MAX_RELATED = 3;

interface EnrichedTaskContext {
  sourceMeeting: { id: string; title: string; scheduledAt?: string } | null;
  relatedMessages: Array<{ content: string; sender: string; createdAt: string }>;
}

interface EnrichedMeetingContext {
  relatedTasks: Array<{ id: string; title: string; status: string }>;
}

export async function enrichTask(
  task: { _id: unknown; title: string; meetingId?: unknown },
): Promise<EnrichedTaskContext> {
  const result: EnrichedTaskContext = { sourceMeeting: null, relatedMessages: [] };

  try {
    const [Meeting, DirectMessage] = await Promise.all([
      import("@/lib/infra/db/models/meeting").then((m) => m.default),
      import("@/lib/infra/db/models/direct-message").then((m) => m.default),
    ]);

    if (task.meetingId) {
      const meeting = await Meeting.findById(task.meetingId).lean();
      if (meeting) {
        result.sourceMeeting = {
          id: meeting._id.toString(),
          title: meeting.title,
          scheduledAt: meeting.scheduledAt?.toISOString(),
        };
      }
    }

    const escapedTitle = task.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const messages = await DirectMessage.find({
      content: { $regex: escapedTitle, $options: "i" },
    })
      .sort({ createdAt: -1 })
      .limit(MAX_RELATED)
      .lean();

    result.relatedMessages = messages.map((m: Record<string, unknown>) => ({
      content: String(m.content ?? "").slice(0, 200),
      sender: String(m.senderId ?? "unknown"),
      createdAt: (m.createdAt as Date)?.toISOString?.() ?? "",
    }));
  } catch (err) {
    log.warn({ err, taskId: task._id }, "Task enrichment failed (non-fatal)");
  }

  return result;
}

export async function enrichMeeting(
  meeting: { _id: unknown; title: string },
): Promise<EnrichedMeetingContext> {
  const result: EnrichedMeetingContext = { relatedTasks: [] };

  try {
    const Task = (await import("@/lib/infra/db/models/task")).default;

    const tasks = await Task.find({ meetingId: meeting._id })
      .limit(MAX_RELATED)
      .lean();

    result.relatedTasks = tasks.map((t: Record<string, unknown>) => ({
      id: String(t._id),
      title: String(t.title),
      status: t.completedAt ? "done" : "open",
    }));
  } catch (err) {
    log.warn({ err, meetingId: meeting._id }, "Meeting enrichment failed (non-fatal)");
  }

  return result;
}

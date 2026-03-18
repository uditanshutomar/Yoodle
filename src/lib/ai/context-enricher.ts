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
  userId?: string,
): Promise<EnrichedTaskContext> {
  const result: EnrichedTaskContext = { sourceMeeting: null, relatedMessages: [] };

  try {
    const [Meeting, DirectMessage, Conversation] = await Promise.all([
      import("@/lib/infra/db/models/meeting").then((m) => m.default),
      import("@/lib/infra/db/models/direct-message").then((m) => m.default),
      import("@/lib/infra/db/models/conversation").then((m) => m.default),
    ]);

    if (task.meetingId) {
      const meeting = await Meeting.findById(task.meetingId)
        .select("title scheduledAt")
        .lean();
      if (meeting) {
        result.sourceMeeting = {
          id: meeting._id.toString(),
          title: meeting.title,
          scheduledAt: meeting.scheduledAt?.toISOString(),
        };
      }
    }

    const escapedTitle = task.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Scope message search to conversations the user is a member of
    // to prevent leaking messages from other users' private conversations.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messageFilter: Record<string, any> = {
      content: { $regex: escapedTitle, $options: "i" },
    };
    if (userId) {
      const userConvs = await Conversation.find(
        { "participants.userId": userId },
        { _id: 1 },
      ).lean();
      messageFilter.conversationId = { $in: userConvs.map((c) => c._id) };
    }

    const messages = await DirectMessage.find(messageFilter)
      .select("content senderId createdAt")
      .sort({ createdAt: -1 })
      .limit(MAX_RELATED)
      .lean();

    result.relatedMessages = messages.map((m) => ({
      content: String(m.content ?? "").slice(0, 200),
      sender: String(m.senderId ?? "unknown"),
      createdAt: m.createdAt ? new Date(m.createdAt as string | number | Date).toISOString() : "",
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tasks = await Task.find({ meetingId: meeting._id as any })
      .select("title completedAt")
      .limit(MAX_RELATED)
      .lean();

    result.relatedTasks = tasks.map((t) => ({
      id: String(t._id),
      title: String(t.title),
      status: "completedAt" in t && t.completedAt ? "done" : "open",
    }));
  } catch (err) {
    log.warn({ err, meetingId: meeting._id }, "Meeting enrichment failed (non-fatal)");
  }

  return result;
}

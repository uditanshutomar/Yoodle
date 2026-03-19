import type { Job } from "bullmq";
import mongoose from "mongoose";
import type { PostMeetingCascadePayload } from "../types";
import connectDB from "@/lib/infra/db/client";
import Meeting from "@/lib/infra/db/models/meeting";
import Conversation from "@/lib/infra/db/models/conversation";
import DirectMessage from "@/lib/infra/db/models/direct-message";
import { getRedisClient } from "@/lib/infra/redis/client";
import { updateEvent } from "@/lib/google/calendar";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("worker:post-meeting-cascade");

// ── Types ───────────────────────────────────────────────────────────

interface MeetingMom {
  summary?: string;
  keyDecisions?: string[];
  discussionPoints?: string[];
  actionItems?: { task: string; assignee: string; dueDate: string }[];
  nextSteps?: string[];
}

interface MeetingWithMom {
  _id: mongoose.Types.ObjectId;
  title?: string;
  code?: string;
  hostId: mongoose.Types.ObjectId;
  mom?: MeetingMom;
  calendarEventId?: string;
  startedAt?: Date;
  scheduledAt?: Date;
  createdAt: Date;
  endedAt?: Date;
}

// ── Helpers ─────────────────────────────────────────────────────────

/** Publish a chat event via Redis pub/sub. Best-effort — never throws. */
async function publishChatEvent(
  convId: mongoose.Types.ObjectId,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  message: any,
  logger: typeof log,
): Promise<void> {
  try {
    const redis = getRedisClient();
    await redis.publish(
      `chat:${convId}`,
      JSON.stringify({ type: "message", data: message }),
    );
  } catch (err) {
    logger.warn({ err }, "Redis publish failed (non-fatal)");
  }
}

// ── Processor ───────────────────────────────────────────────────────

/**
 * Post-meeting cascade processor.
 *
 * Runs after a meeting ends. Steps:
 * 1. Post "Meeting ended." system message
 * 2. Post MoM (minutes of meeting) if available
 * 3. Extract and propose action items
 * 4. Update calendar event with MoM summary
 *
 * Each step is idempotent — safe to retry without creating duplicates.
 */
export async function processPostMeetingCascade(
  job: Job<PostMeetingCascadePayload>,
): Promise<void> {
  const { meetingId, hostId } = job.data;
  const jobLog = log.child({ meetingId, jobId: job.id });
  jobLog.info("starting post-meeting cascade");

  await connectDB();

  // ── Find conversation linked to this meeting ──────────────────────

  const conv = await Conversation.findOne({
    meetingId: new mongoose.Types.ObjectId(meetingId),
  })
    .select("_id")
    .lean();

  if (!conv) {
    jobLog.info("no conversation linked to meeting, skipping cascade");
    return;
  }
  const convId = conv._id as mongoose.Types.ObjectId;

  // ── Fetch meeting data ─────────────────────────────────────────────

  const meeting = (await Meeting.findById(meetingId)
    .select("title code hostId mom calendarEventId startedAt scheduledAt createdAt endedAt")
    .lean()) as MeetingWithMom | null;

  if (!meeting) {
    jobLog.warn("meeting not found in DB, skipping cascade");
    return;
  }

  const hostObjectId = new mongoose.Types.ObjectId(hostId);

  // Track step failures. If any step fails, we throw at the end so BullMQ
  // retries the job. Every step is idempotent — re-running already-completed
  // steps is a no-op thanks to the DB existence checks.
  const stepErrors: { step: number; error: unknown }[] = [];

  // ── Step 0: Sync calendar end time to actual duration (idempotent) ─

  try {
    if (meeting.calendarEventId && meeting.endedAt) {
      const startTime = meeting.startedAt || meeting.scheduledAt || meeting.createdAt;
      const endedAt = new Date(job.data.endedAt);
      const actualMinutes = Math.max(1, (endedAt.getTime() - startTime.getTime()) / 60000);
      const roundedMinutes = Math.max(15, Math.round(actualMinutes / 15) * 15);
      const newEnd = new Date(startTime.getTime() + roundedMinutes * 60000);

      await updateEvent(hostId, meeting.calendarEventId, {
        end: newEnd.toISOString(),
      });

      jobLog.info("synced calendar event end time");
    }
  } catch (err) {
    jobLog.error({ err }, "step 0 failed: sync calendar end time");
    stepErrors.push({ step: 0, error: err });
  }

  // ── Step 1: Post "Meeting ended." system message (idempotent) ─────

  try {
    const existingEndMsg = await DirectMessage.findOne({
      conversationId: convId,
      type: "system",
      content: "Meeting ended.",
    })
      .select("_id")
      .lean();

    if (!existingEndMsg) {
      const endMsg = await DirectMessage.create({
        conversationId: convId,
        senderId: hostObjectId,
        senderType: "user",
        content: "Meeting ended.",
        type: "system",
      });

      await Conversation.updateOne(
        { _id: convId },
        {
          $set: {
            lastMessageAt: endMsg.createdAt,
            lastMessagePreview: endMsg.content,
            lastMessageSenderId: endMsg.senderId,
          },
        },
      );

      await publishChatEvent(convId, endMsg, jobLog);
      jobLog.info("posted meeting-ended system message");
    } else {
      jobLog.info("meeting-ended message already exists, skipping step 1");
    }
  } catch (err) {
    jobLog.error({ err }, "step 1 failed: post meeting-ended message");
    stepErrors.push({ step: 1, error: err });
  }

  // ── Step 2: Post MoM if available (idempotent) ────────────────────

  try {
    if (meeting.mom?.summary) {
      // Check if MoM message already posted
      const existingMom = await DirectMessage.findOne({
        conversationId: convId,
        senderType: "agent",
        type: "agent",
        content: { $regex: /^\*\*Minutes of Meeting:/ },
      })
        .select("_id")
        .lean();

      if (!existingMom) {
        const mom = meeting.mom;
        const momContent = [
          `**Minutes of Meeting: ${meeting.title}**`,
          "",
          `**Summary:** ${mom.summary}`,
          mom.keyDecisions?.length
            ? `\n**Key Decisions:**\n${mom.keyDecisions.map((d) => `- ${d}`).join("\n")}`
            : "",
          mom.discussionPoints?.length
            ? `\n**Discussion Points:**\n${mom.discussionPoints.map((d) => `- ${d}`).join("\n")}`
            : "",
          mom.actionItems?.length
            ? `\n**Action Items:**\n${mom.actionItems.map((a) => `- ${a.task} → ${a.assignee} (${a.dueDate})`).join("\n")}`
            : "",
          mom.nextSteps?.length
            ? `\n**Next Steps:**\n${mom.nextSteps.map((s) => `- ${s}`).join("\n")}`
            : "",
        ]
          .filter(Boolean)
          .join("\n");

        const momMsg = await DirectMessage.create({
          conversationId: convId,
          senderId: hostObjectId,
          senderType: "agent",
          content: momContent,
          type: "agent",
          agentMeta: { forUserId: hostObjectId },
        });

        await Conversation.updateOne(
          { _id: convId },
          {
            $set: {
              lastMessageAt: momMsg.createdAt,
              lastMessagePreview: "Minutes of Meeting posted",
              lastMessageSenderId: momMsg.senderId,
            },
          },
        );

        await publishChatEvent(convId, momMsg, jobLog);
        jobLog.info("posted MoM to conversation");
      } else {
        jobLog.info("MoM message already exists, skipping step 2");
      }
    }
  } catch (err) {
    jobLog.error({ err }, "step 2 failed: post MoM");
    stepErrors.push({ step: 2, error: err });
  }

  // ── Step 3: Propose action items (idempotent) ─────────────────────

  try {
    if (meeting.mom?.actionItems?.length) {
      // Check if action item proposal already posted
      const existingProposal = await DirectMessage.findOne({
        conversationId: convId,
        senderType: "agent",
        "agentMeta.pendingAction.actionType": "create_tasks_from_meeting",
      })
        .select("_id")
        .lean();

      if (!existingProposal) {
        const actionItems = meeting.mom.actionItems;
        const taskProposals = actionItems
          .map((a) => `- **${a.task}** -> ${a.assignee} (due: ${a.dueDate})`)
          .join("\n");

        const proposalContent = [
          `**Action Items from "${meeting.title}"**`,
          "",
          "I detected these action items from the meeting:",
          taskProposals,
          "",
          "Would you like me to create tasks for these?",
        ].join("\n");

        const proposalMsg = await DirectMessage.create({
          conversationId: convId,
          senderId: hostObjectId,
          senderType: "agent",
          content: proposalContent,
          type: "agent",
          agentMeta: {
            forUserId: hostObjectId,
            pendingAction: {
              actionId: `action-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
              actionType: "create_tasks_from_meeting",
              args: {
                meetingId: meeting._id.toString(),
                actionItems,
              },
              summary: `Create ${actionItems.length} tasks from meeting "${meeting.title}"`,
              status: "pending",
            },
          },
        });

        await Conversation.updateOne(
          { _id: convId },
          {
            $set: {
              lastMessageAt: proposalMsg.createdAt,
              lastMessagePreview: "Action items detected from meeting",
              lastMessageSenderId: proposalMsg.senderId,
            },
          },
        );

        await publishChatEvent(convId, proposalMsg, jobLog);
        jobLog.info(
          { count: actionItems.length },
          "posted action item proposals",
        );
      } else {
        jobLog.info("action item proposal already exists, skipping step 3");
      }
    }
  } catch (err) {
    jobLog.error({ err }, "step 3 failed: propose action items");
    stepErrors.push({ step: 3, error: err });
  }

  // ── Step 4: Update calendar event with MoM (idempotent) ───────────

  try {
    if (meeting.calendarEventId && meeting.mom?.summary) {
      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.NEXT_PUBLIC_BASE_URL ||
        "http://localhost:3000";
      const yoodleLink = `${baseUrl}/meetings/${meeting.code}/room`;
      const momLink = `${baseUrl}/meetings/${meeting._id}`;
      const updatedDesc = [
        `Join Yoodle meeting: ${yoodleLink}`,
        "",
        `📝 Meeting Notes:`,
        meeting.mom.summary,
        meeting.mom.keyDecisions?.length
          ? `\nKey Decisions: ${meeting.mom.keyDecisions.join("; ")}`
          : "",
        `\nFull notes: ${momLink}`,
      ]
        .filter(Boolean)
        .join("\n");

      await updateEvent(hostId, meeting.calendarEventId, {
        description: updatedDesc,
      });

      jobLog.info("updated calendar event with MoM summary");
    }
  } catch (err) {
    jobLog.error({ err }, "step 4 failed: update calendar event");
    stepErrors.push({ step: 4, error: err });
  }

  // ── Throw if any step failed so BullMQ retries the job ────────────
  // Every step is idempotent, so re-running already-succeeded steps is safe.

  if (stepErrors.length > 0) {
    const failedSteps = stepErrors.map((e) => e.step).join(", ");
    const firstError = stepErrors[0].error;
    jobLog.error(
      { failedSteps, attempt: job.attemptsMade + 1 },
      "post-meeting cascade had step failures, will retry",
    );
    throw firstError instanceof Error
      ? firstError
      : new Error(`Cascade steps [${failedSteps}] failed`);
  }

  jobLog.info("post-meeting cascade complete");
}

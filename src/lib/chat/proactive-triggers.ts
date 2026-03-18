import mongoose from "mongoose";
import { createLogger } from "@/lib/infra/logger";
import { getRedisClient } from "@/lib/infra/redis/client";
import connectDB from "@/lib/infra/db/client";
import { canSendProactive, isAgentMuted } from "./proactive-limiter";

const log = createLogger("proactive-triggers");

/* ─── Helpers ─── */

async function postAgentMessage(
  convId: string,
  agentUserId: string,
  content: string,
  meta?: { cards?: Array<Record<string, unknown>> },
) {
  const DirectMessage = (await import("@/lib/infra/db/models/direct-message")).default;
  const Conversation = (await import("@/lib/infra/db/models/conversation")).default;

  const msg = await DirectMessage.create({
    conversationId: convId,
    senderId: new mongoose.Types.ObjectId(agentUserId),
    senderType: "agent",
    content,
    type: "agent",
    agentMeta: {
      forUserId: new mongoose.Types.ObjectId(agentUserId),
      ...(meta?.cards ? { cards: meta.cards } : {}),
    },
  });

  const preview = content.length > 80 ? content.slice(0, 80) + "..." : content;
  await Conversation.updateOne(
    { _id: convId },
    {
      $set: {
        lastMessageAt: msg.createdAt,
        lastMessagePreview: preview,
        lastMessageSenderId: msg.senderId,
      },
    },
  );

  try {
    const redis = getRedisClient();
    await redis.publish(
      `chat:${convId}`,
      JSON.stringify({ type: "message", message: msg }),
    );
  } catch {
    /* Redis pub/sub is best-effort */
  }

  try {
    const { incrementUnseen } = await import("./proactive-insights");
    await incrementUnseen(agentUserId);
  } catch {
    /* best-effort */
  }

  return msg;
}

/* ─── 1. Meeting Prep ─── */

export async function triggerMeetingPrep(): Promise<void> {
  try {
    await connectDB();
    const Meeting = (await import("@/lib/infra/db/models/meeting")).default;
    const Task = (await import("@/lib/infra/db/models/task")).default;
    const Conversation = (await import("@/lib/infra/db/models/conversation")).default;

    const now = new Date();
    const from = new Date(now.getTime() + 15 * 60 * 1000);
    const to = new Date(now.getTime() + 20 * 60 * 1000);

    const meetings = await Meeting.find({
      status: "scheduled",
      scheduledAt: { $gte: from, $lte: to },
    }).lean();

    log.info({ count: meetings.length }, "Meeting prep: meetings found");

    for (const meeting of meetings) {
      try {
        const conv = await Conversation.findOne({ meetingId: meeting._id }).lean();
        if (!conv) continue;

        const tasks = await Task.find({
          meetingId: meeting._id,
          completedAt: null,
        }).lean();

        const taskList =
          tasks.length > 0
            ? tasks.map((t) => `- ${t.title}`).join("\n")
            : "- No linked tasks";

        const content = `**Meeting Prep: ${meeting.title}**\nStarting in ~15 minutes\n\n**Linked Tasks:**\n${taskList}`;

        for (const p of conv.participants) {
          if (!p.agentEnabled) continue;

          try {
            const uid = p.userId.toString();
            const cid = conv._id.toString();

            if (await isAgentMuted(cid, uid)) continue;
            if (!(await canSendProactive(cid, uid, "meeting_prep"))) continue;

            await postAgentMessage(cid, uid, content);
            log.info({ meetingId: meeting._id, userId: uid }, "Meeting prep sent");
          } catch (err) {
            log.error({ err, meetingId: meeting._id }, "Meeting prep: participant error");
          }
        }
      } catch (err) {
        log.error({ err, meetingId: meeting._id }, "Meeting prep: meeting error");
      }
    }
  } catch (err) {
    log.error({ err }, "triggerMeetingPrep failed");
  }
}

/* ─── 2. Deadline Reminders ─── */

export async function triggerDeadlineReminders(): Promise<void> {
  try {
    await connectDB();
    const Task = (await import("@/lib/infra/db/models/task")).default;
    const ConversationContext = (await import("@/lib/infra/db/models/conversation-context")).default;
    const Conversation = (await import("@/lib/infra/db/models/conversation")).default;

    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const tasks = await Task.find({
      completedAt: null,
      dueDate: { $gte: now, $lte: in24h },
      assigneeId: { $exists: true },
    }).lean();

    log.info({ count: tasks.length }, "Deadline reminders: tasks found");

    for (const task of tasks) {
      try {
        const taskId = task._id.toString();
        const assigneeId = task.assigneeId!.toString();

        // Find conversations linked to this task via ConversationContext
        const contexts = await ConversationContext.find({
          linkedTaskIds: task._id,
        }).lean();

        let sent = false;

        if (contexts.length > 0) {
          for (const ctx of contexts) {
            if (sent) break;

            const conv = await Conversation.findById(ctx.conversationId).lean();
            if (!conv) continue;

            const participant = conv.participants.find(
              (p) => p.userId.toString() === assigneeId && p.agentEnabled,
            );
            if (!participant) continue;

            const cid = conv._id.toString();
            if (await isAgentMuted(cid, assigneeId)) continue;
            if (!(await canSendProactive(cid, assigneeId, "deadline_reminder"))) continue;

            const dueDateStr = task.dueDate!.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            });
            const content = `**Reminder:** "${task.title}" is due ${dueDateStr}. Need more time?`;
            await postAgentMessage(cid, assigneeId, content);
            log.info({ taskId, assigneeId }, "Deadline reminder sent (linked conv)");
            sent = true;
          }
        }

        // Fallback: DM conversation with the assignee where agent is enabled
        if (!sent) {
          const dmConv = await Conversation.findOne({
            type: "dm",
            "participants.userId": new mongoose.Types.ObjectId(assigneeId),
            "participants.agentEnabled": true,
          }).lean();

          if (dmConv) {
            const cid = dmConv._id.toString();
            if (!(await isAgentMuted(cid, assigneeId))) {
              if (await canSendProactive(cid, assigneeId, "deadline_reminder")) {
                const dueDateStr = task.dueDate!.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                });
                const content = `**Reminder:** "${task.title}" is due ${dueDateStr}. Need more time?`;
                await postAgentMessage(cid, assigneeId, content);
                log.info({ taskId, assigneeId }, "Deadline reminder sent (DM fallback)");
              }
            }
          }
        }
      } catch (err) {
        log.error({ err, taskId: task._id }, "Deadline reminder: task error");
      }
    }
  } catch (err) {
    log.error({ err }, "triggerDeadlineReminders failed");
  }
}

/* ─── 3. Follow-Up Nudges ─── */

export async function triggerFollowUpNudges(): Promise<void> {
  try {
    await connectDB();
    const Task = (await import("@/lib/infra/db/models/task")).default;
    const Conversation = (await import("@/lib/infra/db/models/conversation")).default;
    const User = (await import("@/lib/infra/db/models/user")).default;

    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);

    const tasks = await Task.find({
      meetingId: { $exists: true },
      completedAt: null,
      createdAt: { $lte: cutoff },
    }).lean();

    log.info({ count: tasks.length }, "Follow-up nudges: tasks found");

    for (const task of tasks) {
      try {
        if (!task.assigneeId) continue;

        const conv = await Conversation.findOne({ meetingId: task.meetingId }).lean();
        if (!conv) continue;

        const assigneeId = task.assigneeId.toString();
        const participant = conv.participants.find(
          (p) => p.userId.toString() === assigneeId && p.agentEnabled,
        );
        if (!participant) continue;

        const cid = conv._id.toString();
        if (await isAgentMuted(cid, assigneeId)) continue;
        if (!(await canSendProactive(cid, assigneeId, "follow_up_nudge"))) continue;

        const user = await User.findById(task.assigneeId, { displayName: 1 }).lean();
        const name = user?.displayName || "there";

        const content = `Hey ${name}, just checking — "${task.title}" from the meeting hasn't been started yet. Still on track?`;
        await postAgentMessage(cid, assigneeId, content);
        log.info({ taskId: task._id, assigneeId }, "Follow-up nudge sent");
      } catch (err) {
        log.error({ err, taskId: task._id }, "Follow-up nudge: task error");
      }
    }
  } catch (err) {
    log.error({ err }, "triggerFollowUpNudges failed");
  }
}

/* ─── 4. Blocked Task Alerts ─── */

export async function triggerBlockedTaskAlerts(): Promise<void> {
  try {
    await connectDB();
    const Task = (await import("@/lib/infra/db/models/task")).default;
    const Conversation = (await import("@/lib/infra/db/models/conversation")).default;

    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

    const tasks = await Task.find({
      completedAt: null,
      updatedAt: { $lte: threeDaysAgo },
      assigneeId: { $exists: true },
    })
      .limit(20)
      .lean();

    log.info({ count: tasks.length }, "Blocked task alerts: tasks found");

    for (const task of tasks) {
      try {
        const assigneeId = task.assigneeId!.toString();

        const conv = await Conversation.findOne({
          "participants.userId": new mongoose.Types.ObjectId(assigneeId),
          "participants.agentEnabled": true,
        }).lean();

        if (!conv) continue;

        const cid = conv._id.toString();
        if (await isAgentMuted(cid, assigneeId)) continue;
        if (!(await canSendProactive(cid, assigneeId, "blocked_task_alert"))) continue;

        const daysSinceUpdate = Math.floor(
          (Date.now() - new Date(task.updatedAt).getTime()) / (1000 * 60 * 60 * 24),
        );
        const content = `"${task.title}" hasn't been updated in ${daysSinceUpdate} days. Need help or should we reprioritize?`;

        await postAgentMessage(cid, assigneeId, content);
        log.info({ taskId: task._id, assigneeId }, "Blocked task alert sent");
      } catch (err) {
        log.error({ err, taskId: task._id }, "Blocked task alert: task error");
      }
    }
  } catch (err) {
    log.error({ err }, "triggerBlockedTaskAlerts failed");
  }
}

/* ─── 5. Stale Task Nudge ─── */

export async function triggerStaleTasks(): Promise<void> {
  try {
    await connectDB();
    const Task = (await import("@/lib/infra/db/models/task")).default;
    const Conversation = (await import("@/lib/infra/db/models/conversation")).default;

    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);

    const tasks = await Task.find({
      completedAt: null,
      updatedAt: { $lte: fiveDaysAgo },
      assigneeId: { $exists: true },
    })
      .limit(15)
      .lean();

    log.info({ count: tasks.length }, "Stale task nudge: tasks found");

    for (const task of tasks) {
      try {
        const assigneeId = task.assigneeId!.toString();

        const conv = await Conversation.findOne({
          "participants.userId": new mongoose.Types.ObjectId(assigneeId),
          "participants.agentEnabled": true,
        }).lean();

        if (!conv) continue;

        const cid = conv._id.toString();
        if (await isAgentMuted(cid, assigneeId)) continue;
        if (!(await canSendProactive(cid, assigneeId, "stale_task_nudge"))) continue;

        const daysSinceUpdate = Math.floor(
          (Date.now() - new Date(task.updatedAt).getTime()) / (1000 * 60 * 60 * 24),
        );
        const content = `"${task.title}" hasn't moved in ${daysSinceUpdate} days. Blocked, deprioritized, or need help?`;

        await postAgentMessage(cid, assigneeId, content);
        log.info({ taskId: task._id, assigneeId }, "Stale task nudge sent");
      } catch (err) {
        log.error({ err, taskId: task._id }, "Stale task nudge: task error");
      }
    }
  } catch (err) {
    log.error({ err }, "triggerStaleTasks failed");
  }
}

/* ─── 6. Weekly Pattern Summary ─── */

export async function triggerWeeklyPatternSummary(): Promise<void> {
  try {
    const now = new Date();
    if (now.getDay() !== 1) {
      log.info("Weekly pattern summary: not Monday, skipping");
      return;
    }

    await connectDB();
    const Task = (await import("@/lib/infra/db/models/task")).default;
    const Meeting = (await import("@/lib/infra/db/models/meeting")).default;
    const Conversation = (await import("@/lib/infra/db/models/conversation")).default;

    const conversations = await Conversation.find({
      "participants.agentEnabled": true,
    })
      .limit(50)
      .lean();

    for (const conv of conversations) {
      for (const p of conv.participants) {
        if (!p.agentEnabled) continue;

        try {
          const uid = p.userId.toString();
          const cid = conv._id.toString();

          if (await isAgentMuted(cid, uid)) continue;
          if (!(await canSendProactive(cid, uid, "weekly_pattern_summary"))) continue;

          const lastWeekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          const thisWeekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

          const [completedCount, overdueCount, upcomingMeetings] = await Promise.all([
            Task.countDocuments({
              assigneeId: new mongoose.Types.ObjectId(uid),
              completedAt: { $gte: lastWeekStart, $lte: now },
            }),
            Task.countDocuments({
              assigneeId: new mongoose.Types.ObjectId(uid),
              completedAt: null,
              dueDate: { $lt: now },
            }),
            Meeting.countDocuments({
              "participants.userId": new mongoose.Types.ObjectId(uid),
              status: "scheduled",
              scheduledAt: { $gte: now, $lte: thisWeekEnd },
            }),
          ]);

          const content = `**Weekly Summary**\nLast week: ${completedCount} tasks completed${overdueCount > 0 ? `, ${overdueCount} overdue` : ""}.\nThis week: ${upcomingMeetings} meetings scheduled.`;

          await postAgentMessage(cid, uid, content);
          log.info({ userId: uid }, "Weekly pattern summary sent");
        } catch (err) {
          log.error({ err, convId: conv._id }, "Weekly pattern: participant error");
        }
      }
    }
  } catch (err) {
    log.error({ err }, "triggerWeeklyPatternSummary failed");
  }
}

/* ─── 7. Unread Conversation Highlights ─── */

export async function triggerUnreadHighlights(): Promise<void> {
  try {
    await connectDB();
    const Conversation = (await import("@/lib/infra/db/models/conversation")).default;
    const DirectMessage = (await import("@/lib/infra/db/models/direct-message")).default;

    const conversations = await Conversation.find({
      "participants.agentEnabled": true,
    })
      .limit(50)
      .lean();

    for (const conv of conversations) {
      for (const p of conv.participants) {
        if (!p.agentEnabled) continue;

        try {
          const uid = p.userId.toString();
          const cid = conv._id.toString();

          if (await isAgentMuted(cid, uid)) continue;
          if (!(await canSendProactive(cid, uid, "unread_highlights"))) continue;

          const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
          const unreadCount = await DirectMessage.countDocuments({
            conversationId: conv._id,
            senderId: { $ne: new mongoose.Types.ObjectId(uid) },
            createdAt: { $gte: fourHoursAgo },
          });

          if (unreadCount < 5) continue;

          const content = `You have ${unreadCount} new messages in this conversation. Want a quick summary?`;
          await postAgentMessage(cid, uid, content);
          log.info({ userId: uid, unreadCount }, "Unread highlights sent");
        } catch (err) {
          log.error({ err, convId: conv._id }, "Unread highlights: participant error");
        }
      }
    }
  } catch (err) {
    log.error({ err }, "triggerUnreadHighlights failed");
  }
}

/* ─── 8. Post-Meeting Cascade ─── */

export async function triggerPostMeetingCascade(): Promise<void> {
  try {
    await connectDB();
    const Meeting = (await import("@/lib/infra/db/models/meeting")).default;
    const Conversation = (await import("@/lib/infra/db/models/conversation")).default;
    const { executeMeetingCascade } = await import("@/lib/ai/meeting-cascade");

    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);

    // Only find meetings that haven't had cascade executed yet (idempotency guard)
    const meetings = await Meeting.find({
      status: "ended",
      endedAt: { $gte: fifteenMinAgo },
      mom: { $exists: true },
      cascadeExecutedAt: { $exists: false },
    }).lean();

    log.info({ count: meetings.length }, "Post-meeting cascade: meetings found");

    for (const meeting of meetings) {
      try {
        // Mark cascade as executed BEFORE running it to prevent duplicate runs
        // even if a concurrent cron fires
        await Meeting.updateOne(
          { _id: meeting._id, cascadeExecutedAt: { $exists: false } },
          { $set: { cascadeExecutedAt: new Date() } },
        );

        const conv = await Conversation.findOne({ meetingId: meeting._id }).lean();
        if (!conv) continue;

        // Find the first eligible participant to execute the cascade ONCE per meeting
        const eligibleParticipants = (conv.participants || []).filter((p) => p.agentEnabled);
        if (eligibleParticipants.length === 0) continue;

        const firstUid = eligibleParticipants[0].userId.toString();
        const cid = conv._id.toString();

        // Execute cascade once using the first eligible participant
        const result = await executeMeetingCascade(firstUid, String(meeting._id));

        const stepSummaries = result.steps
          .filter((s) => s.status === "done")
          .map((s) => `- ${s.summary}`)
          .join("\n");

        const undoNote =
          result.undoTokens.length > 0
            ? "\n\nYou can undo any of these actions — just ask."
            : "";

        const content = `**Post-Meeting Cascade: ${meeting.title}**\n\n${stepSummaries}${undoNote}`;

        const cascadeCard = {
          type: "meeting_cascade" as const,
          meetingTitle: meeting.title,
          steps: result.steps.map((s) => ({
            step: s.step,
            status: s.status,
            summary: s.summary,
            undoToken: s.undoToken,
          })),
        };

        // Notify all eligible participants about the cascade results
        for (const p of eligibleParticipants) {
          try {
            const uid = p.userId.toString();

            if (await isAgentMuted(cid, uid)) continue;
            if (!(await canSendProactive(cid, uid, "post_meeting_cascade"))) continue;

            await postAgentMessage(cid, uid, content, { cards: [cascadeCard] });
            log.info({ meetingId: meeting._id, userId: uid }, "Post-meeting cascade sent");
          } catch (err) {
            log.error({ err, meetingId: meeting._id }, "Post-meeting cascade: participant error");
          }
        }
      } catch (err) {
        log.error({ err, meetingId: meeting._id }, "Post-meeting cascade: meeting error");
      }
    }
  } catch (err) {
    log.error({ err }, "triggerPostMeetingCascade failed");
  }
}

/* ─── Scheduled Actions ─── */

export async function triggerScheduledActions(): Promise<void> {
  try {
    await connectDB();
    const ScheduledAction = (await import("@/lib/infra/db/models/scheduled-action")).default;
    const Conversation = (await import("@/lib/infra/db/models/conversation")).default;

    const dueActions = await ScheduledAction.find({
      status: "pending",
      triggerAt: { $lte: new Date() },
    })
      .limit(20)
      .lean();

    if (dueActions.length === 0) return;

    log.info({ count: dueActions.length }, "Firing scheduled actions");

    for (const action of dueActions) {
      try {
        const uid = action.userId.toString();

        const conv = await Conversation.findOne({
          participants: { $elemMatch: { userId: action.userId, agentEnabled: true } },
        }).lean();

        if (conv) {
          const content = `⏰ **Scheduled reminder:** ${action.summary}\n\n${action.action}`;
          await postAgentMessage(conv._id.toString(), uid, content);
        }

        await ScheduledAction.updateOne(
          { _id: action._id },
          { $set: { status: "fired", firedAt: new Date() } },
        );

        log.info({ actionId: action._id, userId: uid }, "Scheduled action fired");
      } catch (err) {
        log.error({ err, actionId: action._id }, "Failed to fire scheduled action");
      }
    }
  } catch (err) {
    log.error({ err }, "triggerScheduledActions failed");
  }
}

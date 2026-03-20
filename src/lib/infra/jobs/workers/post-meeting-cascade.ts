import type { Job } from "bullmq";
import mongoose from "mongoose";
import type { PostMeetingCascadePayload } from "../types";
import connectDB from "@/lib/infra/db/client";
import Meeting from "@/lib/infra/db/models/meeting";
import MeetingAnalytics from "@/lib/infra/db/models/meeting-analytics";
import Transcript from "@/lib/infra/db/models/transcript";
import Task from "@/lib/infra/db/models/task";
import Conversation from "@/lib/infra/db/models/conversation";
import DirectMessage from "@/lib/infra/db/models/direct-message";
import { getRedisClient } from "@/lib/infra/redis/client";
import { updateEvent } from "@/lib/google/calendar";
import { getClient, getModelName } from "@/lib/ai/gemini";
import { geminiBreaker } from "@/lib/infra/circuit-breaker";
import { getPersonalBoard } from "@/lib/board/tools";
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

interface MeetingParticipant {
  userId: mongoose.Types.ObjectId;
  role: string;
  status: string;
}

interface MeetingWithMom {
  _id: mongoose.Types.ObjectId;
  title?: string;
  code?: string;
  hostId: mongoose.Types.ObjectId;
  participants: MeetingParticipant[];
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
 * 0. Sync calendar end time
 * 1. Post "Meeting ended." system message
 * 1.5. Auto-generate MoM from transcript via Gemini (if copilot didn't generate one)
 * 2. Post MoM to conversation
 * 3. Auto-create tasks from action items on host's board
 * 4. Update calendar event with MoM summary
 * 5. Generate meeting analytics
 * 6. Suggest follow-up meeting based on next steps
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

  // Conversation may not exist for solo meetings or if the join didn't create one.
  // Continue anyway — MoM generation, analytics, and calendar sync don't need it.
  const convId = conv?._id as mongoose.Types.ObjectId | undefined;
  if (!convId) {
    jobLog.info("no conversation linked to meeting — chat steps will be skipped");
  }

  // ── Fetch meeting data ─────────────────────────────────────────────

  const meeting = (await Meeting.findById(meetingId)
    .select("title code hostId participants mom calendarEventId startedAt scheduledAt createdAt endedAt")
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
    if (meeting.calendarEventId) {
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

  if (convId) {
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
  }

  // ── Step 1.5: Auto-generate MoM from transcript if missing ────────
  // If the meeting copilot wasn't used during the meeting, generate MoM
  // from the real-time STT transcript via Gemini.

  try {
    if (!meeting.mom?.summary) {
      const transcript = await Transcript.findOne({
        meetingId: new mongoose.Types.ObjectId(meetingId),
      }).lean();

      if (transcript && transcript.segments.length > 0) {
        const textSegments = transcript.segments
          .filter((s) => s.text && s.text.trim())
          .sort((a, b) => a.timestamp - b.timestamp);

        if (textSegments.length > 0) {
          const transcriptText = textSegments
            .map((s) => `[${s.speakerName}]: ${s.text}`)
            .join("\n");

          const ai = getClient();
          const model = getModelName();

          const prompt = `You are analyzing a meeting transcript. Generate structured minutes of meeting (MOM).

Meeting title: ${meeting.title || "Untitled Meeting"}

Transcript:
${transcriptText.slice(0, 30000)}

Respond ONLY with valid JSON (no markdown, no code fences):
{
  "summary": "Brief 2-3 sentence summary of the meeting",
  "keyDecisions": ["decision 1", "decision 2"],
  "discussionPoints": ["point 1", "point 2"],
  "actionItems": [{"task": "description", "assignee": "speaker name", "dueDate": "suggested date or TBD"}],
  "nextSteps": ["next step 1", "next step 2"]
}

If the transcript is too short or unclear, still provide your best analysis.`;

          const result = await geminiBreaker.execute(() =>
            ai.models.generateContent({
              model,
              contents: [{ role: "user", parts: [{ text: prompt }] }],
            }),
          );

          const responseText = result.text || "";

          let generatedMom: MeetingMom;
          try {
            const cleaned = responseText
              .replace(/```json\s*/gi, "")
              .replace(/```\s*/g, "")
              .trim();
            generatedMom = JSON.parse(cleaned);
          } catch {
            jobLog.warn("failed to parse Gemini MOM response, using raw text");
            generatedMom = {
              summary: responseText.slice(0, 500),
              keyDecisions: [],
              actionItems: [],
              nextSteps: [],
            };
          }

          // Save MoM to meeting document
          await Meeting.updateOne(
            { _id: new mongoose.Types.ObjectId(meetingId) },
            { $set: { mom: generatedMom } },
          );

          // Update our local reference so subsequent steps use it
          meeting.mom = generatedMom;

          jobLog.info("auto-generated MoM from transcript via Gemini");
        }
      } else {
        jobLog.info("no transcript segments available, skipping MoM generation");
      }
    } else {
      jobLog.info("MoM already exists (from copilot), skipping auto-generation");
    }
  } catch (err) {
    jobLog.error({ err }, "step 1.5 failed: auto-generate MoM from transcript");
    // Non-critical — don't block subsequent steps
  }

  // ── Step 2: Post MoM if available (idempotent) ────────────────────

  if (convId) {
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
  }

  // ── Step 3: Auto-create tasks from action items (idempotent) ──────

  try {
    if (meeting.mom?.actionItems?.length) {
      // Check if tasks were already created for this meeting
      const existingTasks = await Task.findOne({
        meetingId: new mongoose.Types.ObjectId(meetingId),
        "source.type": "meeting-mom",
      })
        .select("_id")
        .lean();

      if (!existingTasks) {
        const actionItems = meeting.mom.actionItems;

        // Get the host's personal board to create tasks on
        const board = await getPersonalBoard(hostId);
        if (board) {
          const firstColumnId = board.columns[0]?.id;
          if (firstColumnId) {
            // Get the last position in the column
            const lastTask = await Task.findOne({
              boardId: board._id,
              columnId: firstColumnId,
            })
              .sort({ position: -1 })
              .select("position")
              .lean();
            let position = lastTask ? lastTask.position + 1024 : 1024;

            const createdTasks = [];
            for (const item of actionItems) {
              const task = await Task.create({
                boardId: board._id,
                columnId: firstColumnId,
                position,
                title: item.task,
                description: `From meeting: ${meeting.title || "Untitled"}\nAssignee: ${item.assignee}\nDue: ${item.dueDate}`,
                priority: "medium",
                creatorId: hostObjectId,
                labels: ["meeting-action-item"],
                meetingId: new mongoose.Types.ObjectId(meetingId),
                dueDate: item.dueDate && item.dueDate !== "TBD"
                  ? new Date(item.dueDate)
                  : undefined,
                source: { type: "meeting-mom", sourceId: meetingId },
              });
              createdTasks.push(task);
              position += 1024;
            }

            // Post notification in chat (only if conversation exists)
            if (convId) {
            const taskList = createdTasks
              .map((t) => `- ${t.title}`)
              .join("\n");

            const notifyContent = [
              `**Tasks created from "${meeting.title}"**`,
              "",
              `I automatically created ${createdTasks.length} task(s) from the meeting action items:`,
              taskList,
              "",
              "Check your board to manage them.",
            ].join("\n");

            const notifyMsg = await DirectMessage.create({
              conversationId: convId,
              senderId: hostObjectId,
              senderType: "agent",
              content: notifyContent,
              type: "agent",
              agentMeta: { forUserId: hostObjectId },
            });

            await Conversation.updateOne(
              { _id: convId },
              {
                $set: {
                  lastMessageAt: notifyMsg.createdAt,
                  lastMessagePreview: `${createdTasks.length} tasks created from meeting`,
                  lastMessageSenderId: notifyMsg.senderId,
                },
              },
            );

            await publishChatEvent(convId, notifyMsg, jobLog);
            }
            jobLog.info(
              { count: createdTasks.length },
              "auto-created tasks from action items",
            );
          } else {
            jobLog.warn("board has no columns, skipping task creation");
          }
        } else {
          jobLog.warn("could not get personal board for host, skipping task creation");
        }
      } else {
        jobLog.info("tasks already created for this meeting, skipping step 3");
      }
    }
  } catch (err) {
    jobLog.error({ err }, "step 3 failed: auto-create tasks");
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

  // ── Step 5: Generate meeting analytics (idempotent) ────────────────

  try {
    const existingAnalytics = await MeetingAnalytics.findOne({
      meetingId: new mongoose.Types.ObjectId(meetingId),
    })
      .select("_id")
      .lean();

    if (!existingAnalytics) {
      const startTime = meeting.startedAt || meeting.scheduledAt || meeting.createdAt;
      const endedAt = new Date(job.data.endedAt);
      const durationSeconds = Math.max(0, (endedAt.getTime() - startTime.getTime()) / 1000);

      const participantCount = meeting.participants.filter(
        (p) => p.status === "joined" || p.status === "left",
      ).length;

      // Fetch transcript for speaker stats
      const transcript = await Transcript.findOne({
        meetingId: new mongoose.Types.ObjectId(meetingId),
      }).lean();

      const speakerStats: { userId: string; name: string; talkTimeSeconds: number; talkTimePercent: number; wordCount: number; interruptionCount: number; sentimentAvg: number }[] = [];

      if (transcript && transcript.segments.length > 0) {
        // Aggregate per-speaker stats from transcript segments
        const speakerMap = new Map<string, { name: string; totalDuration: number; wordCount: number }>();
        let totalDuration = 0;

        for (const seg of transcript.segments) {
          if (!seg.text || !seg.text.trim()) continue;
          const dur = seg.duration || 0;
          const existing = speakerMap.get(seg.speakerId);
          if (existing) {
            existing.totalDuration += dur;
            existing.wordCount += seg.text.split(/\s+/).length;
          } else {
            speakerMap.set(seg.speakerId, {
              name: seg.speakerName,
              totalDuration: dur,
              wordCount: seg.text.split(/\s+/).length,
            });
          }
          totalDuration += dur;
        }

        for (const [userId, stats] of speakerMap) {
          speakerStats.push({
            userId,
            name: stats.name,
            talkTimeSeconds: Math.round(stats.totalDuration),
            talkTimePercent: totalDuration > 0
              ? Math.round((stats.totalDuration / totalDuration) * 100)
              : 0,
            wordCount: stats.wordCount,
            interruptionCount: 0,
            sentimentAvg: 0,
          });
        }
      }

      // Compute score breakdown
      const mom = meeting.mom;
      const decisionCount = mom?.keyDecisions?.length || 0;
      const actionItemCount = mom?.actionItems?.length || 0;

      const decisionDensity = Math.min(100, decisionCount * 20);
      const actionItemClarity = actionItemCount > 0 ? Math.min(100, actionItemCount * 25) : 0;
      const participationBalance = speakerStats.length > 1
        ? Math.max(0, 100 - speakerStats.reduce((max, s) => Math.max(max, s.talkTimePercent), 0))
        : 50;
      const agendaCoverage = mom?.summary ? 70 : 30;

      const meetingScore = Math.round(
        (agendaCoverage * 0.25 + decisionDensity * 0.25 + actionItemClarity * 0.25 + participationBalance * 0.25),
      );

      await MeetingAnalytics.create({
        meetingId: new mongoose.Types.ObjectId(meetingId),
        userId: new mongoose.Types.ObjectId(hostId),
        duration: Math.round(durationSeconds),
        participantCount,
        speakerStats,
        agendaCoverage,
        decisionCount,
        actionItemCount,
        actionItemsCompleted: 0,
        meetingScore,
        scoreBreakdown: {
          agendaCoverage,
          decisionDensity,
          actionItemClarity,
          participationBalance,
        },
        highlights: [],
        sheetRowAppended: false,
      });

      jobLog.info({ meetingScore, participantCount }, "meeting analytics generated");
    } else {
      jobLog.info("meeting analytics already exists, skipping step 5");
    }
  } catch (err) {
    jobLog.error({ err }, "step 5 failed: generate meeting analytics");
    stepErrors.push({ step: 5, error: err });
  }

  // ── Step 6: Suggest follow-up meeting (idempotent) ─────────────────

  if (convId) {
  try {
    const hasNextSteps = meeting.mom?.nextSteps && meeting.mom.nextSteps.length > 0;
    const hasActionItems = meeting.mom?.actionItems && meeting.mom.actionItems.length > 0;

    if (hasNextSteps || hasActionItems) {
      // Check if suggestion already posted
      const existingSuggestion = await DirectMessage.findOne({
        conversationId: convId,
        senderType: "agent",
        content: { $regex: /^\*\*Follow-up Meeting Suggestion/ },
      })
        .select("_id")
        .lean();

      if (!existingSuggestion) {
        const nextSteps = meeting.mom?.nextSteps || [];
        const actionItems = meeting.mom?.actionItems || [];

        // Suggest a follow-up date (~1 week from now)
        const suggestedDate = new Date();
        suggestedDate.setDate(suggestedDate.getDate() + 7);
        const dateStr = suggestedDate.toLocaleDateString("en-US", {
          weekday: "long",
          month: "short",
          day: "numeric",
        });

        const suggestionContent = [
          `**Follow-up Meeting Suggestion**`,
          "",
          `Based on the outcomes of "${meeting.title}", I recommend scheduling a follow-up:`,
          "",
          nextSteps.length > 0
            ? `**Next Steps to Review:**\n${nextSteps.map((s) => `- ${s}`).join("\n")}`
            : "",
          actionItems.length > 0
            ? `**Action Items to Check:**\n${actionItems.map((a) => `- ${a.task} (${a.assignee})`).join("\n")}`
            : "",
          "",
          `Suggested date: **${dateStr}**`,
          `You can schedule it from the Rooms page.`,
        ]
          .filter(Boolean)
          .join("\n");

        const suggestionMsg = await DirectMessage.create({
          conversationId: convId,
          senderId: hostObjectId,
          senderType: "agent",
          content: suggestionContent,
          type: "agent",
          agentMeta: { forUserId: hostObjectId },
        });

        await Conversation.updateOne(
          { _id: convId },
          {
            $set: {
              lastMessageAt: suggestionMsg.createdAt,
              lastMessagePreview: "Follow-up meeting suggested",
              lastMessageSenderId: suggestionMsg.senderId,
            },
          },
        );

        await publishChatEvent(convId, suggestionMsg, jobLog);
        jobLog.info("posted follow-up meeting suggestion");
      } else {
        jobLog.info("follow-up suggestion already exists, skipping step 6");
      }
    }
  } catch (err) {
    jobLog.error({ err }, "step 6 failed: suggest follow-up meeting");
    stepErrors.push({ step: 6, error: err });
  }
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

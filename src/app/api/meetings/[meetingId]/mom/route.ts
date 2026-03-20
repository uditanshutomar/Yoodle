import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
import { GoogleGenAI } from "@google/genai";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { NotFoundError, BadRequestError, ForbiddenError } from "@/lib/infra/api/errors";
import connectDB from "@/lib/infra/db/client";
import Meeting from "@/lib/infra/db/models/meeting";
import "@/lib/infra/db/models/user";
import Conversation from "@/lib/infra/db/models/conversation";
import DirectMessage from "@/lib/infra/db/models/direct-message";
import { createLogger } from "@/lib/infra/logger";
import { buildMeetingFilter, isHostOrParticipant } from "@/lib/meetings/helpers";

const log = createLogger("api:mom");

// ── MoM generation prompt ───────────────────────────────────────────

const MOM_PROMPT = `You are a meeting minutes generator. Given a meeting transcript, produce structured minutes of meeting (MoM) in JSON format.

Return ONLY valid JSON with this exact structure:
{
  "summary": "2-3 sentence summary of the meeting",
  "keyDecisions": ["decision 1", "decision 2"],
  "discussionPoints": ["topic discussed 1", "topic discussed 2"],
  "actionItems": [
    {"task": "description", "assignee": "person name", "dueDate": "timeframe"}
  ],
  "nextSteps": ["next step 1", "next step 2"]
}

Rules:
- Be concise and factual
- Extract actual decisions made, not just topics discussed
- For action items, identify the person responsible from the transcript
- If no clear deadline was mentioned for an action item, use "TBD"
- If no clear decisions/actions were identified, still return the arrays (they can be empty)
- Do NOT wrap the JSON in markdown code blocks`;

// ── GET: Retrieve existing MoM ──────────────────────────────────────

export const GET = withHandler(
  async (
    req: NextRequest,
    context?: { params: Promise<Record<string, string>> }
  ) => {
    await checkRateLimit(req, "general");
    const userId = await getUserIdFromRequest(req);
    const { meetingId } = (await context!.params) as { meetingId: string };
    await connectDB();

    const meeting = await Meeting.findOne(buildMeetingFilter(meetingId))
      .select("mom hostId participants")
      .lean();

    if (!meeting) throw new NotFoundError("Meeting not found.");

    if (!isHostOrParticipant(meeting as unknown as { hostId: mongoose.Types.ObjectId; participants: { userId: mongoose.Types.ObjectId }[] }, userId)) {
      throw new ForbiddenError("You must be a participant of this meeting to view its minutes.");
    }

    return successResponse({ mom: (meeting as unknown as Record<string, unknown>).mom || null });
  }
);

// ── POST: Generate MoM from transcript ──────────────────────────────

export const POST = withHandler(
  async (
    req: NextRequest,
    context?: { params: Promise<Record<string, string>> }
  ) => {
    await checkRateLimit(req, "general");
    const userId = await getUserIdFromRequest(req);
    const { meetingId } = (await context!.params) as { meetingId: string };
    await connectDB();

    const meeting = await Meeting.findOne(buildMeetingFilter(meetingId))
      .select("_id title type hostId participants calendarEventId")
      .lean();
    if (!meeting) throw new NotFoundError("Meeting not found.");

    // Authorization: only host or participants can generate MoM
    if (!isHostOrParticipant(meeting, userId)) {
      throw new ForbiddenError("You must be a participant of this meeting to generate minutes.");
    }

    // Ghost meetings cannot generate MoM unless converted to regular
    if (meeting.type === "ghost") {
      throw new BadRequestError(
        "Minutes of Meeting cannot be generated for ghost rooms. All participants must vote to convert to a regular room first."
      );
    }

    // Fetch transcript for this meeting
    let TranscriptModel = null;
    try {
      TranscriptModel = (await import("@/lib/infra/db/models/transcript")).default;
    } catch (importErr) {
      log.warn({ err: importErr }, "Failed to import transcript model");
    }

    let transcriptText = "";

    // Try fetching from transcript collection first
    if (TranscriptModel) {
      const transcript = await TranscriptModel.findOne({
        meetingId: meeting._id,
      }).lean();
      if (transcript && (transcript as unknown as Record<string, unknown>).segments) {
        const segments = (transcript as unknown as Record<string, unknown>)
          .segments as Array<{
          speakerName?: string;
          text: string;
        }>;
        transcriptText = segments
          .map(
            (s) => `${s.speakerName || "Unknown"}: ${s.text}`
          )
          .join("\n");
      }
    }

    if (!transcriptText) {
      throw new BadRequestError(
        "No transcript found for this meeting. Record and transcribe the meeting first."
      );
    }

    // Cap transcript length to avoid excessive token usage / API errors
    const MAX_TRANSCRIPT_CHARS = 100_000; // ~25k tokens — well within Gemini limits
    if (transcriptText.length > MAX_TRANSCRIPT_CHARS) {
      transcriptText = transcriptText.slice(0, MAX_TRANSCRIPT_CHARS) + "\n\n[Transcript truncated due to length]";
    }

    // Generate MoM using Gemini
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new BadRequestError("Meeting minutes generation is not available. Please contact your administrator.");

    const ai = new GoogleGenAI({ apiKey });

    const result = await Promise.race([
      ai.models.generateContent({
        model: process.env.GEMINI_MODEL || "gemini-3.1-pro-preview",
        contents: `${MOM_PROMPT}\n\nMeeting title: "${meeting.title}"\n\nTranscript:\n${transcriptText}`,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("MoM generation timed out")), 120_000)
      ),
    ]);

    const responseText = result.text ?? "";

    // Parse and validate the JSON response
    const momResponseSchema = z.object({
      summary: z.string().max(5000).default(""),
      keyDecisions: z.array(z.string().max(1000)).max(50).default([]),
      discussionPoints: z.array(z.string().max(1000)).max(50).default([]),
      actionItems: z.array(z.object({
        task: z.string().max(1000).default(""),
        assignee: z.string().max(200).default("Unassigned"),
        dueDate: z.string().max(100).default("TBD"),
      })).max(100).default([]),
      nextSteps: z.array(z.string().max(1000)).max(50).default([]),
    });

    let mom;
    try {
      // Strip markdown code blocks if present
      const cleaned = responseText
        .replace(/```json\s*/gi, "")
        .replace(/```\s*/g, "")
        .trim();
      const parsed = JSON.parse(cleaned);
      mom = momResponseSchema.parse(parsed);
    } catch (parseErr) {
      log.error({ err: parseErr, responseText: responseText.slice(0, 500) }, "Failed to parse Gemini MoM response");
      throw new BadRequestError("Failed to parse AI-generated meeting minutes. Please try again.");
    }

    // Save MoM to the meeting document
    await Meeting.updateOne(
      { _id: meeting._id },
      {
        $set: {
          mom: {
            summary: mom.summary,
            keyDecisions: mom.keyDecisions,
            discussionPoints: mom.discussionPoints,
            actionItems: mom.actionItems.map((a) => ({
              task: a.task,
              assignee: a.assignee,
              dueDate: a.dueDate,
            })),
            nextSteps: mom.nextSteps,
            generatedAt: new Date(),
            generatedBy: new mongoose.Types.ObjectId(userId),
          },
        },
      }
    );

    // Post task creation suggestions to meeting chat (fire-and-forget)
    (async () => {
      try {
        const conversation = await Conversation.findOne({ meetingId: meeting._id });
        const actionItems: { task: string; assignee: string; dueDate: string }[] = mom.actionItems || [];
        if (!conversation || !actionItems.length) return;

        const actionCount = actionItems.length;
        const itemList = actionItems
          .map((item: { task: string; assignee: string; dueDate: string }, i: number) =>
            `${i + 1}. **${item.task}** → ${item.assignee}${item.dueDate !== "TBD" ? ` (due: ${item.dueDate})` : ""}`)
          .join("\n");

        const content = `📋 **${actionCount} action item(s) from this meeting:**\n\n${itemList}\n\nSay "add these to the board" to create tasks, or ask me about any of them.`;

        const msg = await DirectMessage.create({
          conversationId: conversation._id,
          senderId: meeting.hostId,
          senderType: "system",
          content,
          type: "system",
          agentMeta: { forUserId: meeting.hostId },
        });

        await Conversation.updateOne(
          { _id: conversation._id },
          {
            $set: {
              lastMessageAt: msg.createdAt,
              lastMessagePreview: `📋 ${actionCount} action items from meeting`,
              lastMessageSenderId: meeting.hostId,
            },
          },
        );

        // Publish to Redis for real-time delivery
        const { getRedisClient } = await import("@/lib/infra/redis/client");
        const redis = getRedisClient();
        if (redis) {
          await redis.publish(
            `chat:${conversation._id}`,
            JSON.stringify({ type: "message", data: msg }),
          ).catch((err) => log.warn({ err }, "Redis publish failed"));
        }

        log.info(
          { meetingId: meeting._id, count: actionCount },
          "posted MoM task suggestions to chat"
        );
      } catch (err) {
        log.warn({ err }, "failed to post MoM task suggestions to chat");
      }
    })().catch((err) => log.error({ err, meetingId: meeting._id?.toString() }, "Unhandled error in post-MoM cascade"));

    return successResponse({ mom });
  }
);

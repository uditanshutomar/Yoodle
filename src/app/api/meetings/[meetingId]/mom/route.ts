import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { NotFoundError, BadRequestError } from "@/lib/infra/api/errors";
import connectDB from "@/lib/infra/db/client";
import Meeting from "@/lib/infra/db/models/meeting";
import "@/lib/infra/db/models/user";

// ── Helpers ─────────────────────────────────────────────────────────

const MEETING_CODE_REGEX = /^yoo-[a-z0-9]{3}-[a-z0-9]{3}$/;

function buildMeetingFilter(meetingId: string): Record<string, unknown> {
  if (
    mongoose.Types.ObjectId.isValid(meetingId) &&
    !MEETING_CODE_REGEX.test(meetingId)
  ) {
    return { _id: new mongoose.Types.ObjectId(meetingId) };
  }
  return { code: meetingId.toLowerCase() };
}

// ── MoM generation prompt ───────────────────────────────────────────

const MOM_PROMPT = `You are a meeting minutes generator. Given a meeting transcript, produce structured minutes of meeting (MoM) in JSON format.

Return ONLY valid JSON with this exact structure:
{
  "summary": "2-3 sentence summary of the meeting",
  "keyDecisions": ["decision 1", "decision 2"],
  "discussionPoints": ["topic discussed 1", "topic discussed 2"],
  "actionItems": [
    {"task": "description", "owner": "person name", "due": "timeframe"}
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
    _req: NextRequest,
    context?: { params: Promise<Record<string, string>> }
  ) => {
    const { meetingId } = (await context!.params) as { meetingId: string };
    await connectDB();

    const meeting = await Meeting.findOne(buildMeetingFilter(meetingId))
      .select("mom")
      .lean();

    if (!meeting) throw new NotFoundError("Meeting not found.");

    return successResponse({ mom: (meeting as unknown as Record<string, unknown>).mom || null });
  }
);

// ── POST: Generate MoM from transcript ──────────────────────────────

export const POST = withHandler(
  async (
    req: NextRequest,
    context?: { params: Promise<Record<string, string>> }
  ) => {
    const userId = await getUserIdFromRequest(req);
    const { meetingId } = (await context!.params) as { meetingId: string };
    await connectDB();

    const meeting = await Meeting.findOne(buildMeetingFilter(meetingId));
    if (!meeting) throw new NotFoundError("Meeting not found.");

    // Ghost meetings cannot generate MoM unless converted to regular
    if (meeting.type === "ghost") {
      throw new BadRequestError(
        "Minutes of Meeting cannot be generated for ghost rooms. All participants must vote to convert to a regular room first."
      );
    }

    // Fetch transcript for this meeting
    const { default: TranscriptModel } = await import(
      "@/lib/infra/db/models/transcript"
    ).catch(() => ({ default: null }));

    let transcriptText = "";

    // Try fetching from transcript collection first
    if (TranscriptModel) {
      const transcript = await TranscriptModel.findOne({
        meetingId: meeting._id,
      }).lean();
      if (transcript && (transcript as unknown as Record<string, unknown>).segments) {
        const segments = (transcript as unknown as Record<string, unknown>)
          .segments as Array<{
          speaker?: string;
          speakerName?: string;
          text: string;
        }>;
        transcriptText = segments
          .map(
            (s) => `${s.speaker || s.speakerName || "Unknown"}: ${s.text}`
          )
          .join("\n");
      }
    }

    // Also try the inline API transcription endpoint
    if (!transcriptText) {
      try {
        const base =
          process.env.NEXT_PUBLIC_APP_URL ||
          process.env.NEXT_PUBLIC_BASE_URL ||
          process.env.NEXTAUTH_URL ||
          "http://localhost:3000";
        const res = await fetch(
          `${base}/api/transcription?meetingId=${meeting._id}`,
          {
            headers: { cookie: req.headers.get("cookie") || "" },
          }
        );
        if (res.ok) {
          const data = await res.json();
          const segments = data.data?.segments || [];
          if (segments.length > 0) {
            transcriptText = segments
              .map(
                (s: { speaker: string; text: string }) =>
                  `${s.speaker}: ${s.text}`
              )
              .join("\n");
          }
        }
      } catch {
        // silent
      }
    }

    if (!transcriptText) {
      throw new BadRequestError(
        "No transcript found for this meeting. Record and transcribe the meeting first."
      );
    }

    // Generate MoM using Gemini
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
    });

    const result = await model.generateContent(
      `${MOM_PROMPT}\n\nMeeting title: "${meeting.title}"\n\nTranscript:\n${transcriptText}`
    );

    const responseText = result.response.text();

    // Parse the JSON response
    let mom;
    try {
      // Strip markdown code blocks if present
      const cleaned = responseText
        .replace(/```json\s*/gi, "")
        .replace(/```\s*/g, "")
        .trim();
      mom = JSON.parse(cleaned);
    } catch {
      throw new Error("Failed to parse AI-generated MoM. Please try again.");
    }

    // Save MoM to the meeting document
    await Meeting.updateOne(
      { _id: meeting._id },
      {
        $set: {
          mom: {
            summary: mom.summary || "",
            keyDecisions: mom.keyDecisions || [],
            discussionPoints: mom.discussionPoints || [],
            actionItems: (mom.actionItems || []).map(
              (a: { task: string; owner: string; due: string }) => ({
                task: a.task,
                owner: a.owner || "Unassigned",
                due: a.due || "TBD",
              })
            ),
            nextSteps: mom.nextSteps || [],
            generatedAt: new Date(),
            generatedBy: userId,
          },
        },
      }
    );

    return successResponse({ mom });
  }
);

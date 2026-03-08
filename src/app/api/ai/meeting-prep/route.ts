import { NextRequest } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/db/client";
import Meeting from "@/lib/db/models/meeting";
import Recording from "@/lib/db/models/recording";
import { authenticateRequest } from "@/lib/auth/middleware";
import { generateMeetingPrep } from "@/lib/ai/gemini";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
  notFoundResponse,
  serverErrorResponse,
} from "@/lib/utils/api-response";

// ── Validation ──────────────────────────────────────────────────────

const meetingPrepSchema = z.union([
  z.object({
    meetingId: z.string().min(1, "Meeting ID is required."),
  }),
  z.object({
    meetingTitle: z.string().min(1, "Meeting title is required."),
    participants: z.array(z.string()).min(1, "At least one participant is required."),
    agenda: z.string().optional(),
    previousNotes: z.string().optional(),
  }),
]);

// ── POST /api/ai/meeting-prep ───────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    let userId: string;

    try {
      const payload = await authenticateRequest(request);
      userId = payload.userId;
    } catch {
      return unauthorizedResponse();
    }

    const body = await request.json();

    const parsed = meetingPrepSchema.safeParse(body);
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path.join(".");
        if (!fieldErrors[path]) fieldErrors[path] = [];
        fieldErrors[path].push(issue.message);
      }
      return errorResponse({
        message: "Validation failed.",
        status: 400,
        errors: fieldErrors,
      });
    }

    const data = parsed.data;

    let meetingTitle: string;
    let participants: string[];
    let agenda: string | undefined;
    let previousMeetingNotes: string | undefined;

    if ("meetingId" in data) {
      // Fetch meeting data from the database
      await connectDB();

      const meeting = await Meeting.findById(data.meetingId)
        .populate("hostId", "name displayName")
        .populate("participants.userId", "name displayName")
        .lean();

      if (!meeting) {
        return notFoundResponse("Meeting not found.");
      }

      // Verify user is a participant or host
      // After populate + lean, hostId and participants.userId are plain objects
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const meetingData = meeting as any;
      const isParticipant =
        String(meetingData.hostId?._id || meetingData.hostId) === userId ||
        meetingData.participants.some((p: { userId: string | { _id: string } }) =>
          String(typeof p.userId === "object" ? p.userId._id : p.userId) === userId
        );

      if (!isParticipant) {
        return errorResponse("You are not a participant in this meeting.", 403);
      }

      meetingTitle = meeting.title;
      participants = meetingData.participants.map(
        (p: { userId: { displayName?: string; name?: string } | string }) => {
          if (typeof p.userId === "object" && p.userId !== null) {
            return p.userId.displayName || p.userId.name || "Unknown";
          }
          return "Unknown";
        }
      );
      agenda = meeting.description || undefined;

      // Look for previous recordings with AI minutes for context
      const previousRecordings = await Recording.find({
        meetingId: meeting._id,
        "aiMinutes.status": "complete",
      })
        .sort({ createdAt: -1 })
        .limit(1)
        .lean();

      if (previousRecordings.length > 0) {
        const prevRecording = previousRecordings[0];
        previousMeetingNotes = prevRecording.aiMinutes.summary || undefined;
      }
    } else {
      meetingTitle = data.meetingTitle;
      participants = data.participants;
      agenda = data.agenda;
      previousMeetingNotes = data.previousNotes;
    }

    const result = await generateMeetingPrep({
      title: meetingTitle,
      agenda,
      participants,
      previousMeetingNotes,
    });

    return successResponse(result);
  } catch (error) {
    console.error("[AI Meeting Prep Error]", error);
    return serverErrorResponse("Failed to generate meeting prep.");
  }
}

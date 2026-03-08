import { NextRequest } from "next/server";
import connectDB from "@/lib/db/client";
import Agent from "@/lib/db/models/agent";
import AgentTask from "@/lib/db/models/agent-task";
import Meeting from "@/lib/db/models/meeting";
import MeetingInsight from "@/lib/db/models/meeting-insight";
import Recording from "@/lib/db/models/recording";
import Transcript from "@/lib/db/models/transcript";
import User from "@/lib/db/models/user";
import AIMemory from "@/lib/db/models/ai-memory";
import { authenticateRequest } from "@/lib/auth/middleware";
import { analyzeTranscriptForUser } from "@/lib/ai/agent-services";
import {
  successResponse,
  unauthorizedResponse,
  notFoundResponse,
  serverErrorResponse,
} from "@/lib/utils/api-response";

/**
 * GET /api/agents/insights/:meetingId
 * Get or generate personalized insights for a meeting.
 * If insights don't exist yet, processes the transcript and creates them.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  try {
    let userId: string;
    try {
      const payload = await authenticateRequest(request);
      userId = payload.userId;
    } catch {
      return unauthorizedResponse();
    }

    const { meetingId } = await params;
    await connectDB();

    // Check if insights already exist
    const existing = await MeetingInsight.findOne({ userId, meetingId }).lean();
    if (existing) {
      return successResponse({
        id: existing._id.toString(),
        meetingTitle: existing.meetingTitle,
        myActionItems: existing.myActionItems,
        relevantDecisions: existing.relevantDecisions,
        personalTakeaways: existing.personalTakeaways,
        nextMeetingPrep: existing.nextMeetingPrep,
        workSuggestions: existing.workSuggestions,
        workFlaws: existing.workFlaws,
        relatedFileIds: existing.relatedFileIds,
        processed: existing.processed,
        createdAt: existing.createdAt,
      });
    }

    // Need to generate insights — get the meeting and transcript
    const meeting = await Meeting.findById(meetingId);
    if (!meeting) {
      return notFoundResponse("Meeting not found.");
    }

    // Verify user was a participant
    const isParticipant = meeting.participants.some(
      (p) => p.userId.toString() === userId
    );
    if (!isParticipant && meeting.hostId.toString() !== userId) {
      return notFoundResponse("Meeting not found.");
    }

    // Get transcript text
    let transcriptText = "";

    // Try Recording model first (has fullText)
    const recording = await Recording.findOne({ meetingId }).lean();
    if (recording?.transcript?.fullText) {
      transcriptText = recording.transcript.fullText;
    } else if (recording?.transcript?.segments?.length) {
      transcriptText = recording.transcript.segments
        .map((s) => `${s.speakerName}: ${s.text}`)
        .join("\n");
    }

    // Fallback to Transcript model
    if (!transcriptText) {
      const transcript = await Transcript.findOne({ meetingId }).lean();
      if (transcript?.segments?.length) {
        transcriptText = transcript.segments
          .map((s) => `${s.speaker}: ${s.text}`)
          .join("\n");
      }
    }

    if (!transcriptText) {
      return notFoundResponse("No transcript available for this meeting.");
    }

    // Get user info and pending tasks
    const [user, agent, pendingTasks] = await Promise.all([
      User.findById(userId).lean(),
      Agent.findOne({ userId }),
      AgentTask.find({ userId, status: { $in: ["pending", "in_progress"] } })
        .select("title")
        .lean(),
    ]);

    if (!user) {
      return notFoundResponse("User not found.");
    }

    let agentDoc = agent;
    if (!agentDoc) {
      agentDoc = await Agent.create({ userId, name: "Doodle", status: "active" });
    }

    const userName = user.displayName || user.name;
    const pendingTaskTitles = pendingTasks.map((t) => t.title);

    // Analyze the transcript
    const analysis = await analyzeTranscriptForUser(
      transcriptText,
      userName,
      meeting.title,
      pendingTaskTitles
    );

    // Save the insight
    const insight = await MeetingInsight.create({
      userId,
      agentId: agentDoc._id,
      meetingId,
      meetingTitle: meeting.title,
      myActionItems: analysis.myActionItems.map((a) => a.task),
      relevantDecisions: analysis.relevantDecisions,
      personalTakeaways: analysis.personalTakeaways,
      nextMeetingPrep: analysis.nextMeetingPrep,
      workSuggestions: analysis.workSuggestions,
      workFlaws: analysis.workFlaws,
      relatedFileIds: analysis.mentionedFiles,
      processed: true,
    });

    // Auto-create tasks from action items
    const taskPromises = analysis.myActionItems.map((item) =>
      AgentTask.create({
        userId,
        agentId: agentDoc!._id,
        title: item.task,
        priority: item.priority || "medium",
        source: "meeting_transcript",
        sourceMeetingId: meetingId,
        dueDate: item.deadline ? new Date(item.deadline) : undefined,
      }).catch((err) => {
        console.error("[Auto Task Create Error]", err);
        return null;
      })
    );

    // Store key takeaways as AI memories
    const memoryPromises = analysis.personalTakeaways.slice(0, 5).map((takeaway) =>
      AIMemory.create({
        userId,
        category: "context",
        content: `From meeting "${meeting.title}": ${takeaway}`,
        source: "meeting",
        confidence: 0.85,
        relatedMeetingId: meetingId,
      }).catch((err) => {
        console.error("[Memory Create Error]", err);
        return null;
      })
    );

    await Promise.all([...taskPromises, ...memoryPromises]);

    return successResponse({
      id: insight._id.toString(),
      meetingTitle: insight.meetingTitle,
      myActionItems: insight.myActionItems,
      relevantDecisions: insight.relevantDecisions,
      personalTakeaways: insight.personalTakeaways,
      nextMeetingPrep: insight.nextMeetingPrep,
      workSuggestions: insight.workSuggestions,
      workFlaws: insight.workFlaws,
      relatedFileIds: insight.relatedFileIds,
      processed: insight.processed,
      createdAt: insight.createdAt,
    });
  } catch (error) {
    console.error("[Meeting Insight Error]", error);
    return serverErrorResponse("Failed to generate meeting insights.");
  }
}

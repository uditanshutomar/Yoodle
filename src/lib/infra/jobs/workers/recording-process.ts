import type { Job } from "bullmq";
import { UnrecoverableError } from "bullmq";
import mongoose from "mongoose";
import type { RecordingProcessPayload } from "../types";
import connectDB from "@/lib/infra/db/client";
import Meeting from "@/lib/infra/db/models/meeting";
import Recording from "@/lib/infra/db/models/recording";
import Transcript from "@/lib/infra/db/models/transcript";
import { getGoogleServices } from "@/lib/google/client";
import { withGoogleRetry } from "@/lib/google/retry-wrapper";
import { getClient, getModelName } from "@/lib/ai/gemini";
import { geminiBreaker } from "@/lib/infra/circuit-breaker";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("worker:recording-process");

// ── Processor ───────────────────────────────────────────────────────

/**
 * Recording process worker.
 *
 * Steps:
 * 1. Create Recording document (idempotent — skips if exists)
 * 2. Fetch transcript segments from real-time STT data
 * 3. Build full transcript text and save to Recording
 * 4. Generate AI Minutes (MoM) via Gemini and save to Recording
 * 5. Update meeting's recordingId and mom fields
 *
 * Each step is idempotent — safe to retry.
 */
export async function processRecording(
  job: Job<RecordingProcessPayload>,
): Promise<void> {
  const { meetingId, userId, driveFileId } = job.data;
  const jobLog = log.child({ meetingId, jobId: job.id });
  jobLog.info("starting recording process");

  await connectDB();

  // ── Validate meeting exists ──────────────────────────────────────

  const meeting = await Meeting.findById(meetingId)
    .select("_id title hostId participants recordingId mom")
    .lean();

  if (!meeting) {
    throw new UnrecoverableError(`Meeting ${meetingId} not found`);
  }

  // Verify user is a participant
  const isParticipant =
    meeting.hostId.toString() === userId ||
    meeting.participants.some(
      (p: { userId: { toString: () => string } }) =>
        p.userId.toString() === userId,
    );

  if (!isParticipant) {
    throw new UnrecoverableError(`User ${userId} is not a participant`);
  }

  const stepErrors: { step: number; error: unknown }[] = [];

  // ── Step 1: Create Recording document (idempotent) ───────────────

  let recordingId: mongoose.Types.ObjectId;

  try {
    const existing = await Recording.findOne({
      meetingId: new mongoose.Types.ObjectId(meetingId),
    })
      .select("_id")
      .lean();

    if (existing) {
      recordingId = existing._id;
      jobLog.info("recording document already exists, skipping creation");
    } else {
      // Get file metadata from Google Drive
      let fileSize = 0;
      let mimeType = "video/webm";
      let webViewLink: string | undefined;

      try {
        const { drive } = await getGoogleServices(userId);
        const fileMeta = await withGoogleRetry(() =>
          drive.files.get({
            fileId: driveFileId,
            fields: "size, mimeType, webViewLink",
          }),
        );
        fileSize = parseInt(fileMeta.data.size || "0", 10);
        mimeType = fileMeta.data.mimeType || mimeType;
        webViewLink = fileMeta.data.webViewLink || undefined;
      } catch (err) {
        jobLog.warn({ err }, "failed to get Drive file metadata, using defaults");
      }

      const fileUrl = webViewLink || `https://drive.google.com/file/d/${driveFileId}/view`;

      const recording = await Recording.create({
        meetingId: new mongoose.Types.ObjectId(meetingId),
        duration: 0,
        fileUrl,
        fileSize,
        mimeType,
        transcript: { status: "pending", segments: [], fullText: "" },
        aiMinutes: { status: "pending", summary: "", keyDecisions: [], actionItems: [] },
      });

      recordingId = recording._id;
      jobLog.info({ recordingId: recordingId.toString() }, "created recording document");
    }
  } catch (err) {
    jobLog.error({ err }, "step 1 failed: create recording document");
    // Can't continue without a recording document
    throw err;
  }

  // ── Step 2: Build transcript from real-time STT segments ─────────

  let fullTranscriptText = "";

  try {
    const recording = await Recording.findById(recordingId)
      .select("transcript.status")
      .lean();

    if (recording?.transcript?.status === "complete") {
      // Already processed — fetch the text
      const rec = await Recording.findById(recordingId)
        .select("transcript.fullText")
        .lean();
      fullTranscriptText = rec?.transcript?.fullText || "";
      jobLog.info("transcript already processed, skipping step 2");
    } else {
      // Fetch STT segments from the Transcript collection
      const transcript = await Transcript.findOne({
        meetingId: new mongoose.Types.ObjectId(meetingId),
      }).lean();

      if (transcript && transcript.segments.length > 0) {
        const segments = transcript.segments
          .filter((s) => s.text && s.text.trim())
          .sort((a, b) => a.timestamp - b.timestamp);

        // Build recording transcript segments
        const recordingSegments = segments.map((s) => ({
          speakerId: s.speakerId,
          speakerName: s.speakerName,
          text: s.text,
          startTime: s.timestamp,
          endTime: s.timestamp + (s.duration || 0),
        }));

        // Build full text with speaker attribution
        fullTranscriptText = segments
          .map((s) => `[${s.speakerName}]: ${s.text}`)
          .join("\n");

        // Calculate duration from segments
        const lastSegment = segments[segments.length - 1];
        const duration = lastSegment
          ? lastSegment.timestamp + (lastSegment.duration || 0)
          : 0;

        await Recording.updateOne(
          { _id: recordingId },
          {
            $set: {
              "transcript.status": "complete",
              "transcript.segments": recordingSegments,
              "transcript.fullText": fullTranscriptText,
              "transcript.processedAt": new Date(),
              duration: Math.round(duration),
            },
          },
        );

        jobLog.info(
          { segmentCount: recordingSegments.length },
          "transcript built from STT segments",
        );
      } else {
        // No STT data available — mark as complete with empty transcript
        await Recording.updateOne(
          { _id: recordingId },
          {
            $set: {
              "transcript.status": "complete",
              "transcript.processedAt": new Date(),
            },
          },
        );
        jobLog.info("no STT segments found, transcript marked complete (empty)");
      }
    }
  } catch (err) {
    jobLog.error({ err }, "step 2 failed: build transcript");
    stepErrors.push({ step: 2, error: err });
  }

  // ── Step 3: Generate AI Minutes via Gemini (idempotent) ──────────

  try {
    const recording = await Recording.findById(recordingId)
      .select("aiMinutes.status")
      .lean();

    if (recording?.aiMinutes?.status === "complete") {
      jobLog.info("AI minutes already generated, skipping step 3");
    } else if (!fullTranscriptText) {
      await Recording.updateOne(
        { _id: recordingId },
        {
          $set: {
            "aiMinutes.status": "complete",
            "aiMinutes.summary": "No transcript data available for analysis.",
            "aiMinutes.generatedAt": new Date(),
          },
        },
      );
      jobLog.info("no transcript text, AI minutes marked complete (empty)");
    } else {
      await Recording.updateOne(
        { _id: recordingId },
        { $set: { "aiMinutes.status": "processing" } },
      );

      const ai = getClient();
      const model = getModelName();

      const prompt = `You are analyzing a meeting transcript. Generate structured minutes of meeting (MOM).

Meeting title: ${meeting.title || "Untitled Meeting"}

Transcript:
${fullTranscriptText.slice(0, 30000)}

Respond ONLY with valid JSON (no markdown, no code fences):
{
  "summary": "Brief 2-3 sentence summary of the meeting",
  "keyDecisions": ["decision 1", "decision 2"],
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

      // Parse the JSON response
      let mom: {
        summary: string;
        keyDecisions: string[];
        actionItems: { task: string; assignee: string; dueDate: string }[];
        nextSteps?: string[];
      };

      try {
        // Strip markdown code fences if present
        const cleaned = responseText
          .replace(/```json\s*/gi, "")
          .replace(/```\s*/g, "")
          .trim();
        mom = JSON.parse(cleaned);
      } catch {
        jobLog.warn("failed to parse Gemini MOM response as JSON, using raw text");
        mom = {
          summary: responseText.slice(0, 500),
          keyDecisions: [],
          actionItems: [],
        };
      }

      await Recording.updateOne(
        { _id: recordingId },
        {
          $set: {
            "aiMinutes.status": "complete",
            "aiMinutes.summary": mom.summary || "",
            "aiMinutes.keyDecisions": mom.keyDecisions || [],
            "aiMinutes.actionItems": (mom.actionItems || []).map((a) => ({
              task: a.task || "",
              assignee: a.assignee || "Unassigned",
              dueDate: a.dueDate || "TBD",
            })),
            "aiMinutes.generatedAt": new Date(),
          },
        },
      );

      // Also update the meeting's mom field for the post-meeting cascade
      await Meeting.updateOne(
        { _id: new mongoose.Types.ObjectId(meetingId) },
        {
          $set: {
            mom: {
              summary: mom.summary || "",
              keyDecisions: mom.keyDecisions || [],
              actionItems: (mom.actionItems || []).map((a) => ({
                task: a.task || "",
                assignee: a.assignee || "Unassigned",
                dueDate: a.dueDate || "TBD",
              })),
              nextSteps: mom.nextSteps || [],
            },
          },
        },
      );

      jobLog.info("AI minutes generated and saved");
    }
  } catch (err) {
    jobLog.error({ err }, "step 3 failed: generate AI minutes");
    // Mark as failed so it can be retried
    await Recording.updateOne(
      { _id: recordingId },
      { $set: { "aiMinutes.status": "failed" } },
    ).catch(() => {});
    stepErrors.push({ step: 3, error: err });
  }

  // ── Step 4: Link recording to meeting (idempotent) ───────────────

  try {
    await Meeting.updateOne(
      {
        _id: new mongoose.Types.ObjectId(meetingId),
        recordingId: { $exists: false },
      },
      { $set: { recordingId } },
    );
    jobLog.info("linked recording to meeting");
  } catch (err) {
    jobLog.error({ err }, "step 4 failed: link recording to meeting");
    stepErrors.push({ step: 4, error: err });
  }

  // ── Throw if any step failed so BullMQ retries ───────────────────

  if (stepErrors.length > 0) {
    const failedSteps = stepErrors.map((e) => e.step).join(", ");
    const firstError = stepErrors[0].error;
    jobLog.error(
      { failedSteps, attempt: job.attemptsMade + 1 },
      "recording process had step failures, will retry",
    );
    throw firstError instanceof Error
      ? firstError
      : new Error(`Recording process steps [${failedSteps}] failed`);
  }

  jobLog.info("recording process complete");
}

import { NextRequest } from "next/server";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { BadRequestError, NotFoundError, ForbiddenError } from "@/lib/infra/api/errors";
import connectDB from "@/lib/infra/db/client";
import Meeting from "@/lib/infra/db/models/meeting";
import Transcript from "@/lib/infra/db/models/transcript";
import { hasGoogleAccess } from "@/lib/google/client";
import { uploadRecordingToDrive } from "@/lib/google/drive-recordings";
import { getQueue, QUEUE_NAMES } from "@/lib/infra/jobs/queue";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("api:recordings-upload");

/**
 * POST /api/recordings/upload
 *
 * Receives a recording blob (multipart form data) and uploads it to
 * the user's Google Drive inside a "Yoodle Recordings/{meeting}" folder.
 *
 * Form fields:
 * - file: the recording blob
 * - meetingId: the meeting ID
 * - speechSegments: (optional) JSON array of speech segments for transcription
 */
export const POST = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);

  // Parse multipart form data
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const meetingId = formData.get("meetingId") as string | null;
  const speechSegmentsRaw = formData.get("speechSegments") as string | null;

  if (!file) {
    throw new BadRequestError("Recording file is required.");
  }
  if (!meetingId) {
    throw new BadRequestError("Meeting ID is required.");
  }

  // Verify user is a participant in this meeting
  await connectDB();
  const meeting = await Meeting.findById(meetingId);
  if (!meeting) {
    throw new NotFoundError("Meeting not found.");
  }

  const isParticipant =
    meeting.hostId.toString() === userId ||
    meeting.participants.some(
      (p: { userId: { toString: () => string } }) =>
        p.userId.toString() === userId
    );

  if (!isParticipant) {
    throw new ForbiddenError("You are not a participant in this meeting.");
  }

  if (!meeting.settings?.allowRecording) {
    throw new ForbiddenError("Recording is disabled for this meeting.");
  }

  // Verify user has Google access
  const hasAccess = await hasGoogleAccess(userId);
  if (!hasAccess) {
    throw new BadRequestError(
      "Google Drive is not connected. Please connect your Google account in Settings."
    );
  }

  // Convert File to Buffer
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Generate file name
  const ext = file.type.includes("webm")
    ? "webm"
    : file.type.includes("mp4")
      ? "mp4"
      : file.type.includes("ogg")
        ? "ogg"
        : "webm";

  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 19);

  const fileName = `recording-${timestamp}.${ext}`;

  // Upload to Google Drive
  const driveFile = await uploadRecordingToDrive(userId, meetingId, {
    buffer,
    mimeType: file.type || `video/${ext}`,
    fileName,
    meetingTitle: meeting.title,
  });

  // Store speech segments for speaker-attributed transcription
  if (speechSegmentsRaw) {
    try {
      const segments = JSON.parse(speechSegmentsRaw);
      if (Array.isArray(segments) && segments.length > 0) {
        await Transcript.findOneAndUpdate(
          { meetingId },
          {
            $push: {
              segments: {
                $each: segments.map(
                  (seg: {
                    speakerName: string;
                    speakerId: string;
                    startTime: number;
                    endTime: number;
                  }) => ({
                    speaker: seg.speakerName,
                    speakerId: seg.speakerId,
                    text: "",
                    timestamp: seg.startTime,
                    duration: seg.endTime - seg.startTime,
                  })
                ),
              },
            },
          },
          { upsert: true, new: true }
        );
      }
    } catch {
      // Ignore invalid speech segments — recording still uploaded
    }
  }

  // Enqueue background transcription job
  let transcriptionQueued = true;
  try {
    const recordingQueue = getQueue(QUEUE_NAMES.RECORDING_PROCESS);
    await recordingQueue.add("transcribe-recording", {
      meetingId,
      userId,
      driveFileId: driveFile.fileId,
      fileName: driveFile.name,
    });
  } catch (err) {
    // Queue may not be available (no Redis) — recording still uploaded
    log.warn({ err }, "transcription job not queued");
    transcriptionQueued = false;
  }

  return successResponse({
    fileId: driveFile.fileId,
    fileName: driveFile.name,
    webViewLink: driveFile.webViewLink,
    webContentLink: driveFile.webContentLink,
    transcriptionQueued,
  });
});

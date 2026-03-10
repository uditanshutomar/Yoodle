import { Job } from "bullmq";
import { createLogger } from "@/lib/logger";

const log = createLogger("jobs:recording-process");

interface RecordingProcessData {
  meetingId: string;
  userId: string;
  driveFileId: string;
  fileName: string;
}

/**
 * Post-upload recording processing:
 * 1. Download the recording from Google Drive
 * 2. Transcribe using the configured STT provider
 * 3. Store transcript segments in the Transcript model
 */
export async function recordingProcessProcessor(
  job: Job<RecordingProcessData>,
): Promise<void> {
  const { meetingId, userId, driveFileId, fileName } = job.data;

  log.info({ meetingId, driveFileId, fileName, jobId: job.id }, "Processing recording");

  const { default: connectDB } = await import("@/lib/db/client");
  const { default: Transcript } = await import("@/lib/db/models/transcript");
  const { default: mongoose } = await import("mongoose");
  const { getGoogleServices } = await import("@/lib/google/client");
  const { getSTTProvider } = await import("@/lib/providers/stt");

  await connectDB();

  try {
    // Check if transcript already exists for this meeting
    const existing = await Transcript.findOne({
      meetingId: new mongoose.Types.ObjectId(meetingId),
    });

    if (existing && existing.segments.length > 0) {
      log.info({ meetingId }, "Transcript already exists, skipping");
      return;
    }

    // Download the recording from Google Drive
    log.info({ driveFileId, fileName }, "Downloading recording from Drive");

    const { drive } = await getGoogleServices(userId);
    const response = await drive.files.get(
      { fileId: driveFileId, alt: "media" },
      { responseType: "arraybuffer" },
    );

    const audioBuffer = Buffer.from(response.data as ArrayBuffer);

    if (audioBuffer.length === 0) {
      log.warn({ driveFileId }, "Downloaded file is empty, skipping");
      return;
    }

    log.info(
      { driveFileId, sizeKB: Math.round(audioBuffer.length / 1024) },
      "Recording downloaded, starting transcription",
    );

    // Transcribe using the configured STT provider
    const provider = await getSTTProvider();
    const result = await provider.transcribe(audioBuffer);
    const text = result.text?.trim() || "";

    if (!text) {
      log.info({ meetingId }, "Transcription returned empty text");
      return;
    }

    // Store transcript segments
    const segments = result.segments.map((seg) => ({
      speaker: seg.speaker || "Speaker",
      speakerId: seg.speaker || "unknown",
      text: seg.text,
      timestamp: Math.round(seg.start * 1000),
    }));

    await Transcript.findOneAndUpdate(
      { meetingId: new mongoose.Types.ObjectId(meetingId) },
      {
        $set: { language: "en", fullText: text },
        $push: { segments: { $each: segments } },
      },
      { upsert: true, new: true },
    );

    log.info(
      { meetingId, segmentCount: segments.length, textLength: text.length },
      "Transcription complete and stored",
    );
  } catch (error) {
    log.error({ meetingId, driveFileId, err: error }, "Recording processing failed");
    throw error;
  }
}

import { Job } from "bullmq";
import { createLogger } from "@/lib/logger";

const log = createLogger("jobs:recording-process");

interface RecordingProcessData {
  recordingId: string;
  meetingId: string;
  fileUrl: string;
}

/**
 * Post-upload recording processing:
 * - Update recording status
 * - Trigger transcription if enabled
 * - Generate meeting minutes from transcript
 */
export async function recordingProcessProcessor(
  job: Job<RecordingProcessData>,
): Promise<void> {
  const { recordingId, meetingId } = job.data;

  log.info({ recordingId, meetingId, jobId: job.id }, "Processing recording");

  const { default: connectDB } = await import("@/lib/db/client");
  const { default: Recording } = await import("@/lib/db/models/recording");

  await connectDB();

  try {
    await Recording.findByIdAndUpdate(recordingId, {
      "transcript.status": "processing",
    });

    // TODO: Integrate with STT provider for transcription
    // const sttProvider = getSTTProvider();
    // const result = await sttProvider.transcribe(audioBuffer);

    log.info(
      { recordingId },
      "Recording processing queued (transcription pending provider integration)",
    );

    await Recording.findByIdAndUpdate(recordingId, {
      "transcript.status": "pending",
    });
  } catch (error) {
    log.error({ recordingId, err: error }, "Recording processing failed");

    // Best-effort: mark recording as failed
    await Recording.findByIdAndUpdate(recordingId, {
      "transcript.status": "failed",
      "aiMinutes.status": "failed",
    }).catch(() => {});

    throw error;
  }
}

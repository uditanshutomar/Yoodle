import type {
  STTProvider,
  TranscriptResult,
  TranscriptSegment,
  SpeakerDetectionResult,
} from "./types";

const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1";
const STT_MODEL = "scribe_v1";
const PAUSE_THRESHOLD_SECONDS = 2;

function getApiKey(): string {
  const apiKey = process.env.STT_API_KEY || process.env.ELEVEN_LABS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ElevenLabs STT not configured. Set STT_API_KEY or ELEVEN_LABS_API_KEY."
    );
  }
  return apiKey;
}

function toBuffer(audio: Buffer | ArrayBuffer): Buffer {
  if (audio instanceof ArrayBuffer) {
    return Buffer.from(audio);
  }
  return audio;
}

interface ElevenLabsWord {
  text: string;
  start: number;
  end: number;
  speaker_id?: string | null;
}

interface ElevenLabsTranscriptionResponse {
  text?: string;
  words?: ElevenLabsWord[];
}

/**
 * Group raw word-level results into coherent segments.
 * A new segment starts when the speaker changes or there is a pause
 * longer than the configured threshold.
 */
function groupWordsIntoSegments(words: ElevenLabsWord[]): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  let current: TranscriptSegment | null = null;

  for (const word of words) {
    const speaker = word.speaker_id ?? undefined;

    if (
      current &&
      current.speaker === speaker &&
      word.start - current.end <= PAUSE_THRESHOLD_SECONDS
    ) {
      // Continue the current segment
      current.text += ` ${word.text}`;
      current.end = word.end;
    } else {
      // Start a new segment
      if (current) {
        segments.push(current);
      }
      current = {
        text: word.text,
        start: word.start,
        end: word.end,
        speaker,
      };
    }
  }

  if (current) {
    segments.push(current);
  }

  return segments;
}

async function callTranscriptionAPI(
  buffer: Buffer,
): Promise<ElevenLabsTranscriptionResponse> {
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(buffer)], { type: "audio/webm" });
  formData.append("file", blob, "recording.webm");
  formData.append("model_id", STT_MODEL);
  formData.append("timestamps_granularity", "segment");
  formData.append("diarize", "true");

  const response = await fetch(`${ELEVENLABS_BASE_URL}/speech-to-text`, {
    method: "POST",
    headers: { "xi-api-key": getApiKey() },
    body: formData,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `ElevenLabs STT failed (${response.status}): ${errorBody}`,
    );
  }

  return response.json() as Promise<ElevenLabsTranscriptionResponse>;
}

export class ElevenLabsSTTProvider implements STTProvider {
  readonly name = "elevenlabs";

  async transcribe(
    audio: Buffer | ArrayBuffer,
    options?: { language?: string },
  ): Promise<TranscriptResult> {
    void options;
    const buffer = toBuffer(audio);
    const data = await callTranscriptionAPI(buffer);

    const segments =
      data.words && Array.isArray(data.words)
        ? groupWordsIntoSegments(data.words)
        : [];

    return {
      text: data.text || "",
      segments,
    };
  }

  async detectSpeakers(
    audio: Buffer | ArrayBuffer,
  ): Promise<SpeakerDetectionResult> {
    const result = await this.transcribe(audio);

    const speakerMap = new Map<
      string,
      { start: number; end: number; text?: string }[]
    >();

    for (const segment of result.segments) {
      const speakerId = segment.speaker || "unknown";

      if (!speakerMap.has(speakerId)) {
        speakerMap.set(speakerId, []);
      }

      speakerMap.get(speakerId)!.push({
        start: segment.start,
        end: segment.end,
        text: segment.text,
      });
    }

    const speakers = Array.from(speakerMap.entries()).map(
      ([id, segments]) => ({ id, segments }),
    );

    return { speakers };
  }
}

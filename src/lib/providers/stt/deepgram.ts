import type { STTProvider, TranscriptResult, TranscriptSegment } from "./types";

const DEEPGRAM_BASE_URL = "https://api.deepgram.com/v1";

function getApiKey(): string {
  const apiKey = process.env.STT_API_KEY || process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Deepgram STT not configured. Set STT_API_KEY or DEEPGRAM_API_KEY."
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

interface DeepgramWord {
  word: string;
  start: number;
  end: number;
  speaker?: number;
  confidence?: number;
}

interface DeepgramAlternative {
  transcript: string;
  confidence: number;
  words: DeepgramWord[];
}

interface DeepgramChannel {
  alternatives: DeepgramAlternative[];
}

interface DeepgramResponse {
  results?: {
    channels?: DeepgramChannel[];
  };
}

/**
 * Deepgram STT provider using their Nova-2 model.
 * Supports diarization (speaker detection) and word-level timestamps.
 */
export class DeepgramSTTProvider implements STTProvider {
  readonly name = "deepgram";

  async transcribe(
    audio: Buffer | ArrayBuffer,
    options?: { language?: string },
  ): Promise<TranscriptResult> {
    const buffer = toBuffer(audio);
    const apiKey = getApiKey();

    const params = new URLSearchParams({
      model: "nova-2",
      smart_format: "true",
      diarize: "true",
      punctuate: "true",
    });

    if (options?.language) {
      params.set("language", options.language);
    }

    const response = await fetch(
      `${DEEPGRAM_BASE_URL}/listen?${params.toString()}`,
      {
        method: "POST",
        headers: {
          Authorization: `Token ${apiKey}`,
          "Content-Type": "audio/webm",
        },
        body: new Uint8Array(buffer),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Deepgram STT failed (${response.status}): ${errorBody}`
      );
    }

    const data: DeepgramResponse = await response.json();
    const channel = data.results?.channels?.[0];
    const alternative = channel?.alternatives?.[0];

    if (!alternative) {
      return { text: "", segments: [] };
    }

    const segments = this.groupWordsIntoSegments(alternative.words || []);

    return {
      text: alternative.transcript || "",
      segments,
    };
  }

  private groupWordsIntoSegments(words: DeepgramWord[]): TranscriptSegment[] {
    const segments: TranscriptSegment[] = [];
    let current: TranscriptSegment | null = null;
    const PAUSE_THRESHOLD = 2;

    for (const word of words) {
      const speaker = word.speaker !== undefined
        ? `speaker_${word.speaker}`
        : undefined;

      if (
        current &&
        current.speaker === speaker &&
        word.start - current.end <= PAUSE_THRESHOLD
      ) {
        current.text += ` ${word.word}`;
        current.end = word.end;
      } else {
        if (current) segments.push(current);
        current = {
          text: word.word,
          start: word.start,
          end: word.end,
          speaker,
        };
      }
    }

    if (current) segments.push(current);
    return segments;
  }
}

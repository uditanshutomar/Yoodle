export interface TranscriptSegment {
  text: string;
  start: number;
  end: number;
  speaker?: string;
}

export interface TranscriptResult {
  text: string;
  segments: TranscriptSegment[];
}

export interface SpeakerDetectionResult {
  speakers: {
    id: string;
    segments: { start: number; end: number; text?: string }[];
  }[];
}

export interface STTProvider {
  readonly name: string;
  transcribe(
    audio: Buffer | ArrayBuffer,
    options?: { language?: string },
  ): Promise<TranscriptResult>;
  detectSpeakers?(audio: Buffer | ArrayBuffer): Promise<SpeakerDetectionResult>;
}

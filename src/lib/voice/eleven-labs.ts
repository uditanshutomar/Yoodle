const ELEVEN_LABS_BASE = "https://api.elevenlabs.io/v1";

// Default voice ID — "Rachel" (friendly, casual tone)
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

function getHeaders(): Record<string, string> {
  const apiKey = process.env.ELEVEN_LABS_API_KEY;
  if (!apiKey) throw new Error("ELEVEN_LABS_API_KEY not configured");
  return {
    "xi-api-key": apiKey,
    "Content-Type": "application/json",
  };
}

function getHeadersMultipart(): Record<string, string> {
  const apiKey = process.env.ELEVEN_LABS_API_KEY;
  if (!apiKey) throw new Error("ELEVEN_LABS_API_KEY not configured");
  return {
    "xi-api-key": apiKey,
  };
}

// ── Transcribe Audio (Speech-to-Text) ───────────────────────────────

export async function transcribeAudio(
  audioBuffer: Buffer | ArrayBuffer
): Promise<{
  text: string;
  segments: { text: string; start: number; end: number; speaker?: string }[];
}> {
  const buffer = audioBuffer instanceof ArrayBuffer
    ? Buffer.from(audioBuffer)
    : audioBuffer;

  const formData = new FormData();
  const blob = new Blob([new Uint8Array(buffer)], { type: "audio/webm" });
  formData.append("file", blob, "recording.webm");
  formData.append("model_id", "scribe_v1");
  formData.append("timestamps_granularity", "segment");
  formData.append("diarize", "true");

  const response = await fetch(`${ELEVEN_LABS_BASE}/speech-to-text`, {
    method: "POST",
    headers: getHeadersMultipart(),
    body: formData,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `11 Labs transcription failed (${response.status}): ${errorBody}`
    );
  }

  const data = await response.json();

  // Map 11 Labs response to our format
  const segments: { text: string; start: number; end: number; speaker?: string }[] = [];

  if (data.words && Array.isArray(data.words)) {
    // Group words into segments by speaker changes or natural pauses
    let currentSegment: { text: string; start: number; end: number; speaker?: string } | null = null;

    for (const word of data.words) {
      const speakerId = word.speaker_id ?? undefined;

      if (
        !currentSegment ||
        currentSegment.speaker !== speakerId ||
        word.start - currentSegment.end > 2
      ) {
        if (currentSegment) {
          segments.push(currentSegment);
        }
        currentSegment = {
          text: word.text,
          start: word.start,
          end: word.end,
          speaker: speakerId,
        };
      } else {
        currentSegment.text += ` ${word.text}`;
        currentSegment.end = word.end;
      }
    }

    if (currentSegment) {
      segments.push(currentSegment);
    }
  }

  return {
    text: data.text || "",
    segments,
  };
}

// ── Synthesize Speech (Text-to-Speech) ──────────────────────────────

export async function synthesizeSpeech(
  text: string,
  voiceId: string = DEFAULT_VOICE_ID
): Promise<Buffer> {
  const response = await fetch(
    `${ELEVEN_LABS_BASE}/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.5,
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `11 Labs TTS failed (${response.status}): ${errorBody}`
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ── List Available Voices ───────────────────────────────────────────

export async function getVoices(): Promise<
  { voiceId: string; name: string; category: string }[]
> {
  const response = await fetch(`${ELEVEN_LABS_BASE}/voices`, {
    method: "GET",
    headers: getHeaders(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `11 Labs voices listing failed (${response.status}): ${errorBody}`
    );
  }

  const data = await response.json();

  return (data.voices || []).map(
    (voice: { voice_id: string; name: string; category: string }) => ({
      voiceId: voice.voice_id,
      name: voice.name,
      category: voice.category,
    })
  );
}

// ── Speaker Diarization ─────────────────────────────────────────────

export async function detectSpeakers(
  audioBuffer: Buffer
): Promise<{
  speakers: {
    id: string;
    segments: { start: number; end: number; text?: string }[];
  }[];
}> {
  // Use the transcription endpoint with diarization enabled
  const result = await transcribeAudio(audioBuffer);

  // Group segments by speaker
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

  const speakers = Array.from(speakerMap.entries()).map(([id, segments]) => ({
    id,
    segments,
  }));

  return { speakers };
}

// ─── Shared Types ────────────────────────────────────────────────────

export interface MeetingMinutes {
  summary: string;
  keyPoints: string[];
  actionItems: {
    task: string;
    assignee?: string;
    deadline?: string;
    priority?: "high" | "medium" | "low";
  }[];
  decisions: string[];
  followUps: string[];
}

export interface MeetingPrepNotes {
  talkingPoints: string[];
  questionsToAsk: string[];
  contextSummary: string;
}

export interface ProofreadResult {
  corrected: string;
  suggestions: {
    original: string;
    suggested: string;
    reason: string;
  }[];
}

export interface PlanSummary {
  summary: string;
  steps: string[];
  estimatedTime?: string;
  risks?: string[];
}

export interface TaskEstimate {
  estimatedMinutes: number;
  confidence: "high" | "medium" | "low";
  breakdown?: string[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AssistantContext {
  name: string;
  memories?: string[];
  upcomingMeetings?: string[];
  recentNotes?: string[];
  workspaceContext?: string;
}

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

export interface VoiceInfo {
  voiceId: string;
  name: string;
  category: string;
}

export interface SpeakerDetectionResult {
  speakers: {
    id: string;
    segments: { start: number; end: number; text?: string }[];
  }[];
}

export interface UploadResult {
  url: string;
  key: string;
}

export interface VMInstance {
  id: string;
  mainIp: string;
  status: string;
  vcpuCount?: number;
  ram?: number;
  disk?: number;
  region?: string;
  os?: string;
  label?: string;
  dateCreated?: string;
}

export interface VMBandwidth {
  incomingBytes: number;
  outgoingBytes: number;
}

// ─── Provider Interfaces ─────────────────────────────────────────────

/**
 * LLM Provider — abstracts text generation, streaming, and structured outputs.
 * Implementations: Claude (Anthropic), Gemini (Google), OpenAI
 */
export interface LLMProvider {
  readonly name: string;

  /** One-shot text generation */
  generateText(prompt: string, systemPrompt?: string): Promise<string>;

  /** Streaming text generation */
  generateStream(
    prompt: string,
    systemPrompt?: string,
  ): AsyncIterable<string>;

  /** Generate structured meeting minutes from a transcript */
  generateMeetingMinutes(
    transcript: string,
    meetingTitle?: string,
  ): Promise<MeetingMinutes>;

  /** Generate prep notes for an upcoming meeting */
  generateMeetingPrep(meeting: {
    title: string;
    agenda?: string;
    participants: string[];
    previousMeetingNotes?: string;
  }): Promise<MeetingPrepNotes>;

  /** Multi-turn chat with optional user context */
  chat(
    messages: ChatMessage[],
    context?: AssistantContext,
  ): Promise<string>;

  /** Streaming multi-turn chat */
  chatStream(
    messages: ChatMessage[],
    context?: AssistantContext,
  ): AsyncIterable<string>;

  /** Proofread text and return corrections */
  proofread(text: string): Promise<ProofreadResult>;

  /** Extract action items from free-form text */
  extractActionItems(text: string): Promise<MeetingMinutes["actionItems"]>;

  /** Summarize a plan/document */
  summarizePlan(plan: string): Promise<PlanSummary>;

  /** Estimate time for a task */
  estimateTaskTime(description: string): Promise<TaskEstimate>;
}

/**
 * Speech-to-Text Provider — transcribes audio buffers to text.
 * Implementations: ElevenLabs, Deepgram, OpenAI Whisper
 */
export interface STTProvider {
  readonly name: string;

  /** Transcribe an audio buffer to text with segments */
  transcribe(
    audio: Buffer | ArrayBuffer,
    options?: { language?: string },
  ): Promise<TranscriptResult>;

  /** Detect distinct speakers in audio */
  detectSpeakers?(audio: Buffer | ArrayBuffer): Promise<SpeakerDetectionResult>;
}

/**
 * Text-to-Speech Provider — synthesizes text into audio.
 * Implementations: ElevenLabs, OpenAI TTS
 */
export interface TTSProvider {
  readonly name: string;

  /** Synthesize text into audio buffer */
  synthesize(text: string, voice?: string): Promise<Buffer>;

  /** List available voices */
  getVoices?(): Promise<VoiceInfo[]>;
}

/**
 * Storage Provider — S3-compatible object storage.
 * Implementations: Generic S3 (Vultr, AWS, R2, Minio, etc.)
 */
export interface StorageProvider {
  readonly name: string;

  /** Upload a file and return its URL + key */
  upload(
    key: string,
    data: Buffer,
    contentType: string,
  ): Promise<UploadResult>;

  /** Generate a pre-signed URL for direct download */
  getSignedUrl(key: string, expiresIn?: number): Promise<string>;

  /** Generate a pre-signed URL for direct upload */
  getUploadUrl(
    key: string,
    contentType: string,
    expiresIn?: number,
  ): Promise<string>;

  /** Delete an object */
  delete(key: string): Promise<void>;
}

/**
 * Compute Provider — manages virtual machines for workspaces.
 * Implementations: Vultr (current), can add AWS EC2, DigitalOcean, etc.
 */
export interface ComputeProvider {
  readonly name: string;

  /** Create a new VM instance */
  createInstance(options: {
    label: string;
    region?: string;
    plan?: string;
    sshKeyIds?: string[];
    userData?: string;
  }): Promise<VMInstance>;

  /** Get instance details */
  getInstance(instanceId: string): Promise<VMInstance>;

  /** List all instances */
  listInstances(): Promise<VMInstance[]>;

  /** Start a stopped instance */
  startInstance(instanceId: string): Promise<void>;

  /** Stop a running instance */
  stopInstance(instanceId: string): Promise<void>;

  /** Reboot an instance */
  rebootInstance(instanceId: string): Promise<void>;

  /** Delete an instance permanently */
  deleteInstance(instanceId: string): Promise<void>;

  /** Get bandwidth usage */
  getBandwidth?(instanceId: string): Promise<VMBandwidth>;
}

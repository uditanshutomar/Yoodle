export type ParticipantRole = "host" | "co-host" | "participant";

export type ParticipantStatus = "invited" | "joined" | "left";

export type MeetingStatus = "scheduled" | "live" | "ended" | "cancelled";

export type MeetingType = "regular" | "ghost";

export type ProcessingStatus = "pending" | "processing" | "complete" | "failed";

export type MessageType = "text" | "reaction" | "system";

export interface MeetingParticipant {
  userId: string;
  role: ParticipantRole;
  joinedAt?: string;
  leftAt?: string;
  status: ParticipantStatus;
}

export interface MeetingSettings {
  maxParticipants: number;
  allowRecording: boolean;
  allowScreenShare: boolean;
  waitingRoom: boolean;
  muteOnJoin: boolean;
}

export interface Meeting {
  id: string;
  code: string;
  title: string;
  description?: string;
  hostId: string;
  participants: MeetingParticipant[];
  scheduledAt?: string;
  startedAt?: string;
  endedAt?: string;
  status: MeetingStatus;
  type: MeetingType;
  settings: MeetingSettings;
  recordingId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMeetingInput {
  title: string;
  description?: string;
  type?: MeetingType;
  scheduledAt?: string;
  settings?: Partial<MeetingSettings>;
}

export interface UpdateMeetingInput {
  title?: string;
  description?: string;
  status?: MeetingStatus;
  settings?: Partial<MeetingSettings>;
}

export interface TranscriptSegment {
  speakerId: string;
  speakerName: string;
  text: string;
  startTime: number;
  endTime: number;
}

export interface Transcript {
  status: ProcessingStatus;
  segments: TranscriptSegment[];
  fullText: string;
  processedAt?: string;
}

export interface ActionItem {
  task: string;
  assignee: string;
  deadline: string;
}

export interface AIMinutes {
  status: ProcessingStatus;
  summary: string;
  keyDecisions: string[];
  actionItems: ActionItem[];
  generatedAt?: string;
}

export interface Recording {
  id: string;
  meetingId: string;
  duration: number;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  transcript: Transcript;
  aiMinutes: AIMinutes;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  meetingId: string;
  senderId: string;
  senderName: string;
  content: string;
  type: MessageType;
  replyTo?: string;
  createdAt: string;
}

export interface SendMessageInput {
  content: string;
  type?: MessageType;
  replyTo?: string;
}

export type AIMemoryCategory =
  | "preference"
  | "context"
  | "task"
  | "relationship"
  | "habit";

export type AIMemorySource = "meeting" | "chat" | "manual" | "inferred";

export interface AIMemory {
  id: string;
  userId: string;
  category: AIMemoryCategory;
  content: string;
  source: AIMemorySource;
  confidence: number;
  relatedMeetingId?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * LiveKit data channel message types and helpers.
 *
 * All real-time signaling (chat, reactions, hand raise, host controls,
 * recording status, voice activity) is serialized as JSON over LiveKit
 * data channels. Reliable messages (chat, host controls) use
 * `publishData(..., { reliable: true })`; lossy messages (reactions,
 * voice activity) use `{ reliable: false }`.
 */

// ── Message types ────────────────────────────────────────────────────

export enum DataMessageType {
  CHAT_MESSAGE = "chat:message",
  REACTION = "reaction:send",
  HAND_RAISE = "hand:raise",
  HAND_LOWER = "hand:lower",
  HOST_MUTE = "host:mute",
  HOST_KICK = "host:kick",
  RECORDING_STATUS = "recording:status",
  SPEAKING_START = "voice:speaking-start",
  SPEAKING_STOP = "voice:speaking-stop",
}

// ── Payloads ─────────────────────────────────────────────────────────

export interface ChatMessageData {
  type: DataMessageType.CHAT_MESSAGE;
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  messageType: "text" | "reaction" | "system";
  timestamp: number;
}

export interface ReactionData {
  type: DataMessageType.REACTION;
  userId: string;
  userName: string;
  emoji: string;
  timestamp: number;
}

export interface HandRaiseData {
  type: DataMessageType.HAND_RAISE;
  userId: string;
  userName: string;
  timestamp: number;
}

export interface HandLowerData {
  type: DataMessageType.HAND_LOWER;
  userId: string;
  timestamp: number;
}

export interface HostMuteData {
  type: DataMessageType.HOST_MUTE;
  targetUserId: string;
}

export interface HostKickData {
  type: DataMessageType.HOST_KICK;
  targetUserId: string;
  reason?: string;
}

export interface RecordingStatusData {
  type: DataMessageType.RECORDING_STATUS;
  isRecording: boolean;
  startedBy?: string;
  startedAt?: number;
}

export interface SpeakingStartData {
  type: DataMessageType.SPEAKING_START;
  userId: string;
  timestamp: number;
}

export interface SpeakingStopData {
  type: DataMessageType.SPEAKING_STOP;
  userId: string;
  timestamp: number;
}

// ── Discriminated union ──────────────────────────────────────────────

export type DataMessage =
  | ChatMessageData
  | ReactionData
  | HandRaiseData
  | HandLowerData
  | HostMuteData
  | HostKickData
  | RecordingStatusData
  | SpeakingStartData
  | SpeakingStopData;

// ── Encode / Decode ──────────────────────────────────────────────────

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function encodeMessage(msg: DataMessage): Uint8Array {
  return encoder.encode(JSON.stringify(msg));
}

const VALID_MESSAGE_TYPES = new Set<string>(
  Object.values(DataMessageType),
);

export function decodeMessage(data: Uint8Array): DataMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoder.decode(data));
  } catch {
    console.warn("[data-messages] Received non-JSON data channel payload, ignoring");
    return null;
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("type" in parsed)
  ) {
    console.warn("[data-messages] Invalid data channel message: missing type");
    return null;
  }
  const { type } = parsed as { type: unknown };
  if (typeof type !== "string" || !VALID_MESSAGE_TYPES.has(type)) {
    console.warn("[data-messages] Unknown data channel message type:", type);
    return null;
  }
  return parsed as DataMessage;
}

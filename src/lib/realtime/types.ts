/**
 * Shared type definitions for Yoodle real-time communication.
 * All signaling now goes through LiveKit data channels — see
 * `src/lib/livekit/data-messages.ts` for the message envelope types.
 *
 * These interfaces are kept for domain modelling across the app.
 */

/** User metadata tracked per room. LiveKit identity is the key. */
export interface RoomUser {
  id: string;
  name: string;
  displayName: string;
  avatar?: string | null;
  isVideoEnabled: boolean;
  isAudioEnabled: boolean;
  isScreenSharing: boolean;
  isHandRaised?: boolean;
}

/** Chat message payload */
export interface ChatMessagePayload {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  content: string;
  type: "text" | "reaction" | "system";
  timestamp: number;
}

/** Media state change payload */
export interface MediaStatePayload {
  userId: string;
  isVideoEnabled: boolean;
  isAudioEnabled: boolean;
}

/** Voice activity payload */
export interface VoiceActivityPayload {
  userId: string;
  isSpeaking: boolean;
  audioLevel: number;
}

/** Reaction payload */
export interface ReactionPayload {
  userId: string;
  userName: string;
  emoji: string;
  timestamp: number;
}

/** Screen share payload */
export interface ScreenSharePayload {
  userId: string;
  isSharing: boolean;
}

/** Recording status payload */
export interface RecordingStatusPayload {
  roomId: string;
  isRecording: boolean;
  startedBy?: string;
  startedAt?: number;
}

/** Agent collaboration invite payload */
export interface AgentCollabInvitePayload {
  channelId: string;
  topic: string;
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
}

/** Agent collaboration message payload */
export interface AgentCollabMessagePayload {
  channelId: string;
  fromAgentId: string;
  fromUserId: string;
  fromUserName: string;
  content: string;
  type: "agent" | "user" | "system";
  timestamp: number;
}

/** Agent collaboration closed payload */
export interface AgentCollabClosedPayload {
  channelId: string;
  closedByUserId: string;
}

/** Room join payload */
export interface JoinRoomPayload {
  roomId: string;
  user: {
    id: string;
    name: string;
    displayName: string;
    avatar?: string | null;
  };
}

/** Host mute payload */
export interface HostMutePayload {
  targetUserId: string;
  roomId: string;
}

/** Host kick payload */
export interface HostKickPayload {
  targetUserId: string;
  roomId: string;
  reason?: string;
}

/** Waiting room user */
export interface WaitingRoomUser {
  id: string;
  name: string;
  displayName: string;
  avatar?: string | null;
  joinedWaitingAt: number;
}

/** Waiting room admit/deny payload */
export interface WaitingRoomActionPayload {
  userId: string;
  roomId: string;
}

/** Hand raise payload */
export interface HandRaisePayload {
  userId: string;
  userName: string;
  timestamp: number;
}

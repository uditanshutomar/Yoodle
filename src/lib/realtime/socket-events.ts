/**
 * Socket.io event constants for Yoodle real-time communication.
 * All socket events are namespaced by category for clarity.
 */

export const SOCKET_EVENTS = {
  // Room management
  JOIN_ROOM: "room:join",
  LEAVE_ROOM: "room:leave",
  ROOM_USERS: "room:users",
  USER_JOINED: "room:user-joined",
  USER_LEFT: "room:user-left",

  // WebRTC signaling
  OFFER: "signal:offer",
  ANSWER: "signal:answer",
  ICE_CANDIDATE: "signal:ice-candidate",

  // Media state
  TOGGLE_VIDEO: "media:toggle-video",
  TOGGLE_AUDIO: "media:toggle-audio",
  MEDIA_STATE_CHANGED: "media:state-changed",

  // Voice activity
  VOICE_ACTIVITY: "voice:activity",
  SPEAKING_START: "voice:speaking-start",
  SPEAKING_STOP: "voice:speaking-stop",

  // Chat
  CHAT_MESSAGE: "chat:message",
  CHAT_HISTORY: "chat:history",

  // Reactions
  REACTION: "reaction:send",
  REACTION_RECEIVED: "reaction:received",

  // Screen share
  SCREEN_SHARE_START: "screen:start",
  SCREEN_SHARE_STOP: "screen:stop",

  // Recording
  RECORDING_START: "recording:start",
  RECORDING_STOP: "recording:stop",
  RECORDING_STATUS: "recording:status",

  // Agent collaboration
  AGENT_COLLAB_INVITE: "agent:collab-invite",
  AGENT_COLLAB_MESSAGE: "agent:collab-message",
  AGENT_COLLAB_CLOSED: "agent:collab-closed",
} as const;

export type SocketEvent = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];

/** User metadata tracked per room */
export interface RoomUser {
  id: string;
  socketId: string;
  name: string;
  displayName: string;
  avatar?: string | null;
  isVideoEnabled: boolean;
  isAudioEnabled: boolean;
  isScreenSharing: boolean;
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

/** WebRTC signaling payloads */
export interface SignalOfferPayload {
  targetId: string;
  senderId: string;
  offer: RTCSessionDescriptionInit;
}

export interface SignalAnswerPayload {
  targetId: string;
  senderId: string;
  answer: RTCSessionDescriptionInit;
}

export interface SignalIceCandidatePayload {
  targetId: string;
  senderId: string;
  candidate: RTCIceCandidateInit;
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

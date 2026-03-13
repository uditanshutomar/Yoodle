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

  // Host controls
  HOST_MUTE: "host:mute",
  HOST_KICK: "host:kick",
  HOST_ADMIT: "host:admit",
  HOST_DENY: "host:deny",
  HOST_MUTED: "host:muted",
  HOST_KICKED: "host:kicked",

  // Waiting room
  WAITING_JOIN: "waiting:join",
  WAITING_LIST: "waiting:list",
  WAITING_ADMITTED: "waiting:admitted",
  WAITING_DENIED: "waiting:denied",

  // Hand raise
  HAND_RAISE: "hand:raise",
  HAND_LOWER: "hand:lower",
  HAND_RAISED: "hand:raised",
  HAND_LOWERED: "hand:lowered",

  // Agent collaboration
  AGENT_COLLAB_INVITE: "agent:collab-invite",
  AGENT_COLLAB_MESSAGE: "agent:collab-message",
  AGENT_COLLAB_CLOSED: "agent:collab-closed",

  // Terminal (SSH proxy)
  TERMINAL_CONNECT: "terminal:connect",
  TERMINAL_DATA: "terminal:data",
  TERMINAL_RESIZE: "terminal:resize",
  TERMINAL_DISCONNECT: "terminal:disconnect",
  TERMINAL_CONNECTED: "terminal:connected",
  TERMINAL_ERROR: "terminal:error",
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

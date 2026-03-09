import { Server as SocketIOServer, Socket } from "socket.io";
import { Client as SSHClient, ClientChannel } from "ssh2";
import {
  SOCKET_EVENTS,
  type RoomUser,
  type ChatMessagePayload,
  type JoinRoomPayload,
  type SignalOfferPayload,
  type SignalAnswerPayload,
  type SignalIceCandidatePayload,
  type MediaStatePayload,
  type VoiceActivityPayload,
  type ReactionPayload,
  type ScreenSharePayload,
  type RecordingStatusPayload,
  type AgentCollabInvitePayload,
  type AgentCollabMessagePayload,
  type AgentCollabClosedPayload,
  type HostMutePayload,
  type HostKickPayload,
  type WaitingRoomUser,
  type WaitingRoomActionPayload,
  type HandRaisePayload,
} from "./socket-events";

/** In-memory storage for rooms and their users */
const rooms = new Map<string, Map<string, RoomUser>>();

/** In-memory chat history per room (capped at 500 messages) */
const chatHistory = new Map<string, ChatMessagePayload[]>();

/** Recording status per room */
const recordingStatus = new Map<string, RecordingStatusPayload>();

/** Waiting room per room */
const waitingRooms = new Map<string, Map<string, WaitingRoomUser>>();

/** Host user ID per room (first user who creates the room) */
const roomHosts = new Map<string, string>();

/** Socket ID to user mapping for quick disconnect cleanup */
const socketToUser = new Map<string, { roomId: string; userId: string }>();

/** Socket ID to SSH session mapping for terminal proxy */
const sshSessions = new Map<
  string,
  { client: SSHClient; stream: ClientChannel | null }
>();

function cleanupSSH(socketId: string): void {
  const session = sshSessions.get(socketId);
  if (!session) return;

  try {
    if (session.stream) session.stream.close();
    session.client.end();
  } catch (err) {
    console.error(`[SSH] Cleanup error for ${socketId}:`, err);
  }

  sshSessions.delete(socketId);
  console.log(`[SSH] Session closed for ${socketId}`);
}

const MAX_CHAT_HISTORY = 500;

function getRoomUsers(roomId: string): RoomUser[] {
  const room = rooms.get(roomId);
  if (!room) return [];
  return Array.from(room.values());
}

function addUserToRoom(roomId: string, user: RoomUser): void {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Map());
  }
  rooms.get(roomId)!.set(user.id, user);
  socketToUser.set(user.socketId, { roomId, userId: user.id });

  // First user in the room is the host
  if (!roomHosts.has(roomId)) {
    roomHosts.set(roomId, user.id);
  }
}

function removeUserFromRoom(roomId: string, userId: string): RoomUser | null {
  const room = rooms.get(roomId);
  if (!room) return null;

  const user = room.get(userId);
  if (!user) return null;

  room.delete(userId);
  socketToUser.delete(user.socketId);

  // Clean up empty rooms
  if (room.size === 0) {
    rooms.delete(roomId);
    chatHistory.delete(roomId);
    recordingStatus.delete(roomId);
    waitingRooms.delete(roomId);
    roomHosts.delete(roomId);
  }

  return user;
}

function removeUserBySocketId(socketId: string): {
  roomId: string;
  user: RoomUser;
} | null {
  const mapping = socketToUser.get(socketId);
  if (!mapping) return null;

  const { roomId, userId } = mapping;
  const user = removeUserFromRoom(roomId, userId);
  if (!user) return null;

  return { roomId, user };
}

function addChatMessage(roomId: string, message: ChatMessagePayload): void {
  if (!chatHistory.has(roomId)) {
    chatHistory.set(roomId, []);
  }
  const history = chatHistory.get(roomId)!;
  history.push(message);

  // Cap at MAX_CHAT_HISTORY messages
  if (history.length > MAX_CHAT_HISTORY) {
    history.splice(0, history.length - MAX_CHAT_HISTORY);
  }
}

/** Validate JOIN_ROOM payload */
function isValidJoinPayload(payload: unknown): payload is JoinRoomPayload {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  if (!p.roomId || typeof p.roomId !== "string") return false;
  if (!p.user || typeof p.user !== "object") return false;
  const u = p.user as Record<string, unknown>;
  if (!u.id || typeof u.id !== "string") return false;
  if (!u.name || typeof u.name !== "string") return false;
  return true;
}

/** Validate signaling payloads */
function isValidSignalPayload(payload: unknown): payload is { senderId: string; targetId: string } {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  return typeof p.senderId === "string" && typeof p.targetId === "string";
}

function isHost(roomId: string, userId: string): boolean {
  return roomHosts.get(roomId) === userId;
}

/**
 * Sets up all Socket.io event handlers on the given server instance.
 * Call this once when the HTTP server is created.
 */
export function setupSocketServer(io: SocketIOServer): void {
  io.on("connection", (socket: Socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // --- Room management ---

    socket.on(
      SOCKET_EVENTS.JOIN_ROOM,
      (payload: JoinRoomPayload, callback?: (data: { users: RoomUser[] }) => void) => {
        // Validate payload
        if (!isValidJoinPayload(payload)) {
          console.warn(`[Socket] Invalid JOIN_ROOM payload from ${socket.id}`);
          if (callback) callback({ users: [] });
          return;
        }

        const { roomId, user } = payload;

        const roomUser: RoomUser = {
          id: user.id,
          socketId: socket.id,
          name: user.name,
          displayName: user.displayName || user.name,
          avatar: user.avatar ?? null,
          isVideoEnabled: false,
          isAudioEnabled: false,
          isScreenSharing: false,
        };

        // If user is already in a different room, leave it first
        const existing = socketToUser.get(socket.id);
        if (existing && existing.roomId !== roomId) {
          const removed = removeUserFromRoom(existing.roomId, existing.userId);
          if (removed) {
            socket.leave(existing.roomId);
            io.to(existing.roomId).emit(SOCKET_EVENTS.USER_LEFT, {
              userId: removed.id,
              socketId: removed.socketId,
            });
            io.to(existing.roomId).emit(
              SOCKET_EVENTS.ROOM_USERS,
              getRoomUsers(existing.roomId)
            );
          }
        }

        // Join the socket room
        socket.join(roomId);
        addUserToRoom(roomId, roomUser);

        const currentUsers = getRoomUsers(roomId);

        // Notify existing users about the new user
        socket.to(roomId).emit(SOCKET_EVENTS.USER_JOINED, roomUser);

        // Send current room users to everyone
        io.to(roomId).emit(SOCKET_EVENTS.ROOM_USERS, currentUsers);

        // Send chat history to the joining user
        const history = chatHistory.get(roomId) || [];
        socket.emit(SOCKET_EVENTS.CHAT_HISTORY, history);

        // Send recording status if active
        const recording = recordingStatus.get(roomId);
        if (recording && recording.isRecording) {
          socket.emit(SOCKET_EVENTS.RECORDING_STATUS, recording);
        }

        // Acknowledge with current user list
        if (callback) {
          callback({ users: currentUsers });
        }

        console.log(
          `[Socket] User ${user.displayName || user.name} (${user.id}) joined room ${roomId}. Room size: ${currentUsers.length}`
        );
      }
    );

    socket.on(SOCKET_EVENTS.LEAVE_ROOM, () => {
      const result = removeUserBySocketId(socket.id);
      if (result) {
        socket.leave(result.roomId);
        io.to(result.roomId).emit(SOCKET_EVENTS.USER_LEFT, {
          userId: result.user.id,
          socketId: result.user.socketId,
        });
        io.to(result.roomId).emit(
          SOCKET_EVENTS.ROOM_USERS,
          getRoomUsers(result.roomId)
        );
        console.log(
          `[Socket] User ${result.user.displayName} left room ${result.roomId}`
        );
      }
    });

    // --- WebRTC signaling ---

    socket.on(SOCKET_EVENTS.OFFER, (payload: SignalOfferPayload) => {
      if (!isValidSignalPayload(payload)) return;

      // Verify sender is in a room
      const mapping = socketToUser.get(socket.id);
      if (!mapping) return;

      const targetMapping = findSocketIdByUserId(payload.targetId);
      if (targetMapping) {
        io.to(targetMapping).emit(SOCKET_EVENTS.OFFER, {
          senderId: payload.senderId,
          offer: payload.offer,
        });
      } else {
        // Notify sender that target is not found
        socket.emit("signal:error", {
          type: "offer",
          targetId: payload.targetId,
          error: "Target user not found in room",
        });
      }
    });

    socket.on(SOCKET_EVENTS.ANSWER, (payload: SignalAnswerPayload) => {
      if (!isValidSignalPayload(payload)) return;

      const mapping = socketToUser.get(socket.id);
      if (!mapping) return;

      const targetMapping = findSocketIdByUserId(payload.targetId);
      if (targetMapping) {
        io.to(targetMapping).emit(SOCKET_EVENTS.ANSWER, {
          senderId: payload.senderId,
          answer: payload.answer,
        });
      } else {
        socket.emit("signal:error", {
          type: "answer",
          targetId: payload.targetId,
          error: "Target user not found in room",
        });
      }
    });

    socket.on(
      SOCKET_EVENTS.ICE_CANDIDATE,
      (payload: SignalIceCandidatePayload) => {
        if (!isValidSignalPayload(payload)) return;

        const mapping = socketToUser.get(socket.id);
        if (!mapping) return;

        const targetMapping = findSocketIdByUserId(payload.targetId);
        if (targetMapping) {
          io.to(targetMapping).emit(SOCKET_EVENTS.ICE_CANDIDATE, {
            senderId: payload.senderId,
            candidate: payload.candidate,
          });
        }
        // ICE candidates are best-effort; no error needed if target is gone
      }
    );

    // --- Media state ---

    // Handle the event the client actually emits (MEDIA_STATE_CHANGED)
    socket.on(
      SOCKET_EVENTS.MEDIA_STATE_CHANGED,
      (payload: MediaStatePayload) => {
        const mapping = socketToUser.get(socket.id);
        if (!mapping) return;

        const room = rooms.get(mapping.roomId);
        if (!room) return;

        const user = room.get(mapping.userId);
        if (user) {
          user.isVideoEnabled = payload.isVideoEnabled;
          user.isAudioEnabled = payload.isAudioEnabled;

          socket.to(mapping.roomId).emit(SOCKET_EVENTS.MEDIA_STATE_CHANGED, payload);
        }
      }
    );

    // Keep TOGGLE_VIDEO/TOGGLE_AUDIO for backwards compatibility
    socket.on(
      SOCKET_EVENTS.TOGGLE_VIDEO,
      (payload: { roomId: string; isVideoEnabled: boolean }) => {
        const mapping = socketToUser.get(socket.id);
        if (!mapping) return;

        const room = rooms.get(mapping.roomId);
        if (!room) return;

        const user = room.get(mapping.userId);
        if (user) {
          user.isVideoEnabled = payload.isVideoEnabled;

          const mediaState: MediaStatePayload = {
            userId: user.id,
            isVideoEnabled: user.isVideoEnabled,
            isAudioEnabled: user.isAudioEnabled,
          };

          socket.to(mapping.roomId).emit(SOCKET_EVENTS.MEDIA_STATE_CHANGED, mediaState);
        }
      }
    );

    socket.on(
      SOCKET_EVENTS.TOGGLE_AUDIO,
      (payload: { roomId: string; isAudioEnabled: boolean }) => {
        const mapping = socketToUser.get(socket.id);
        if (!mapping) return;

        const room = rooms.get(mapping.roomId);
        if (!room) return;

        const user = room.get(mapping.userId);
        if (user) {
          user.isAudioEnabled = payload.isAudioEnabled;

          const mediaState: MediaStatePayload = {
            userId: user.id,
            isVideoEnabled: user.isVideoEnabled,
            isAudioEnabled: user.isAudioEnabled,
          };

          socket.to(mapping.roomId).emit(SOCKET_EVENTS.MEDIA_STATE_CHANGED, mediaState);
        }
      }
    );

    // --- Voice activity ---

    socket.on(SOCKET_EVENTS.VOICE_ACTIVITY, (payload: VoiceActivityPayload) => {
      const mapping = socketToUser.get(socket.id);
      if (!mapping) return;

      socket.to(mapping.roomId).emit(SOCKET_EVENTS.VOICE_ACTIVITY, payload);
    });

    socket.on(
      SOCKET_EVENTS.SPEAKING_START,
      (payload: { userId: string; speakerName: string; startTime: number }) => {
        const mapping = socketToUser.get(socket.id);
        if (!mapping) return;

        socket.to(mapping.roomId).emit(SOCKET_EVENTS.SPEAKING_START, payload);
      }
    );

    socket.on(
      SOCKET_EVENTS.SPEAKING_STOP,
      (payload: {
        userId: string;
        speakerName: string;
        startTime: number;
        endTime: number;
      }) => {
        const mapping = socketToUser.get(socket.id);
        if (!mapping) return;

        socket.to(mapping.roomId).emit(SOCKET_EVENTS.SPEAKING_STOP, payload);
      }
    );

    // --- Chat ---

    socket.on(
      SOCKET_EVENTS.CHAT_MESSAGE,
      (payload: Omit<ChatMessagePayload, "timestamp">) => {
        const mapping = socketToUser.get(socket.id);
        if (!mapping) return;

        const message: ChatMessagePayload = {
          ...payload,
          roomId: mapping.roomId,
          timestamp: Date.now(),
        };

        addChatMessage(mapping.roomId, message);
        // Use socket.to() to exclude the sender (client adds it optimistically)
        socket.to(mapping.roomId).emit(SOCKET_EVENTS.CHAT_MESSAGE, message);
      }
    );

    // --- Reactions ---

    socket.on(SOCKET_EVENTS.REACTION, (payload: ReactionPayload) => {
      const mapping = socketToUser.get(socket.id);
      if (!mapping) return;

      const reaction: ReactionPayload = {
        ...payload,
        timestamp: Date.now(),
      };

      socket.to(mapping.roomId).emit(SOCKET_EVENTS.REACTION_RECEIVED, reaction);
    });

    // --- Screen share ---

    socket.on(SOCKET_EVENTS.SCREEN_SHARE_START, () => {
      const mapping = socketToUser.get(socket.id);
      if (!mapping) return;

      const room = rooms.get(mapping.roomId);
      if (!room) return;

      const user = room.get(mapping.userId);
      if (user) {
        user.isScreenSharing = true;

        const payload: ScreenSharePayload = {
          userId: user.id,
          isSharing: true,
        };

        socket.to(mapping.roomId).emit(SOCKET_EVENTS.SCREEN_SHARE_START, payload);
      }
    });

    socket.on(SOCKET_EVENTS.SCREEN_SHARE_STOP, () => {
      const mapping = socketToUser.get(socket.id);
      if (!mapping) return;

      const room = rooms.get(mapping.roomId);
      if (!room) return;

      const user = room.get(mapping.userId);
      if (user) {
        user.isScreenSharing = false;

        const payload: ScreenSharePayload = {
          userId: user.id,
          isSharing: false,
        };

        socket.to(mapping.roomId).emit(SOCKET_EVENTS.SCREEN_SHARE_STOP, payload);
      }
    });

    // --- Recording ---

    socket.on(SOCKET_EVENTS.RECORDING_START, () => {
      const mapping = socketToUser.get(socket.id);
      if (!mapping) return;

      const status: RecordingStatusPayload = {
        roomId: mapping.roomId,
        isRecording: true,
        startedBy: mapping.userId,
        startedAt: Date.now(),
      };

      recordingStatus.set(mapping.roomId, status);
      io.to(mapping.roomId).emit(SOCKET_EVENTS.RECORDING_STATUS, status);
    });

    socket.on(SOCKET_EVENTS.RECORDING_STOP, () => {
      const mapping = socketToUser.get(socket.id);
      if (!mapping) return;

      const status: RecordingStatusPayload = {
        roomId: mapping.roomId,
        isRecording: false,
      };

      recordingStatus.set(mapping.roomId, status);
      io.to(mapping.roomId).emit(SOCKET_EVENTS.RECORDING_STATUS, status);
    });

    // --- Host controls ---

    socket.on(SOCKET_EVENTS.HOST_MUTE, (payload: HostMutePayload) => {
      const mapping = socketToUser.get(socket.id);
      if (!mapping) return;
      if (!isHost(mapping.roomId, mapping.userId)) return;

      const targetSocketId = findSocketIdByUserId(payload.targetUserId);
      if (targetSocketId) {
        io.to(targetSocketId).emit(SOCKET_EVENTS.HOST_MUTED, {
          by: mapping.userId,
        });
        // Update the user's audio state in our tracking
        const room = rooms.get(mapping.roomId);
        if (room) {
          const targetUser = room.get(payload.targetUserId);
          if (targetUser) {
            targetUser.isAudioEnabled = false;
            socket.to(mapping.roomId).emit(SOCKET_EVENTS.MEDIA_STATE_CHANGED, {
              userId: payload.targetUserId,
              isVideoEnabled: targetUser.isVideoEnabled,
              isAudioEnabled: false,
            });
          }
        }
      }
    });

    socket.on(SOCKET_EVENTS.HOST_KICK, (payload: HostKickPayload) => {
      const mapping = socketToUser.get(socket.id);
      if (!mapping) return;
      if (!isHost(mapping.roomId, mapping.userId)) return;

      const targetSocketId = findSocketIdByUserId(payload.targetUserId);
      if (targetSocketId) {
        io.to(targetSocketId).emit(SOCKET_EVENTS.HOST_KICKED, {
          by: mapping.userId,
          reason: payload.reason || "Removed by host",
        });
        // Remove the kicked user
        const removed = removeUserFromRoom(mapping.roomId, payload.targetUserId);
        if (removed) {
          io.to(mapping.roomId).emit(SOCKET_EVENTS.USER_LEFT, {
            userId: removed.id,
            socketId: removed.socketId,
          });
          io.to(mapping.roomId).emit(SOCKET_EVENTS.ROOM_USERS, getRoomUsers(mapping.roomId));
        }
      }
    });

    // --- Waiting room ---

    socket.on(SOCKET_EVENTS.WAITING_JOIN, (payload: { roomId: string; user: WaitingRoomUser }) => {
      const { roomId, user } = payload;
      if (!waitingRooms.has(roomId)) {
        waitingRooms.set(roomId, new Map());
      }
      waitingRooms.get(roomId)!.set(user.id, { ...user, joinedWaitingAt: Date.now() });

      // Notify host
      const hostId = roomHosts.get(roomId);
      if (hostId) {
        const hostSocketId = findSocketIdByUserId(hostId);
        if (hostSocketId) {
          const waitingList = Array.from(waitingRooms.get(roomId)!.values());
          io.to(hostSocketId).emit(SOCKET_EVENTS.WAITING_LIST, { roomId, users: waitingList });
        }
      }
    });

    socket.on(SOCKET_EVENTS.HOST_ADMIT, (payload: WaitingRoomActionPayload) => {
      const mapping = socketToUser.get(socket.id);
      if (!mapping) return;
      if (!isHost(mapping.roomId, mapping.userId)) return;

      const waiting = waitingRooms.get(payload.roomId);
      if (waiting) {
        waiting.delete(payload.userId);
      }

      // Notify the admitted user
      const targetSocketId = findSocketIdByUserId(payload.userId);
      if (targetSocketId) {
        io.to(targetSocketId).emit(SOCKET_EVENTS.WAITING_ADMITTED, { roomId: payload.roomId });
      }

      // Update host's waiting list
      const waitingList = waiting ? Array.from(waiting.values()) : [];
      socket.emit(SOCKET_EVENTS.WAITING_LIST, { roomId: payload.roomId, users: waitingList });
    });

    socket.on(SOCKET_EVENTS.HOST_DENY, (payload: WaitingRoomActionPayload) => {
      const mapping = socketToUser.get(socket.id);
      if (!mapping) return;
      if (!isHost(mapping.roomId, mapping.userId)) return;

      const waiting = waitingRooms.get(payload.roomId);
      if (waiting) {
        waiting.delete(payload.userId);
      }

      // Notify the denied user
      const targetSocketId = findSocketIdByUserId(payload.userId);
      if (targetSocketId) {
        io.to(targetSocketId).emit(SOCKET_EVENTS.WAITING_DENIED, { roomId: payload.roomId });
      }

      // Update host's waiting list
      const waitingList = waiting ? Array.from(waiting.values()) : [];
      socket.emit(SOCKET_EVENTS.WAITING_LIST, { roomId: payload.roomId, users: waitingList });
    });

    // --- Hand raise ---

    socket.on(SOCKET_EVENTS.HAND_RAISE, () => {
      const mapping = socketToUser.get(socket.id);
      if (!mapping) return;

      const room = rooms.get(mapping.roomId);
      if (!room) return;

      const user = room.get(mapping.userId);
      if (user) {
        user.isHandRaised = true;
        const payload: HandRaisePayload = {
          userId: user.id,
          userName: user.displayName,
          timestamp: Date.now(),
        };
        socket.to(mapping.roomId).emit(SOCKET_EVENTS.HAND_RAISED, payload);
      }
    });

    socket.on(SOCKET_EVENTS.HAND_LOWER, () => {
      const mapping = socketToUser.get(socket.id);
      if (!mapping) return;

      const room = rooms.get(mapping.roomId);
      if (!room) return;

      const user = room.get(mapping.userId);
      if (user) {
        user.isHandRaised = false;
        socket.to(mapping.roomId).emit(SOCKET_EVENTS.HAND_LOWERED, {
          userId: user.id,
        });
      }
    });

    // --- Terminal (SSH proxy) ---

    socket.on(
      SOCKET_EVENTS.TERMINAL_CONNECT,
      (payload: { host: string; password: string; cols?: number; rows?: number }) => {
        const { host, password, cols = 80, rows = 24 } = payload;

        // Clean up existing session if any
        cleanupSSH(socket.id);

        console.log(`[SSH] Connecting to ${host} for ${socket.id}`);

        const sshClient = new SSHClient();

        sshClient.on("ready", () => {
          console.log(`[SSH] Authenticated to ${host} for ${socket.id}`);

          sshClient.shell(
            { cols, rows, term: "xterm-256color" },
            (err: Error | undefined, stream: ClientChannel) => {
              if (err) {
                console.error("[SSH] Shell error:", err);
                socket.emit(SOCKET_EVENTS.TERMINAL_ERROR, {
                  message: "Failed to start shell.",
                });
                sshClient.end();
                return;
              }

              sshSessions.set(socket.id, { client: sshClient, stream });
              socket.emit(SOCKET_EVENTS.TERMINAL_CONNECTED);

              stream.on("data", (data: Buffer) => {
                socket.emit(SOCKET_EVENTS.TERMINAL_DATA, data.toString("utf-8"));
              });

              stream.stderr.on("data", (data: Buffer) => {
                socket.emit(SOCKET_EVENTS.TERMINAL_DATA, data.toString("utf-8"));
              });

              stream.on("close", () => {
                console.log(`[SSH] Stream closed for ${socket.id}`);
                socket.emit(SOCKET_EVENTS.TERMINAL_ERROR, {
                  message: "SSH session ended.",
                });
                cleanupSSH(socket.id);
              });
            }
          );
        });

        sshClient.on("error", (err: Error) => {
          console.error(`[SSH] Connection error for ${socket.id}:`, err.message);
          socket.emit(SOCKET_EVENTS.TERMINAL_ERROR, {
            message: `SSH connection failed: ${err.message}`,
          });
          cleanupSSH(socket.id);
        });

        sshClient.on("close", () => {
          console.log(`[SSH] Connection closed for ${socket.id}`);
          cleanupSSH(socket.id);
        });

        sshClient.connect({
          host,
          port: 22,
          username: "root",
          password,
          readyTimeout: 10000,
          keepaliveInterval: 10000,
          keepaliveCountMax: 3,
        });
      }
    );

    socket.on(SOCKET_EVENTS.TERMINAL_DATA, (data: string) => {
      const session = sshSessions.get(socket.id);
      if (session?.stream) {
        session.stream.write(data);
      }
    });

    socket.on(
      SOCKET_EVENTS.TERMINAL_RESIZE,
      (payload: { cols: number; rows: number }) => {
        const session = sshSessions.get(socket.id);
        if (session?.stream) {
          session.stream.setWindow(payload.rows, payload.cols, 0, 0);
        }
      }
    );

    socket.on(SOCKET_EVENTS.TERMINAL_DISCONNECT, () => {
      cleanupSSH(socket.id);
    });

    // --- Agent collaboration ---

    socket.on(
      SOCKET_EVENTS.AGENT_COLLAB_INVITE,
      (payload: AgentCollabInvitePayload) => {
        const mapping = socketToUser.get(socket.id);
        if (!mapping) return;

        // Find target user's socket and send invite directly
        const targetSocketId = findSocketIdByUserId(payload.toUserId);
        if (targetSocketId) {
          io.to(targetSocketId).emit(SOCKET_EVENTS.AGENT_COLLAB_INVITE, payload);
        }
      }
    );

    socket.on(
      SOCKET_EVENTS.AGENT_COLLAB_MESSAGE,
      (payload: AgentCollabMessagePayload) => {
        const mapping = socketToUser.get(socket.id);
        if (!mapping) return;

        // Broadcast to the channel (use channelId as a room)
        socket.to(payload.channelId).emit(SOCKET_EVENTS.AGENT_COLLAB_MESSAGE, payload);
      }
    );

    socket.on(
      SOCKET_EVENTS.AGENT_COLLAB_CLOSED,
      (payload: AgentCollabClosedPayload) => {
        const mapping = socketToUser.get(socket.id);
        if (!mapping) return;

        io.to(payload.channelId).emit(SOCKET_EVENTS.AGENT_COLLAB_CLOSED, payload);
      }
    );

    // --- Disconnect ---

    socket.on("disconnect", (reason: string) => {
      console.log(`[Socket] Client disconnected: ${socket.id} (${reason})`);

      const result = removeUserBySocketId(socket.id);
      if (result) {
        io.to(result.roomId).emit(SOCKET_EVENTS.USER_LEFT, {
          userId: result.user.id,
          socketId: result.user.socketId,
        });
        io.to(result.roomId).emit(
          SOCKET_EVENTS.ROOM_USERS,
          getRoomUsers(result.roomId)
        );
        console.log(
          `[Socket] Cleaned up user ${result.user.displayName} from room ${result.roomId}`
        );
      }
      cleanupSSH(socket.id);
    });
  });

  console.log("[Socket] Socket.io server initialized");
}

/**
 * Find a socket ID by user ID across all rooms.
 */
function findSocketIdByUserId(userId: string): string | null {
  for (const room of rooms.values()) {
    const user = room.get(userId);
    if (user) {
      return user.socketId;
    }
  }
  return null;
}

import { Server as SocketIOServer, Socket } from "socket.io";
import { Client as SSHClient, ClientChannel } from "ssh2";
import mongoose from "mongoose";
import {
  SOCKET_EVENTS,
  type AgentCollabInvitePayload,
  type ChatMessagePayload,
  type HandRaisePayload,
  type HostKickPayload,
  type HostMutePayload,
  type JoinRoomPayload,
  type MediaStatePayload,
  type ReactionPayload,
  type RecordingStatusPayload,
  type RoomUser,
  type ScreenSharePayload,
  type VoiceActivityPayload,
  type WaitingRoomActionPayload,
  type WaitingRoomUser,
} from "./socket-events";
import connectDB from "@/lib/db/client";
import ChatMessage from "@/lib/db/models/chat-message";
import Meeting from "@/lib/db/models/meeting";
import Workspace from "@/lib/db/models/workspace";
import {
  chatGetHistory,
  chatPush,
  recordingGet,
  recordingSet,
  roomAddUser,
  roomGetUser,
  roomGetUsers,
  roomRemoveUser,
  roomUpdateUser,
  socketGetMapping,
  socketMapUser,
  socketRemoveMapping,
  waitingAddUser,
  waitingGetUser,
  waitingGetUsers,
  waitingConsumeAdmission,
  waitingGrantAdmission,
  waitingRemoveUser,
  waitingSize,
} from "@/lib/redis/cache";
import { verifyRealtimeSessionToken, verifyTerminalSessionToken } from "@/lib/auth/service-session";
import { getInstance } from "@/lib/vultr/client";

interface AuthenticatedSocket extends Socket {
  data: Socket["data"] & {
    userId: string;
  };
}

interface TerminalConnectPayload {
  sessionToken: string;
  cols?: number;
  rows?: number;
}

interface WaitingJoinPayload {
  roomId: string;
  user: WaitingRoomUser;
}

interface WaitingUserState extends WaitingRoomUser {
  socketId: string;
}

const MEETING_CODE_REGEX = /^yoo-[a-z0-9]{3}-[a-z0-9]{3}$/;
const MAX_CHAT_HISTORY = 500;
const WAITING_ROOM_CAPACITY = parseInt(process.env.MAX_WAITING_ROOM_SIZE || "50", 10);

const sshSessions = new Map<
  string,
  { client: SSHClient; stream: ClientChannel | null }
>();

function buildMeetingFilter(meetingId: string): Record<string, unknown> {
  if (mongoose.Types.ObjectId.isValid(meetingId) && !MEETING_CODE_REGEX.test(meetingId)) {
    return { _id: new mongoose.Types.ObjectId(meetingId) };
  }

  return { code: meetingId.toLowerCase() };
}

function isValidJoinPayload(payload: unknown): payload is JoinRoomPayload {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  if (!p.roomId || typeof p.roomId !== "string") return false;
  if (!p.user || typeof p.user !== "object") return false;

  const user = p.user as Record<string, unknown>;
  return typeof user.id === "string" && typeof user.name === "string";
}

function cleanupSSH(socketId: string): void {
  const session = sshSessions.get(socketId);
  if (!session) return;

  try {
    session.stream?.close();
    session.client.end();
  } catch (err) {
    console.warn(`[SSH] Cleanup error for ${socketId}:`, err);
  }

  sshSessions.delete(socketId);
}

async function loadChatHistory(roomId: string): Promise<ChatMessagePayload[]> {
  await connectDB();
  const docs = await ChatMessage.find({ meetingCode: roomId })
    .sort({ timestamp: 1 })
    .limit(MAX_CHAT_HISTORY)
    .lean();

  return docs.map((doc) => ({
    id: doc.messageId,
    roomId,
    senderId: doc.senderId,
    senderName: doc.senderName,
    content: doc.content,
    type: doc.type,
    timestamp: doc.timestamp,
  }));
}

async function persistChatMessage(
  roomId: string,
  message: ChatMessagePayload,
): Promise<void> {
  await connectDB();
  await ChatMessage.create({
    meetingCode: roomId,
    messageId: message.id,
    senderId: message.senderId,
    senderName: message.senderName,
    content: message.content,
    type: message.type,
    timestamp: message.timestamp,
  });
}

async function getMeetingPermissions(meetingId: string): Promise<{
  allowRecording: boolean;
  allowScreenShare: boolean;
  waitingRoom: boolean;
}> {
  await connectDB();
  const meeting = await Meeting.findOne(buildMeetingFilter(meetingId))
    .select("settings")
    .lean();

  return {
    allowRecording: meeting?.settings?.allowRecording ?? false,
    allowScreenShare: meeting?.settings?.allowScreenShare ?? true,
    waitingRoom: meeting?.settings?.waitingRoom ?? false,
  };
}

async function isMeetingHost(meetingId: string, userId: string): Promise<boolean> {
  await connectDB();
  const meeting = await Meeting.findOne(buildMeetingFilter(meetingId))
    .select("hostId")
    .lean();

  if (!meeting?.hostId) return false;

  const hostId =
    typeof meeting.hostId === "string"
      ? meeting.hostId
      : (meeting.hostId as mongoose.Types.ObjectId).toString();

  return hostId === userId;
}

async function removeSocketState(
  io: SocketIOServer,
  socket: AuthenticatedSocket,
): Promise<void> {
  const mapping = await socketGetMapping(socket.id);
  if (!mapping) return;

  if (mapping.state === "waiting") {
    await waitingRemoveUser(mapping.roomId, mapping.userId);
    const users = await waitingGetUsers<WaitingRoomUser>(mapping.roomId);

    await connectDB();
    const meeting = await Meeting.findOne(buildMeetingFilter(mapping.roomId))
      .select("hostId")
      .lean()
      .catch(() => null);
    const hostId =
      meeting?.hostId && typeof meeting.hostId !== "string"
        ? meeting.hostId.toString()
        : (meeting?.hostId as string | undefined);
    if (hostId) {
      const hostUser = await roomGetUser<RoomUser>(mapping.roomId, hostId);
      if (hostUser?.socketId) {
        io.to(hostUser.socketId).emit(SOCKET_EVENTS.WAITING_LIST, {
          roomId: mapping.roomId,
          users,
        });
      }
    }
  } else {
    const removedUser = (await roomGetUser(mapping.roomId, mapping.userId)) as
      | RoomUser
      | null;
    await roomRemoveUser(mapping.roomId, mapping.userId);
    socket.leave(mapping.roomId);
    if (removedUser) {
      io.to(mapping.roomId).emit(SOCKET_EVENTS.USER_LEFT, {
        userId: removedUser.id,
        socketId: removedUser.socketId,
      });
    }
    io.to(mapping.roomId).emit(
      SOCKET_EVENTS.ROOM_USERS,
      await roomGetUsers<RoomUser>(mapping.roomId),
    );
  }

  await socketRemoveMapping(socket.id);
}

async function resolveWorkspaceTerminal(
  userId: string,
  workspaceId: string,
): Promise<{ host: string; password: string }> {
  await connectDB();

  const workspace = await Workspace.findById(workspaceId).lean();
  if (!workspace) {
    throw new Error("Workspace not found.");
  }

  const isMember =
    workspace.ownerId.toString() === userId ||
    workspace.members.some((member) => member.userId.toString() === userId);

  if (!isMember) {
    throw new Error("Not authorized for this workspace terminal.");
  }

  if (!workspace.vm?.vultrInstanceId) {
    throw new Error("No VM provisioned.");
  }

  const instance = await getInstance(workspace.vm.vultrInstanceId);
  if (instance.status !== "active") {
    throw new Error(`VM is not running. Current status: ${instance.status}`);
  }

  if (!instance.mainIp || !instance.defaultPassword) {
    throw new Error(
      "VM credentials are not available for terminal access.",
    );
  }

  return {
    host: instance.mainIp,
    password: instance.defaultPassword,
  };
}

export function setupBackendSocketServer(io: SocketIOServer): void {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token || typeof token !== "string") {
        throw new Error("Missing realtime session token.");
      }

      const payload = await verifyRealtimeSessionToken(token);
      (socket as AuthenticatedSocket).data.userId = payload.userId;
      next();
    } catch (error) {
      next(error instanceof Error ? error : new Error("Unauthorized"));
    }
  });

  io.on("connection", (rawSocket: Socket) => {
    const socket = rawSocket as AuthenticatedSocket;
    const authUserId = socket.data.userId;

    socket.on(
      SOCKET_EVENTS.JOIN_ROOM,
      async (payload: JoinRoomPayload, callback?: (data: { users: RoomUser[] }) => void) => {
        if (!isValidJoinPayload(payload) || payload.user.id !== authUserId) {
          callback?.({ users: [] });
          return;
        }

        await removeSocketState(io, socket);

        const { roomId, user } = payload;

        // Enforce waiting room: non-host users must have a valid admission token
        const permissions = await getMeetingPermissions(roomId);
        if (permissions.waitingRoom) {
          const isHost = await isMeetingHost(roomId, user.id);
          if (!isHost) {
            const admitted = await waitingConsumeAdmission(roomId, user.id);
            if (!admitted) {
              callback?.({ users: [] });
              return;
            }
          }
        }

        const roomUser: RoomUser = {
          id: user.id,
          socketId: socket.id,
          name: user.name,
          displayName: user.displayName || user.name,
          avatar: user.avatar ?? null,
          isVideoEnabled: false,
          isAudioEnabled: false,
          isScreenSharing: false,
          isHandRaised: false,
        };

        socket.join(roomId);
        await roomAddUser(roomId, user.id, roomUser);
        await socketMapUser(socket.id, {
          userId: user.id,
          roomId,
          state: "joined",
        });

        const currentUsers = await roomGetUsers<RoomUser>(roomId);

        socket.to(roomId).emit(SOCKET_EVENTS.USER_JOINED, roomUser);
        io.to(roomId).emit(SOCKET_EVENTS.ROOM_USERS, currentUsers);

        let history = await chatGetHistory<ChatMessagePayload>(roomId);
        if (history.length === 0 && !roomId.startsWith("ghost-")) {
          try {
            history = await loadChatHistory(roomId);
            for (const message of history) {
              await chatPush(roomId, message);
            }
          } catch (err) {
            console.warn("[Socket] Failed to load chat history:", err);
          }
        }
        socket.emit(SOCKET_EVENTS.CHAT_HISTORY, history);

        const recording = await recordingGet<RecordingStatusPayload>(roomId);
        if (recording?.isRecording) {
          socket.emit(SOCKET_EVENTS.RECORDING_STATUS, recording);
        }

        if (await isMeetingHost(roomId, user.id)) {
          socket.emit(SOCKET_EVENTS.WAITING_LIST, {
            roomId,
            users: await waitingGetUsers<WaitingRoomUser>(roomId),
          });
        }

        callback?.({ users: currentUsers });
      },
    );

    socket.on(SOCKET_EVENTS.LEAVE_ROOM, async () => {
      await removeSocketState(io, socket);
    });

    // P2P signaling handlers (OFFER, ANSWER, ICE_CANDIDATE) removed —
    // all media now routes through LiveKit SFU.

    socket.on(
      SOCKET_EVENTS.MEDIA_STATE_CHANGED,
      async (payload: MediaStatePayload) => {
        const mapping = await socketGetMapping(socket.id);
        if (!mapping || mapping.state !== "joined" || payload.userId !== authUserId) {
          return;
        }

        await roomUpdateUser(mapping.roomId, mapping.userId, {
          isVideoEnabled: payload.isVideoEnabled,
          isAudioEnabled: payload.isAudioEnabled,
        });

        socket.to(mapping.roomId).emit(SOCKET_EVENTS.MEDIA_STATE_CHANGED, payload);
      },
    );

    socket.on(
      SOCKET_EVENTS.TOGGLE_VIDEO,
      async (payload: { isVideoEnabled: boolean }) => {
        const mapping = await socketGetMapping(socket.id);
        if (!mapping || mapping.state !== "joined") return;

        const currentUser = (await roomGetUser(mapping.roomId, mapping.userId)) as
          | RoomUser
          | null;
        if (!currentUser) return;

        const mediaState: MediaStatePayload = {
          userId: mapping.userId,
          isVideoEnabled: payload.isVideoEnabled,
          isAudioEnabled: currentUser.isAudioEnabled,
        };

        await roomUpdateUser(mapping.roomId, mapping.userId, {
          isVideoEnabled: payload.isVideoEnabled,
        });
        socket.to(mapping.roomId).emit(SOCKET_EVENTS.MEDIA_STATE_CHANGED, mediaState);
      },
    );

    socket.on(
      SOCKET_EVENTS.TOGGLE_AUDIO,
      async (payload: { isAudioEnabled: boolean }) => {
        const mapping = await socketGetMapping(socket.id);
        if (!mapping || mapping.state !== "joined") return;

        const currentUser = (await roomGetUser(mapping.roomId, mapping.userId)) as
          | RoomUser
          | null;
        if (!currentUser) return;

        const mediaState: MediaStatePayload = {
          userId: mapping.userId,
          isVideoEnabled: currentUser.isVideoEnabled,
          isAudioEnabled: payload.isAudioEnabled,
        };

        await roomUpdateUser(mapping.roomId, mapping.userId, {
          isAudioEnabled: payload.isAudioEnabled,
        });
        socket.to(mapping.roomId).emit(SOCKET_EVENTS.MEDIA_STATE_CHANGED, mediaState);
      },
    );

    socket.on(SOCKET_EVENTS.VOICE_ACTIVITY, async (payload: VoiceActivityPayload) => {
      const mapping = await socketGetMapping(socket.id);
      if (!mapping || mapping.state !== "joined") return;

      socket.to(mapping.roomId).emit(SOCKET_EVENTS.VOICE_ACTIVITY, payload);
    });

    socket.on(
      SOCKET_EVENTS.SPEAKING_START,
      async (payload: { userId: string; speakerName: string; startTime: number }) => {
        const mapping = await socketGetMapping(socket.id);
        if (!mapping || mapping.state !== "joined") return;

        socket.to(mapping.roomId).emit(SOCKET_EVENTS.SPEAKING_START, payload);
      },
    );

    socket.on(
      SOCKET_EVENTS.SPEAKING_STOP,
      async (payload: {
        userId: string;
        speakerName: string;
        startTime: number;
        endTime: number;
      }) => {
        const mapping = await socketGetMapping(socket.id);
        if (!mapping || mapping.state !== "joined") return;

        socket.to(mapping.roomId).emit(SOCKET_EVENTS.SPEAKING_STOP, payload);
      },
    );

    socket.on(
      SOCKET_EVENTS.CHAT_MESSAGE,
      async (payload: Omit<ChatMessagePayload, "timestamp">) => {
        const mapping = await socketGetMapping(socket.id);
        if (!mapping || mapping.state !== "joined" || payload.senderId !== authUserId) {
          return;
        }

        // Validate message content length to prevent abuse
        const MAX_CHAT_MESSAGE_LENGTH = 4000;
        if (
          !payload.content ||
          typeof payload.content !== "string" ||
          payload.content.length > MAX_CHAT_MESSAGE_LENGTH
        ) {
          return;
        }

        const message: ChatMessagePayload = {
          ...payload,
          content: payload.content.slice(0, MAX_CHAT_MESSAGE_LENGTH),
          roomId: mapping.roomId,
          timestamp: Date.now(),
        };

        await chatPush(mapping.roomId, message);

        if (!mapping.roomId.startsWith("ghost-")) {
          persistChatMessage(mapping.roomId, message).catch((err) =>
            console.warn("[Socket] Failed to persist chat message:", err),
          );
        }

        socket.to(mapping.roomId).emit(SOCKET_EVENTS.CHAT_MESSAGE, message);
      },
    );

    socket.on(SOCKET_EVENTS.REACTION, async (payload: ReactionPayload) => {
      const mapping = await socketGetMapping(socket.id);
      if (!mapping || mapping.state !== "joined" || payload.userId !== authUserId) {
        return;
      }

      socket.to(mapping.roomId).emit(SOCKET_EVENTS.REACTION_RECEIVED, {
        ...payload,
        timestamp: Date.now(),
      });
    });

    socket.on(SOCKET_EVENTS.SCREEN_SHARE_START, async () => {
      const mapping = await socketGetMapping(socket.id);
      if (!mapping || mapping.state !== "joined") return;

      const permissions = await getMeetingPermissions(mapping.roomId);
      if (!permissions.allowScreenShare) return;

      await roomUpdateUser(mapping.roomId, mapping.userId, {
        isScreenSharing: true,
      });

      socket.to(mapping.roomId).emit(SOCKET_EVENTS.SCREEN_SHARE_START, {
        userId: mapping.userId,
        isSharing: true,
      } as ScreenSharePayload);
    });

    socket.on(SOCKET_EVENTS.SCREEN_SHARE_STOP, async () => {
      const mapping = await socketGetMapping(socket.id);
      if (!mapping || mapping.state !== "joined") return;

      await roomUpdateUser(mapping.roomId, mapping.userId, {
        isScreenSharing: false,
      });

      socket.to(mapping.roomId).emit(SOCKET_EVENTS.SCREEN_SHARE_STOP, {
        userId: mapping.userId,
        isSharing: false,
      } as ScreenSharePayload);
    });

    socket.on(SOCKET_EVENTS.RECORDING_START, async () => {
      const mapping = await socketGetMapping(socket.id);
      if (!mapping || mapping.state !== "joined") return;

      const permissions = await getMeetingPermissions(mapping.roomId);
      if (!permissions.allowRecording) return;

      const status: RecordingStatusPayload = {
        roomId: mapping.roomId,
        isRecording: true,
        startedBy: mapping.userId,
        startedAt: Date.now(),
      };

      await recordingSet(mapping.roomId, status);
      io.to(mapping.roomId).emit(SOCKET_EVENTS.RECORDING_STATUS, status);
    });

    socket.on(SOCKET_EVENTS.RECORDING_STOP, async () => {
      const mapping = await socketGetMapping(socket.id);
      if (!mapping || mapping.state !== "joined") return;

      const status: RecordingStatusPayload = {
        roomId: mapping.roomId,
        isRecording: false,
      };

      await recordingSet(mapping.roomId, status);
      io.to(mapping.roomId).emit(SOCKET_EVENTS.RECORDING_STATUS, status);
    });

    socket.on(SOCKET_EVENTS.HOST_MUTE, async (payload: HostMutePayload) => {
      const mapping = await socketGetMapping(socket.id);
      if (!mapping || mapping.state !== "joined") return;
      if (!(await isMeetingHost(mapping.roomId, authUserId))) return;

      const target = (await roomGetUser(mapping.roomId, payload.targetUserId)) as
        | RoomUser
        | null;
      if (!target?.socketId) return;

      await roomUpdateUser(mapping.roomId, payload.targetUserId, {
        isAudioEnabled: false,
      });

      io.to(target.socketId).emit(SOCKET_EVENTS.HOST_MUTED, {
        by: mapping.userId,
      });
      io.to(mapping.roomId).emit(SOCKET_EVENTS.MEDIA_STATE_CHANGED, {
        userId: payload.targetUserId,
        isVideoEnabled: target.isVideoEnabled,
        isAudioEnabled: false,
      } as MediaStatePayload);
    });

    socket.on(SOCKET_EVENTS.HOST_KICK, async (payload: HostKickPayload) => {
      const mapping = await socketGetMapping(socket.id);
      if (!mapping || mapping.state !== "joined") return;
      if (!(await isMeetingHost(mapping.roomId, authUserId))) return;

      const target = (await roomGetUser(mapping.roomId, payload.targetUserId)) as
        | RoomUser
        | null;
      if (!target?.socketId) return;

      io.to(target.socketId).emit(SOCKET_EVENTS.HOST_KICKED, {
        by: mapping.userId,
        reason: payload.reason || "Removed by host",
      });

      await roomRemoveUser(mapping.roomId, payload.targetUserId);
      await socketRemoveMapping(target.socketId);
      io.to(mapping.roomId).emit(SOCKET_EVENTS.USER_LEFT, {
        userId: payload.targetUserId,
        socketId: target.socketId,
      });
      io.to(mapping.roomId).emit(
        SOCKET_EVENTS.ROOM_USERS,
        await roomGetUsers<RoomUser>(mapping.roomId),
      );
    });

    socket.on(SOCKET_EVENTS.WAITING_JOIN, async (payload: WaitingJoinPayload) => {
      if (
        !payload ||
        typeof payload.roomId !== "string" ||
        payload.user?.id !== authUserId
      ) {
        return;
      }

      const permissions = await getMeetingPermissions(payload.roomId);
      if (!permissions.waitingRoom) return;
      if (await isMeetingHost(payload.roomId, authUserId)) return;

      if ((await waitingSize(payload.roomId)) >= WAITING_ROOM_CAPACITY) {
        socket.emit("waiting:full", {
          roomId: payload.roomId,
          message: "Waiting room is full.",
        });
        return;
      }

      const waitingUser: WaitingUserState = {
        ...payload.user,
        joinedWaitingAt: Date.now(),
        socketId: socket.id,
      };

      await waitingAddUser(payload.roomId, waitingUser.id, waitingUser);
      await socketMapUser(socket.id, {
        userId: waitingUser.id,
        roomId: payload.roomId,
        state: "waiting",
      });

      const meeting = await Meeting.findOne(buildMeetingFilter(payload.roomId))
        .select("hostId")
        .lean()
        .catch(() => null);
      const hostId =
        meeting?.hostId && typeof meeting.hostId !== "string"
          ? meeting.hostId.toString()
          : (meeting?.hostId as string | undefined);

      if (!hostId) return;

      const hostUser = await roomGetUser<RoomUser>(payload.roomId, hostId);
      if (hostUser?.socketId) {
        io.to(hostUser.socketId).emit(SOCKET_EVENTS.WAITING_LIST, {
          roomId: payload.roomId,
          users: await waitingGetUsers<WaitingRoomUser>(payload.roomId),
        });
      }
    });

    socket.on(SOCKET_EVENTS.HOST_ADMIT, async (payload: WaitingRoomActionPayload) => {
      const mapping = await socketGetMapping(socket.id);
      if (!mapping || mapping.state !== "joined") return;
      if (!(await isMeetingHost(mapping.roomId, authUserId))) return;

      const waitingUser = (await waitingGetUser(payload.roomId, payload.userId)) as
        | WaitingUserState
        | null;
      await waitingRemoveUser(payload.roomId, payload.userId);
      await waitingGrantAdmission(payload.roomId, payload.userId);

      if (waitingUser?.socketId) {
        await socketMapUser(waitingUser.socketId, {
          userId: payload.userId,
          roomId: payload.roomId,
          state: "waiting",
        });
        io.to(waitingUser.socketId).emit(SOCKET_EVENTS.WAITING_ADMITTED, {
          roomId: payload.roomId,
        });
      }

      socket.emit(SOCKET_EVENTS.WAITING_LIST, {
        roomId: payload.roomId,
        users: await waitingGetUsers<WaitingRoomUser>(payload.roomId),
      });
    });

    socket.on(SOCKET_EVENTS.HOST_DENY, async (payload: WaitingRoomActionPayload) => {
      const mapping = await socketGetMapping(socket.id);
      if (!mapping || mapping.state !== "joined") return;
      if (!(await isMeetingHost(mapping.roomId, authUserId))) return;

      const waitingUser = (await waitingGetUser(payload.roomId, payload.userId)) as
        | WaitingUserState
        | null;
      await waitingRemoveUser(payload.roomId, payload.userId);

      if (waitingUser?.socketId) {
        await socketRemoveMapping(waitingUser.socketId);
        io.to(waitingUser.socketId).emit(SOCKET_EVENTS.WAITING_DENIED, {
          roomId: payload.roomId,
        });
      }

      socket.emit(SOCKET_EVENTS.WAITING_LIST, {
        roomId: payload.roomId,
        users: await waitingGetUsers<WaitingRoomUser>(payload.roomId),
      });
    });

    socket.on(SOCKET_EVENTS.HAND_RAISE, async () => {
      const mapping = await socketGetMapping(socket.id);
      if (!mapping || mapping.state !== "joined") return;

      const user = (await roomGetUser(mapping.roomId, mapping.userId)) as
        | RoomUser
        | null;
      await roomUpdateUser(mapping.roomId, mapping.userId, {
        isHandRaised: true,
      });
      socket.to(mapping.roomId).emit(SOCKET_EVENTS.HAND_RAISED, {
        userId: mapping.userId,
        userName: user?.displayName || user?.name || mapping.userId,
        timestamp: Date.now(),
      } as HandRaisePayload);
    });

    socket.on(SOCKET_EVENTS.HAND_LOWER, async () => {
      const mapping = await socketGetMapping(socket.id);
      if (!mapping || mapping.state !== "joined") return;

      await roomUpdateUser(mapping.roomId, mapping.userId, {
        isHandRaised: false,
      });
      socket.to(mapping.roomId).emit(SOCKET_EVENTS.HAND_LOWERED, {
        userId: mapping.userId,
      });
    });

    socket.on(
      SOCKET_EVENTS.TERMINAL_CONNECT,
      async (payload: TerminalConnectPayload) => {
        try {
          const sessionToken = payload?.sessionToken;
          if (!sessionToken) {
            throw new Error("Missing terminal session token.");
          }

          const terminalSession = await verifyTerminalSessionToken(sessionToken);
          if (terminalSession.userId !== authUserId) {
            throw new Error("Terminal session does not match the connected user.");
          }

          const { host, password } = await resolveWorkspaceTerminal(
            authUserId,
            terminalSession.workspaceId,
          );
          const cols = payload.cols || 80;
          const rows = payload.rows || 24;

          cleanupSSH(socket.id);
          const sshClient = new SSHClient();

          sshClient.on("ready", () => {
            sshClient.shell(
              { cols, rows, term: "xterm-256color" },
              (err: Error | undefined, stream: ClientChannel) => {
                if (err) {
                  socket.emit(SOCKET_EVENTS.TERMINAL_ERROR, {
                    message: "Failed to start shell.",
                  });
                  sshClient.end();
                  return;
                }

                sshSessions.set(socket.id, { client: sshClient, stream });
                socket.emit(SOCKET_EVENTS.TERMINAL_CONNECTED);

                stream.on("data", (data: Buffer) => {
                  socket.emit(
                    SOCKET_EVENTS.TERMINAL_DATA,
                    data.toString("utf-8"),
                  );
                });

                stream.stderr.on("data", (data: Buffer) => {
                  socket.emit(
                    SOCKET_EVENTS.TERMINAL_DATA,
                    data.toString("utf-8"),
                  );
                });

                stream.on("close", () => {
                  socket.emit(SOCKET_EVENTS.TERMINAL_ERROR, {
                    message: "SSH session ended.",
                  });
                  cleanupSSH(socket.id);
                });
              },
            );
          });

          sshClient.on("error", (err: Error) => {
            socket.emit(SOCKET_EVENTS.TERMINAL_ERROR, {
              message: `SSH connection failed: ${err.message}`,
            });
            cleanupSSH(socket.id);
          });

          sshClient.on("close", () => {
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
        } catch (error) {
          socket.emit(SOCKET_EVENTS.TERMINAL_ERROR, {
            message:
              error instanceof Error
                ? error.message
                : "Failed to start terminal session.",
          });
        }
      },
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
      },
    );

    socket.on(SOCKET_EVENTS.TERMINAL_DISCONNECT, () => {
      cleanupSSH(socket.id);
    });

    socket.on(
      SOCKET_EVENTS.AGENT_COLLAB_INVITE,
      async (payload: AgentCollabInvitePayload) => {
        const mapping = await socketGetMapping(socket.id);
        if (!mapping) return;

        const target = (await roomGetUser(mapping.roomId, payload.toUserId)) as
          | RoomUser
          | null;
        if (target?.socketId) {
          io.to(target.socketId).emit(SOCKET_EVENTS.AGENT_COLLAB_INVITE, payload);
        }
      },
    );

    socket.on(
      SOCKET_EVENTS.AGENT_COLLAB_MESSAGE,
      () => {
        // Channel-level collaboration rooms are not yet migrated to the
        // backend service. Keep the event no-op instead of silently trusting
        // arbitrary room joins on the socket layer.
      },
    );

    socket.on(
      SOCKET_EVENTS.AGENT_COLLAB_CLOSED,
      () => {
        // See note above for AGENT_COLLAB_MESSAGE.
      },
    );

    socket.on("disconnect", async () => {
      await removeSocketState(io, socket);
      cleanupSSH(socket.id);
    });
  });
}

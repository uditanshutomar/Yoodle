import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import cors from "cors";
import { Client as SSHClient, ClientChannel } from "ssh2";

// ── Types ──────────────────────────────────────────────────────────────

interface RoomUser {
  id: string;
  socketId: string;
  name: string;
  displayName: string;
  avatar?: string | null;
  isVideoEnabled: boolean;
  isAudioEnabled: boolean;
  isScreenSharing: boolean;
}

interface JoinPayload {
  roomId: string;
  user: {
    id: string;
    name: string;
    displayName: string;
    avatar?: string | null;
  };
}

interface TerminalConnectPayload {
  host: string;
  password: string;
  username?: string;
  cols?: number;
  rows?: number;
}

interface TerminalResizePayload {
  cols: number;
  rows: number;
}

// ── Socket event constants ─────────────────────────────────────────────

const EVENTS = {
  JOIN_ROOM: "room:join",
  LEAVE_ROOM: "room:leave",
  ROOM_USERS: "room:users",
  USER_JOINED: "room:user-joined",
  USER_LEFT: "room:user-left",
  OFFER: "signal:offer",
  ANSWER: "signal:answer",
  ICE_CANDIDATE: "signal:ice-candidate",
  MEDIA_STATE_CHANGED: "media:state-changed",
  VOICE_ACTIVITY: "voice:activity",
  CHAT_MESSAGE: "chat:message",
  REACTION: "reaction:send",
  REACTION_RECEIVED: "reaction:received",
  // Terminal
  TERMINAL_CONNECT: "terminal:connect",
  TERMINAL_DATA: "terminal:data",
  TERMINAL_RESIZE: "terminal:resize",
  TERMINAL_DISCONNECT: "terminal:disconnect",
  TERMINAL_CONNECTED: "terminal:connected",
  TERMINAL_ERROR: "terminal:error",
} as const;

// ── State ──────────────────────────────────────────────────────────────

// roomId -> Map<socketId, RoomUser>
const rooms = new Map<string, Map<string, RoomUser>>();

// socketId -> { roomId, userId }
const socketToRoom = new Map<string, { roomId: string; userId: string }>();

// socketId -> SSH session
const sshSessions = new Map<
  string,
  { client: SSHClient; stream: ClientChannel | null }
>();

// ── Connection rate limiting ──────────────────────────────────────────
// IP -> { count, resetAt }
const connectionTracker = new Map<string, { count: number; resetAt: number }>();
const MAX_CONNECTIONS_PER_IP = 10;
const CONNECTION_WINDOW_MS = 60_000; // 1 minute

// ── Express + Socket.io setup ──────────────────────────────────────────

const app = express();
const httpServer = createServer(app);

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((s) => s.trim())
  : ["http://localhost:3000", "https://yoodle.vercel.app"];

app.use(cors({ origin: allowedOrigins }));

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    rooms: rooms.size,
    connections: socketToRoom.size,
    sshSessions: sshSessions.size,
    uptime: process.uptime(),
  });
});

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
  },
  transports: ["websocket", "polling"],
  pingInterval: 25000,
  pingTimeout: 60000,
  maxHttpBufferSize: 1e6, // 1MB for terminal data
});

// ── Helpers ────────────────────────────────────────────────────────────

function getRoomUsers(roomId: string): RoomUser[] {
  const room = rooms.get(roomId);
  return room ? Array.from(room.values()) : [];
}

function removeUserFromRoom(socketId: string): { roomId: string } | null {
  const mapping = socketToRoom.get(socketId);
  if (!mapping) return null;

  const { roomId, userId } = mapping;
  const room = rooms.get(roomId);

  if (room) {
    room.delete(socketId);

    // Notify remaining users
    io.to(roomId).emit(EVENTS.USER_LEFT, { userId, socketId });

    // Send updated user list to remaining participants
    io.to(roomId).emit(EVENTS.ROOM_USERS, Array.from(room.values()));

    // Clean up empty rooms
    if (room.size === 0) {
      rooms.delete(roomId);
    }
  }

  socketToRoom.delete(socketId);
  return { roomId };
}

function cleanupSSH(socketId: string) {
  const session = sshSessions.get(socketId);
  if (!session) return;

  try {
    if (session.stream) {
      session.stream.close();
    }
    session.client.end();
  } catch (err) {
    console.error(`[SSH] Cleanup error for ${socketId}:`, err);
  }

  sshSessions.delete(socketId);
  console.log(`[SSH] Session closed for ${socketId}`);
}

// ── Socket.io connection handler ───────────────────────────────────────

// Connection rate limiting middleware
io.use((socket, next) => {
  const ip = socket.handshake.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim()
    || socket.handshake.address
    || "unknown";

  const now = Date.now();
  const tracker = connectionTracker.get(ip);

  if (tracker && tracker.resetAt > now) {
    tracker.count++;
    if (tracker.count > MAX_CONNECTIONS_PER_IP) {
      console.warn(`[Rate Limit] Too many connections from ${ip}`);
      return next(new Error("Too many connections. Please try again later."));
    }
  } else {
    connectionTracker.set(ip, { count: 1, resetAt: now + CONNECTION_WINDOW_MS });
  }

  next();
});

// Clean up stale connection tracking entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, tracker] of connectionTracker) {
    if (tracker.resetAt <= now) {
      connectionTracker.delete(ip);
    }
  }
}, 5 * 60_000);

io.on("connection", (socket: Socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);

  // ── Join room ─────────────────────────────────────────────────────

  socket.on(EVENTS.JOIN_ROOM, (payload: JoinPayload) => {
    const { roomId, user } = payload;

    // Remove from previous room if any
    removeUserFromRoom(socket.id);

    // Create room if it doesn't exist
    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Map());
    }

    const room = rooms.get(roomId)!;

    const roomUser: RoomUser = {
      id: user.id,
      socketId: socket.id,
      name: user.name,
      displayName: user.displayName,
      avatar: user.avatar || null,
      isVideoEnabled: true,
      isAudioEnabled: true,
      isScreenSharing: false,
    };

    // Join the socket.io room
    socket.join(roomId);
    room.set(socket.id, roomUser);
    socketToRoom.set(socket.id, { roomId, userId: user.id });

    // Send existing users to the joiner
    const existingUsers = getRoomUsers(roomId).filter((u) => u.socketId !== socket.id);
    socket.emit(EVENTS.ROOM_USERS, existingUsers);

    // Notify others about new user
    socket.to(roomId).emit(EVENTS.USER_JOINED, roomUser);

    console.log(`[Room] ${user.displayName} joined ${roomId} (${room.size} users)`);
  });

  // ── Leave room ────────────────────────────────────────────────────

  socket.on(EVENTS.LEAVE_ROOM, () => {
    const result = removeUserFromRoom(socket.id);
    if (result) {
      socket.leave(result.roomId);
    }
  });

  // ── WebRTC signaling ──────────────────────────────────────────────

  socket.on(EVENTS.OFFER, (data: { targetId: string; senderId: string; offer: unknown }) => {
    const mapping = socketToRoom.get(socket.id);
    if (!mapping) return;

    const room = rooms.get(mapping.roomId);
    if (!room) return;

    for (const [sid, user] of room) {
      if (user.id === data.targetId) {
        io.to(sid).emit(EVENTS.OFFER, data);
        break;
      }
    }
  });

  socket.on(EVENTS.ANSWER, (data: { targetId: string; senderId: string; answer: unknown }) => {
    const mapping = socketToRoom.get(socket.id);
    if (!mapping) return;

    const room = rooms.get(mapping.roomId);
    if (!room) return;

    for (const [sid, user] of room) {
      if (user.id === data.targetId) {
        io.to(sid).emit(EVENTS.ANSWER, data);
        break;
      }
    }
  });

  socket.on(EVENTS.ICE_CANDIDATE, (data: { targetId: string; senderId: string; candidate: unknown }) => {
    const mapping = socketToRoom.get(socket.id);
    if (!mapping) return;

    const room = rooms.get(mapping.roomId);
    if (!room) return;

    for (const [sid, user] of room) {
      if (user.id === data.targetId) {
        io.to(sid).emit(EVENTS.ICE_CANDIDATE, data);
        break;
      }
    }
  });

  // ── Media state ───────────────────────────────────────────────────

  socket.on(EVENTS.MEDIA_STATE_CHANGED, (data: { userId: string; isVideoEnabled: boolean; isAudioEnabled: boolean }) => {
    const mapping = socketToRoom.get(socket.id);
    if (!mapping) return;

    const room = rooms.get(mapping.roomId);
    if (!room) return;

    const roomUser = room.get(socket.id);
    if (roomUser) {
      roomUser.isVideoEnabled = data.isVideoEnabled;
      roomUser.isAudioEnabled = data.isAudioEnabled;
    }

    socket.to(mapping.roomId).emit(EVENTS.MEDIA_STATE_CHANGED, data);
  });

  // ── Voice activity ────────────────────────────────────────────────

  socket.on(EVENTS.VOICE_ACTIVITY, (data: { userId: string; isSpeaking: boolean; audioLevel: number }) => {
    const mapping = socketToRoom.get(socket.id);
    if (mapping) {
      socket.to(mapping.roomId).emit(EVENTS.VOICE_ACTIVITY, data);
    }
  });

  // ── Chat ──────────────────────────────────────────────────────────

  socket.on(EVENTS.CHAT_MESSAGE, (data: unknown) => {
    const mapping = socketToRoom.get(socket.id);
    if (mapping) {
      socket.to(mapping.roomId).emit(EVENTS.CHAT_MESSAGE, data);
    }
  });

  // ── Reactions ─────────────────────────────────────────────────────

  socket.on(EVENTS.REACTION, (data: unknown) => {
    const mapping = socketToRoom.get(socket.id);
    if (mapping) {
      socket.to(mapping.roomId).emit(EVENTS.REACTION_RECEIVED, data);
    }
  });

  // ── Terminal (SSH Proxy) ──────────────────────────────────────────

  socket.on(EVENTS.TERMINAL_CONNECT, (payload: TerminalConnectPayload) => {
    const { host, password, username = "root", cols = 80, rows = 24 } = payload;

    // Validate inputs
    if (!host || typeof host !== "string" || host.length > 255) {
      socket.emit(EVENTS.TERMINAL_ERROR, { message: "Invalid host." });
      return;
    }
    if (!password || typeof password !== "string") {
      socket.emit(EVENTS.TERMINAL_ERROR, { message: "Password is required." });
      return;
    }
    if (typeof username !== "string" || username.length > 64) {
      socket.emit(EVENTS.TERMINAL_ERROR, { message: "Invalid username." });
      return;
    }

    // Clean up existing session if any
    cleanupSSH(socket.id);

    console.log(`[SSH] Connecting to ${host} as ${username} for ${socket.id}`);

    const sshClient = new SSHClient();

    sshClient.on("ready", () => {
      console.log(`[SSH] Authenticated to ${host} for ${socket.id}`);

      sshClient.shell(
        { cols, rows, term: "xterm-256color" },
        (err: Error | undefined, stream: ClientChannel) => {
          if (err) {
            console.error(`[SSH] Shell error:`, err);
            socket.emit(EVENTS.TERMINAL_ERROR, { message: "Failed to start shell." });
            sshClient.end();
            return;
          }

          // Store the session
          sshSessions.set(socket.id, { client: sshClient, stream });

          // Notify client that terminal is ready
          socket.emit(EVENTS.TERMINAL_CONNECTED);

          // Forward SSH output → browser
          stream.on("data", (data: Buffer) => {
            socket.emit(EVENTS.TERMINAL_DATA, data.toString("utf-8"));
          });

          stream.stderr.on("data", (data: Buffer) => {
            socket.emit(EVENTS.TERMINAL_DATA, data.toString("utf-8"));
          });

          stream.on("close", () => {
            console.log(`[SSH] Stream closed for ${socket.id}`);
            socket.emit(EVENTS.TERMINAL_ERROR, { message: "SSH session ended." });
            cleanupSSH(socket.id);
          });
        }
      );
    });

    sshClient.on("error", (err: Error) => {
      console.error(`[SSH] Connection error for ${socket.id}:`, err.message);
      // Sanitize error message - don't leak host/auth details to client
      const safeMessage = err.message.includes("Authentication")
        ? "SSH authentication failed."
        : err.message.includes("ECONNREFUSED")
          ? "Connection refused by host."
          : err.message.includes("ETIMEDOUT") || err.message.includes("Timed out")
            ? "Connection timed out."
            : "SSH connection failed.";
      socket.emit(EVENTS.TERMINAL_ERROR, { message: safeMessage });
      cleanupSSH(socket.id);
    });

    sshClient.on("close", () => {
      console.log(`[SSH] Connection closed for ${socket.id}`);
      cleanupSSH(socket.id);
    });

    sshClient.connect({
      host,
      port: 22,
      username,
      password,
      readyTimeout: 10000,
      keepaliveInterval: 10000,
      keepaliveCountMax: 3,
    });
  });

  // Browser → SSH input (with backpressure handling)
  socket.on(EVENTS.TERMINAL_DATA, (data: string) => {
    if (typeof data !== "string" || data.length > 4096) return; // Limit input size
    const session = sshSessions.get(socket.id);
    if (session?.stream) {
      const canWrite = session.stream.write(data);
      if (!canWrite) {
        // Backpressure: pause until drain
        session.stream.once("drain", () => {
          // Stream ready for more data
        });
      }
    }
  });

  // Terminal resize
  socket.on(EVENTS.TERMINAL_RESIZE, (payload: TerminalResizePayload) => {
    const session = sshSessions.get(socket.id);
    if (session?.stream) {
      session.stream.setWindow(payload.rows, payload.cols, 0, 0);
    }
  });

  // Explicit terminal disconnect
  socket.on(EVENTS.TERMINAL_DISCONNECT, () => {
    cleanupSSH(socket.id);
  });

  // ── Disconnect ────────────────────────────────────────────────────

  socket.on("disconnect", (reason) => {
    console.log(`[Socket] Disconnected: ${socket.id} (${reason})`);
    removeUserFromRoom(socket.id);
    cleanupSSH(socket.id);
  });
});

// ── Start server ───────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || "3001", 10);

httpServer.listen(PORT, () => {
  console.log(`\n  Yoodle Signaling Server`);
  console.log(`  ─────────────────────`);
  console.log(`  Port:    ${PORT}`);
  console.log(`  Origins: ${allowedOrigins.join(", ")}`);
  console.log(`  Health:  http://localhost:${PORT}/health\n`);
});

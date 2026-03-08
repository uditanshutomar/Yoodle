import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import cors from "cors";

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
} as const;

// ── State ──────────────────────────────────────────────────────────────

// roomId -> Map<socketId, RoomUser>
const rooms = new Map<string, Map<string, RoomUser>>();

// socketId -> { roomId, userId }
const socketToRoom = new Map<string, { roomId: string; userId: string }>();

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
});

// ── Helpers ────────────────────────────────────────────────────────────

function getRoomUsers(roomId: string): RoomUser[] {
  const room = rooms.get(roomId);
  return room ? Array.from(room.values()) : [];
}

function removeUserFromRoom(socketId: string) {
  const mapping = socketToRoom.get(socketId);
  if (!mapping) return;

  const { roomId, userId } = mapping;
  const room = rooms.get(roomId);

  if (room) {
    room.delete(socketId);

    // Notify remaining users
    io.to(roomId).emit(EVENTS.USER_LEFT, { userId, socketId });

    // Clean up empty rooms
    if (room.size === 0) {
      rooms.delete(roomId);
    }
  }

  socketToRoom.delete(socketId);
}

// ── Socket.io connection handler ───────────────────────────────────────

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
    removeUserFromRoom(socket.id);
  });

  // ── WebRTC signaling ──────────────────────────────────────────────

  socket.on(EVENTS.OFFER, (data: { targetId: string; senderId: string; offer: RTCSessionDescriptionInit }) => {
    // Find target socket
    const mapping = socketToRoom.get(socket.id);
    if (!mapping) return;

    const room = rooms.get(mapping.roomId);
    if (!room) return;

    // Find target user's socket
    for (const [sid, user] of room) {
      if (user.id === data.targetId) {
        io.to(sid).emit(EVENTS.OFFER, data);
        break;
      }
    }
  });

  socket.on(EVENTS.ANSWER, (data: { targetId: string; senderId: string; answer: RTCSessionDescriptionInit }) => {
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

  socket.on(EVENTS.ICE_CANDIDATE, (data: { targetId: string; senderId: string; candidate: RTCIceCandidateInit }) => {
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

    // Update stored state
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

  // ── Disconnect ────────────────────────────────────────────────────

  socket.on("disconnect", (reason) => {
    console.log(`[Socket] Disconnected: ${socket.id} (${reason})`);
    removeUserFromRoom(socket.id);
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

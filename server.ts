import "dotenv/config";
import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server as SocketIOServer } from "socket.io";
import { setupSocketServer } from "./src/lib/realtime/socket-server";
import { printEnvStatus } from "./src/lib/env";

const dev = process.env.NODE_ENV !== "production";
const hostname = dev ? "localhost" : "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Validate environment variables on startup
printEnvStatus();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  const allowedOrigins = dev
    ? ["http://localhost:3000"]
    : (process.env.ALLOWED_ORIGINS || process.env.NEXT_PUBLIC_APP_URL || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: allowedOrigins.length > 0 ? allowedOrigins : false,
      methods: ["GET", "POST"],
    },
    path: "/api/socketio",
    transports: ["websocket", "polling"],
    pingInterval: 25000,
    pingTimeout: 60000,
    maxHttpBufferSize: 1e6, // 1 MB — prevent memory exhaustion via large payloads
  });

  setupSocketServer(io);

  httpServer.listen(port, hostname, () => {
    console.log(`\n🟡 Yoodle is live!`);
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> Socket.io path: /api/socketio`);
    console.log(`> Environment: ${dev ? "development" : "production"}\n`);
  });
});

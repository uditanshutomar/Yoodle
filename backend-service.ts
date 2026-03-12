import "dotenv/config";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { setupBackendSocketServer } from "./src/lib/realtime/backend-socket-server";
import { initializeWorkers } from "./src/lib/jobs/workers";
import { closeAllQueues, registerCronJobs } from "./src/lib/jobs/queue";
import { closeRedis } from "./src/lib/redis/client";

const port = parseInt(
  process.env.BACKEND_SERVICE_PORT || process.env.REALTIME_SERVICE_PORT || "4001",
  10,
);
const path = process.env.NEXT_PUBLIC_REALTIME_PATH || "/api/socketio";
const allowedOrigins = (
  process.env.BACKEND_ALLOWED_ORIGINS ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "http://localhost:3000"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const httpServer = createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true, service: "yoodle-backend" }));
});

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
  },
  path,
  transports: ["websocket", "polling"],
  pingInterval: 25000,
  pingTimeout: 60000,
  maxHttpBufferSize: 1e6,
});

setupBackendSocketServer(io);

async function bootstrap(): Promise<void> {
  initializeWorkers();
  await registerCronJobs();

  httpServer.listen(port, () => {
    console.log("Yoodle backend service is live");
    console.log(`> Realtime path: ${path}`);
    console.log(`> Port: ${port}`);
    console.log(`> Allowed origins: ${allowedOrigins.join(", ")}`);
  });
}

async function shutdown(signal: string): Promise<void> {
  console.log(`Shutting down backend service (${signal})`);
  io.close();
  httpServer.close();
  await closeAllQueues().catch((error) => {
    console.error("Failed to close queues cleanly:", error);
  });
  await closeRedis().catch((error) => {
    console.error("Failed to close Redis cleanly:", error);
  });
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

bootstrap().catch((error) => {
  console.error("Failed to start backend service:", error);
  process.exit(1);
});

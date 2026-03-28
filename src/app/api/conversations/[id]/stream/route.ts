import { NextRequest } from "next/server";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { sharedSubscriber } from "@/lib/infra/redis/pubsub";
import connectDB from "@/lib/infra/db/client";
import Conversation from "@/lib/infra/db/models/conversation";
import mongoose from "mongoose";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("api:conversations:stream");

export async function GET(
  req: NextRequest,
  context: { params: Promise<Record<string, string>> }
) {
  try {
    await checkRateLimit(req, "general");
    const userId = await getUserIdFromRequest(req);
    const { id } = await context.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return new Response(JSON.stringify({ error: "Invalid conversation ID" }), {
        status: 400,
      });
    }

    await connectDB();

    // Verify user is a participant of this conversation
    const conv = await Conversation.findOne({
      _id: new mongoose.Types.ObjectId(id),
      "participants.userId": new mongoose.Types.ObjectId(userId),
    })
      .select("_id")
      .lean();
    if (!conv) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
      });
    }

    // Subscribe via the shared Redis subscriber (single connection for all SSE clients)
    let unsubscribe: (() => Promise<void>) | undefined;
    try {
      // We need to wire the handler inside ReadableStream.start(), so we
      // subscribe here and store the unsubscribe handle for cleanup.
      // The handler will be attached after the stream controller is available.
      let enqueueMessage: ((channel: string, message: string) => void) | null = null;

      unsubscribe = await sharedSubscriber.subscribe(`chat:${id}`, (channel, message) => {
        if (enqueueMessage) {
          enqueueMessage(channel, message);
        }
      });

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          // Send heartbeat every 15s to keep the connection alive
          const heartbeat = setInterval(() => {
            try {
              controller.enqueue(encoder.encode(": heartbeat\n\n"));
            } catch (err) {
              log.debug({ err, conversationId: id }, "Heartbeat failed — stream likely closed");
              clearInterval(heartbeat);
            }
          }, 15000);

          // On Vercel (serverless), close after 50s before the 60s timeout.
          // On VM/self-hosted, keep alive for 10 minutes to reduce reconnects.
          const SSE_LIFETIME_MS = process.env.VERCEL ? 50_000 : 600_000;
          const maxLifetime = setTimeout(() => {
            clearInterval(heartbeat);
            enqueueMessage = null;
            unsubscribe?.().catch(() => {});
            try {
              controller.close();
            } catch {
              // Already closed
            }
          }, SSE_LIFETIME_MS);

          // Wire up the message handler now that the controller is available
          enqueueMessage = (_channel: string, message: string) => {
            try {
              const parsed = JSON.parse(message);
              const eventType = parsed.type || "message";

              // For "message" events, unwrap the data envelope so the
              // client receives the ChatMsg directly
              const payload =
                eventType === "message" && parsed.data
                  ? JSON.stringify(parsed.data)
                  : message;

              controller.enqueue(
                encoder.encode(`event: ${eventType}\ndata: ${payload}\n\n`),
              );
            } catch (parseErr) {
              log.warn({ err: parseErr, message: message.slice(0, 200) }, "Failed to parse Redis SSE message as JSON");
              try {
                controller.enqueue(encoder.encode(`data: ${message}\n\n`));
              } catch {
                // Stream closed — nothing more we can do
              }
            }
          };

          // Clean up when the client disconnects
          req.signal.addEventListener("abort", () => {
            clearTimeout(maxLifetime);
            clearInterval(heartbeat);
            enqueueMessage = null;
            unsubscribe?.().catch(() => {});
            try {
              controller.close();
            } catch {
              // Already closed
            }
          });
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no", // Prevent Nginx/reverse proxy buffering
        },
      });
    } catch (err) {
      if (unsubscribe) {
        await unsubscribe().catch(() => {});
      }
      log.error({ err, conversationId: id }, "Failed to subscribe to Redis for SSE stream");
      return new Response(
        JSON.stringify({ error: "Service temporarily unavailable" }),
        { status: 503 },
      );
    }
  } catch (err) {
    // getUserIdFromRequest throws UnauthorizedError for auth failures;
    // anything else (DB down, Redis error, etc.) is a server error.
    const isAuthError =
      err instanceof Error && (err.name === "UnauthorizedError" || err.message === "Unauthorized");

    if (!isAuthError) {
      log.error({ err, url: req.nextUrl?.pathname }, "SSE stream setup failed");
    }

    return new Response(
      JSON.stringify({ error: isAuthError ? "Unauthorized" : "Internal server error" }),
      { status: isAuthError ? 401 : 500 },
    );
  }
}

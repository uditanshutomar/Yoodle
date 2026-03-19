import { NextRequest } from "next/server";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { sharedSubscriber } from "@/lib/infra/redis/pubsub";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("api:notifications:stream");

export async function GET(req: NextRequest) {
  try {
    await checkRateLimit(req, "general");
    const userId = await getUserIdFromRequest(req);

    // Subscribe via the shared Redis subscriber (single connection for all SSE clients)
    let unsubscribe: (() => Promise<void>) | undefined;
    try {
      let enqueueMessage: ((channel: string, message: string) => void) | null = null;

      unsubscribe = await sharedSubscriber.subscribe(`notifications:${userId}`, (channel, message) => {
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
              log.debug({ err, userId }, "Heartbeat failed — stream likely closed");
              clearInterval(heartbeat);
            }
          }, 15000);

          // Wire up the message handler now that the controller is available
          enqueueMessage = (_channel: string, message: string) => {
            try {
              const parsed = JSON.parse(message);
              const eventType = parsed.type || "notification";
              const payload = parsed.data ? JSON.stringify(parsed.data) : message;

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
          "X-Accel-Buffering": "no",
        },
      });
    } catch (err) {
      if (unsubscribe) {
        await unsubscribe().catch(() => {});
      }
      log.error({ err, userId }, "Failed to subscribe to Redis for notification SSE stream");
      return new Response(
        JSON.stringify({ error: "Service temporarily unavailable" }),
        { status: 503 },
      );
    }
  } catch (err) {
    const isAuthError =
      err instanceof Error && (err.name === "UnauthorizedError" || err.message === "Unauthorized");

    if (!isAuthError) {
      log.error({ err, url: req.nextUrl?.pathname }, "Notification SSE stream setup failed");
    }

    return new Response(
      JSON.stringify({ error: isAuthError ? "Unauthorized" : "Internal server error" }),
      { status: isAuthError ? 401 : 500 },
    );
  }
}

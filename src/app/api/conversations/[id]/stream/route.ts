import { NextRequest } from "next/server";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { getRedisClient } from "@/lib/infra/redis/client";
import connectDB from "@/lib/infra/db/client";
import Conversation from "@/lib/infra/db/models/conversation";
import mongoose from "mongoose";

export async function GET(
  req: NextRequest,
  context: { params: Promise<Record<string, string>> }
) {
  try {
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
    });
    if (!conv) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
      });
    }

    // Create a dedicated Redis subscriber connection for this SSE stream
    const subscriber = getRedisClient().duplicate();
    await subscriber.subscribe(`chat:${id}`);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        // Send heartbeat every 15s to keep the connection alive
        const heartbeat = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": heartbeat\n\n"));
          } catch {
            clearInterval(heartbeat);
          }
        }, 15000);

        // Forward Redis messages as typed SSE events
        subscriber.on("message", (_channel: string, message: string) => {
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
          } catch {
            // Forward raw if JSON parsing fails
            controller.enqueue(encoder.encode(`data: ${message}\n\n`));
          }
        });

        // Clean up when the client disconnects
        req.signal.addEventListener("abort", () => {
          clearInterval(heartbeat);
          subscriber.unsubscribe().catch(() => {});
          subscriber.quit().catch(() => {});
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
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }
}

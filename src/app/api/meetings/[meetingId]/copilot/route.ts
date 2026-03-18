import { NextRequest } from "next/server";
import { withHandler } from "@/lib/infra/api/with-handler";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { errorResponse } from "@/lib/infra/api/response";
import { getRedisClient } from "@/lib/infra/redis/client";
import connectDB from "@/lib/infra/db/client";

export const GET = withHandler(async (req: NextRequest, context) => {
  const userId = await getUserIdFromRequest(req);
  const { meetingId } = await context!.params;

  // Suppress unused-variable lint — userId is required for auth
  void userId;

  await connectDB();
  const Meeting = (await import("@/lib/infra/db/models/meeting")).default;
  const meeting = await Meeting.findById(meetingId).lean();

  if (!meeting) {
    return errorResponse("NOT_FOUND", "Meeting not found", 404);
  }

  if (meeting.status !== "live") {
    return errorResponse("BAD_REQUEST", "Meeting is not live", 400);
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const redis = getRedisClient();
      const sub = redis.duplicate();
      await sub.subscribe(`copilot:${meetingId}`);

      sub.on("message", (_channel: string, message: string) => {
        controller.enqueue(encoder.encode(`data: ${message}\n\n`));
      });

      // Send initial connected event
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ type: "connected", meetingId })}\n\n`,
        ),
      );

      // Cleanup on client disconnect
      req.signal.addEventListener("abort", () => {
        sub.unsubscribe(`copilot:${meetingId}`);
        sub.quit();
        controller.close();
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
});

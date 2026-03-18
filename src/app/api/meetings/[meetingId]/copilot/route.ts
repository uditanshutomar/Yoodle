import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { withHandler } from "@/lib/infra/api/with-handler";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { NotFoundError, BadRequestError } from "@/lib/infra/api/errors";
import { getRedisClient } from "@/lib/infra/redis/client";
import connectDB from "@/lib/infra/db/client";
import { buildMeetingFilter } from "@/lib/meetings/helpers";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("meetings:copilot");

export const GET = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "meetings");
  const userId = await getUserIdFromRequest(req);
  const { meetingId } = await context!.params;

  await connectDB();
  const Meeting = (await import("@/lib/infra/db/models/meeting")).default;
  const filter = buildMeetingFilter(meetingId);
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const meeting = await Meeting.findOne({
    ...filter,
    $or: [
      { hostId: userObjectId },
      { "participants.userId": userObjectId },
    ],
  }).lean();

  if (!meeting) {
    throw new NotFoundError("Meeting not found or you are not a participant.");
  }

  if (meeting.status !== "live") {
    throw new BadRequestError("Meeting is not live.");
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let sub: ReturnType<ReturnType<typeof getRedisClient>["duplicate"]>;
      try {
        const redis = getRedisClient();
        sub = redis.duplicate();
        await sub.subscribe(`copilot:${meetingId}`);
      } catch (err) {
        log.error({ err, meetingId }, "Failed to set up Redis subscription for copilot SSE");
        try {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "error", message: "Failed to connect to event stream" })}\n\n`,
            ),
          );
          controller.close();
        } catch (e) { if (!(e instanceof TypeError)) log.warn({ err: e, meetingId }, "Unexpected error closing SSE controller"); }
        return;
      }

      sub.on("error", (err) => {
        log.error({ err, meetingId }, "Redis subscription error in copilot SSE");
        try {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "error", message: "Event stream connection lost" })}\n\n`,
            ),
          );
          controller.close();
        } catch (e) { if (!(e instanceof TypeError)) log.warn({ err: e, meetingId }, "Unexpected error closing SSE controller"); }
      });

      sub.on("message", (_channel: string, message: string) => {
        try {
          controller.enqueue(encoder.encode(`data: ${message}\n\n`));
        } catch (err) {
          log.warn({ err, meetingId }, "Failed to enqueue SSE message");
        }
      });

      // Send initial connected event
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ type: "connected", meetingId })}\n\n`,
        ),
      );

      // Cleanup on client disconnect
      req.signal.addEventListener("abort", () => {
        try {
          sub.unsubscribe(`copilot:${meetingId}`);
        } catch (err) {
          log.warn({ err, meetingId }, "Failed to unsubscribe from copilot channel");
        }
        try {
          sub.quit();
        } catch (err) {
          log.warn({ err, meetingId }, "Failed to quit Redis subscriber");
        }
        try {
          controller.close();
        } catch (e) { if (!(e instanceof TypeError)) log.warn({ err: e, meetingId }, "Unexpected error closing SSE controller"); }
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

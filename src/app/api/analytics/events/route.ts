import { NextRequest } from "next/server";
import { z } from "zod";
import { withHandler } from "@/lib/api/with-handler";
import { successResponse } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/auth/middleware";
import connectDB from "@/lib/db/client";
import AnalyticsEvent, {
  ANALYTICS_EVENT_TYPES,
} from "@/lib/db/models/analytics-event";

const eventSchema = z.object({
  type: z.enum(ANALYTICS_EVENT_TYPES),
  meetingId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
});

// POST /api/analytics/events -- track an analytics event
export const POST = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);

  const body = eventSchema.parse(await req.json());

  await connectDB();
  await AnalyticsEvent.create({
    type: body.type,
    userId,
    meetingId: body.meetingId || undefined,
    metadata: body.metadata,
  });

  return successResponse({ tracked: true });
});

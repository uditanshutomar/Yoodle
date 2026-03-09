import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api/with-handler";
import { successResponse } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/auth/middleware";
import { checkFreeTierLimits } from "@/lib/usage/tracker";

// -- GET /api/usage -----------------------------------------------------------

export const GET = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);

  const { usage, limits, withinLimits } = await checkFreeTierLimits(userId);

  return successResponse({
    usage,
    limits,
    withinLimits,
  });
});

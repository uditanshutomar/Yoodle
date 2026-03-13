import { NextRequest } from "next/server";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { signRealtimeSessionToken } from "@/lib/infra/auth/service-session";

function getRealtimeUrl(req: NextRequest): string {
  return (
    process.env.NEXT_PUBLIC_REALTIME_URL ||
    process.env.REALTIME_PUBLIC_URL ||
    new URL(req.url).origin
  );
}

export const GET = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);

  const token = await signRealtimeSessionToken(userId);
  const path = process.env.NEXT_PUBLIC_REALTIME_PATH || "/api/socketio";

  return successResponse({
    url: getRealtimeUrl(req),
    path,
    token,
  });
});

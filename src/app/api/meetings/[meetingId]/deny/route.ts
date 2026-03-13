import { NextRequest } from "next/server";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";

/**
 * POST /api/meetings/[meetingId]/deny
 *
 * Host denies a user from the waiting room.
 * Stub: waiting room has no DB backing yet — accepts and no-ops.
 */
export const POST = withHandler(async (req: NextRequest) => {
  await getUserIdFromRequest(req);
  return successResponse({ denied: true });
});

import { NextRequest } from "next/server";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";

/**
 * GET /api/meetings/[meetingId]/waiting-status
 *
 * Returns the list of users in the waiting room.
 * Stub: waiting room has no DB backing yet — always returns empty.
 */
export const GET = withHandler(async (req: NextRequest) => {
  await getUserIdFromRequest(req);
  return successResponse({ users: [] });
});

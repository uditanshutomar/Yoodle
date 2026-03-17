import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { getUnseenCount, clearUnseen } from "@/lib/chat/proactive-insights";

export const GET = withHandler(async (req) => {
  const userId = await getUserIdFromRequest(req);
  const count = await getUnseenCount(userId);
  return successResponse({ count });
});

export const DELETE = withHandler(async (req) => {
  const userId = await getUserIdFromRequest(req);
  await clearUnseen(userId);
  return successResponse({ ok: true });
});

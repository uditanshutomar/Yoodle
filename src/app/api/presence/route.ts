import { NextRequest } from "next/server";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { setUserOnline } from "@/lib/chat/presence";

export const POST = withHandler(async (req: NextRequest) => {
  const userId = await getUserIdFromRequest(req);
  await setUserOnline(userId);
  return successResponse({ ok: true });
});

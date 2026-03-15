import { NextRequest } from "next/server";
import { z } from "zod";
import { withHandler } from "@/lib/infra/api/with-handler";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { executeWorkspaceTool } from "@/lib/ai/tools";
import { successResponse } from "@/lib/infra/api/response";

const confirmSchema = z.object({
  actionType: z.string().min(1),
  args: z.record(z.string(), z.unknown()),
});

export const POST = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "ai");
  const userId = await getUserIdFromRequest(req);

  const body = confirmSchema.parse(await req.json());
  const result = await executeWorkspaceTool(userId, body.actionType, body.args);

  return successResponse(result);
});

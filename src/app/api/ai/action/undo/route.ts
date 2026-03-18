import { NextRequest } from "next/server";
import { z } from "zod";
import { withHandler } from "@/lib/infra/api/with-handler";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { consumeUndoToken } from "@/lib/ai/meeting-undo";
import { executeWorkspaceTool } from "@/lib/ai/tools";
import { errorResponse, successResponse } from "@/lib/infra/api/response";

const undoSchema = z.object({
  undoToken: z.string().min(1),
});

export const POST = withHandler(async (req: NextRequest) => {
  const userId = await getUserIdFromRequest(req);

  const body = undoSchema.parse(await req.json());
  const stored = await consumeUndoToken(body.undoToken);

  if (!stored) {
    return errorResponse("NOT_FOUND", "Undo token not found or expired", 404);
  }

  if (stored.userId !== userId) {
    return errorResponse("FORBIDDEN", "Undo token does not belong to this user", 403);
  }

  // "noop" reverse actions cannot be undone (e.g., can't unsend an email)
  if (stored.reverseAction === "noop") {
    return successResponse({
      undone: true,
      summary: stored.description || "Action cannot be reversed but token was consumed.",
    });
  }

  const result = await executeWorkspaceTool(
    userId,
    stored.reverseAction,
    stored.reverseArgs,
  );

  return successResponse({
    undone: true,
    summary: stored.description || `Reversed "${stored.action}" via "${stored.reverseAction}"`,
    result,
  });
});

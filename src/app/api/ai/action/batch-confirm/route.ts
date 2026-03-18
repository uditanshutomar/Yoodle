import { NextRequest } from "next/server";
import { z } from "zod";
import { withHandler } from "@/lib/infra/api/with-handler";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { executeWorkspaceTool } from "@/lib/ai/tools";
import { successResponse } from "@/lib/infra/api/response";
import { BadRequestError } from "@/lib/infra/api/errors";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("ai:batch-confirm");

const ALLOWED_BATCH_ACTIONS = new Set([
  "update_board_task",
  "move_board_task",
  "assign_board_task",
  "delete_board_task",
  "mark_email_read",
]);

const MAX_BATCH_SIZE = 25;

const batchSchema = z.object({
  actionType: z.string().min(1),
  items: z
    .array(
      z.object({
        id: z.string().min(1),
        args: z.record(z.string(), z.unknown()),
      }),
    )
    .min(1)
    .max(MAX_BATCH_SIZE),
});

export const POST = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "ai");
  const userId = await getUserIdFromRequest(req);

  const body = batchSchema.parse(await req.json());

  if (!ALLOWED_BATCH_ACTIONS.has(body.actionType)) {
    throw new BadRequestError(
      `Action "${body.actionType}" is not allowed in batch mode.`,
    );
  }

  const results: Array<{ id: string; success: boolean; summary: string }> = [];

  for (const item of body.items) {
    try {
      const result = await executeWorkspaceTool(userId, body.actionType, {
        ...item.args,
        taskId: item.id,
      });
      results.push({ id: item.id, success: result.success, summary: result.summary });
    } catch (err) {
      log.error({ err, itemId: item.id }, "Batch item failed");
      results.push({
        id: item.id,
        success: false,
        summary: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  const succeeded = results.filter((r) => r.success).length;
  log.info(
    { actionType: body.actionType, total: body.items.length, succeeded },
    "Batch completed",
  );

  return successResponse({ results, succeeded, total: body.items.length });
});

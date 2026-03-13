import { NextRequest } from "next/server";
import { z } from "zod";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse, errorResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { updateTask, deleteTask, completeTask } from "@/lib/google/tasks";
import { hasGoogleAccess } from "@/lib/google/client";
import { BadRequestError } from "@/lib/infra/api/errors";

// -- Validation ---------------------------------------------------------------

const patchSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  notes: z.string().max(8000).optional(),
  status: z.enum(["needsAction", "completed"]).optional(),
  due: z.string().datetime().optional(),
  taskListId: z.string().default("@default"),
});

// -- Helpers ------------------------------------------------------------------

async function ensureGoogleAccess(userId: string) {
  const hasAccess = await hasGoogleAccess(userId);
  if (!hasAccess) {
    return errorResponse(
      "NO_GOOGLE_ACCESS",
      "Google Tasks not connected. Connect your Google account in Settings.",
      403
    );
  }
  return null;
}

// -- PATCH /api/tasks/:taskId -------------------------------------------------

/**
 * Update a Google Task. Supports partial updates.
 * Body: { title?, notes?, status?, due?, taskListId? }
 *
 * Shortcut: send { status: "completed" } to mark task done.
 */
export const PATCH = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);

  const denied = await ensureGoogleAccess(userId);
  if (denied) return denied;

  const { taskId } = await context!.params;
  const body = patchSchema.parse(await req.json());
  const { taskListId, ...updates } = body;

  if (Object.keys(updates).length === 0) {
    throw new BadRequestError("No fields to update.");
  }

  // Shortcut for completing
  if (updates.status === "completed" && Object.keys(updates).length === 1) {
    const task = await completeTask(userId, taskListId, taskId);
    return successResponse(task);
  }

  const task = await updateTask(userId, taskListId, taskId, updates);
  return successResponse(task);
});

// -- DELETE /api/tasks/:taskId ------------------------------------------------

/**
 * Delete a Google Task.
 * Query param: taskListId (defaults to @default)
 */
export const DELETE = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);

  const denied = await ensureGoogleAccess(userId);
  if (denied) return denied;

  const { taskId } = await context!.params;
  const taskListId = req.nextUrl.searchParams.get("taskListId") || "@default";

  await deleteTask(userId, taskListId, taskId);

  return successResponse({ deleted: true });
});

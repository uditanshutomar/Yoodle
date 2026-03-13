import { NextRequest } from "next/server";
import { z } from "zod";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse, errorResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { listTaskLists, listTasks, createTask } from "@/lib/google/tasks";
import { hasGoogleAccess } from "@/lib/google/client";

// -- Validation ---------------------------------------------------------------

const listQuerySchema = z.object({
  taskListId: z.string().default("@default"),
  showCompleted: z.coerce.boolean().default(false),
  maxResults: z.coerce.number().int().min(1).max(100).default(50),
});

const createSchema = z.object({
  title: z.string().min(1, "Task title is required.").max(500),
  notes: z.string().max(8000).optional(),
  due: z.string().datetime().optional(),
  taskListId: z.string().default("@default"),
});

// -- GET /api/tasks -----------------------------------------------------------

/**
 * List Google Tasks for the authenticated user.
 * Query params: taskListId, showCompleted, maxResults
 * Special: taskListId=_lists returns all task lists instead of tasks.
 */
export const GET = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);

  const hasAccess = await hasGoogleAccess(userId);
  if (!hasAccess) {
    return errorResponse(
      "NO_GOOGLE_ACCESS",
      "Google Tasks not connected. Connect your Google account in Settings.",
      403
    );
  }

  const searchParams = req.nextUrl.searchParams;

  // Special mode: return all task lists
  if (searchParams.get("taskListId") === "_lists") {
    const taskLists = await listTaskLists(userId);
    return successResponse(taskLists);
  }

  const { taskListId, showCompleted, maxResults } = listQuerySchema.parse({
    taskListId: searchParams.get("taskListId") ?? "@default",
    showCompleted: searchParams.get("showCompleted") ?? false,
    maxResults: searchParams.get("maxResults") ?? 50,
  });

  const tasks = await listTasks(userId, taskListId, {
    showCompleted,
    maxResults,
  });

  return successResponse(tasks);
});

// -- POST /api/tasks ----------------------------------------------------------

/**
 * Create a new Google Task.
 * Body: { title, notes?, due?, taskListId? }
 */
export const POST = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);

  const hasAccess = await hasGoogleAccess(userId);
  if (!hasAccess) {
    return errorResponse(
      "NO_GOOGLE_ACCESS",
      "Google Tasks not connected. Connect your Google account in Settings.",
      403
    );
  }

  const body = createSchema.parse(await req.json());
  const { title, notes, due, taskListId } = body;

  const task = await createTask(userId, taskListId, { title, notes, due });

  return successResponse(task);
});

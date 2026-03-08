import { NextRequest } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/db/client";
import Agent from "@/lib/db/models/agent";
import AgentTask from "@/lib/db/models/agent-task";
import { authenticateRequest } from "@/lib/auth/middleware";
import { createTask as createGoogleTask } from "@/lib/google/tasks";
import { hasGoogleAccess } from "@/lib/google/client";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
  serverErrorResponse,
} from "@/lib/utils/api-response";

const createTaskSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(2000).optional(),
  priority: z.enum(["high", "medium", "low"]).optional().default("medium"),
  source: z
    .enum(["meeting_transcript", "meeting_minutes", "manual", "agent_inferred", "collaboration"])
    .optional()
    .default("manual"),
  dueDate: z.string().optional(),
  estimatedMinutes: z.number().min(1).optional(),
  tags: z.array(z.string()).optional().default([]),
  syncToGoogle: z.boolean().optional().default(false),
});

/**
 * GET /api/agents/tasks
 * List the authenticated user's agent-tracked tasks.
 */
export async function GET(request: NextRequest) {
  try {
    let userId: string;
    try {
      const payload = await authenticateRequest(request);
      userId = payload.userId;
    } catch {
      return unauthorizedResponse();
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const priority = searchParams.get("priority");
    const source = searchParams.get("source");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter: any = { userId };
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (source) filter.source = source;

    const tasks = await AgentTask.find(filter)
      .sort({ priority: 1, dueDate: 1, createdAt: -1 })
      .limit(100)
      .lean();

    return successResponse(
      tasks.map((t) => ({
        id: t._id.toString(),
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        source: t.source,
        sourceMeetingId: t.sourceMeetingId?.toString(),
        estimatedMinutes: t.estimatedMinutes,
        scheduledStart: t.scheduledStart,
        scheduledEnd: t.scheduledEnd,
        dueDate: t.dueDate,
        assignee: t.assignee,
        tags: t.tags,
        completedAt: t.completedAt,
        googleTaskId: t.googleTaskId,
        googleCalendarEventId: t.googleCalendarEventId,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      }))
    );
  } catch (error) {
    console.error("[Tasks GET Error]", error);
    return serverErrorResponse("Failed to retrieve tasks.");
  }
}

/**
 * POST /api/agents/tasks
 * Create a new agent-tracked task. Optionally syncs to Google Tasks.
 */
export async function POST(request: NextRequest) {
  try {
    let userId: string;
    try {
      const payload = await authenticateRequest(request);
      userId = payload.userId;
    } catch {
      return unauthorizedResponse();
    }

    const body = await request.json();
    const parsed = createTaskSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse({
        message: "Validation failed.",
        status: 400,
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    await connectDB();

    // Get or create the user's agent
    let agent = await Agent.findOne({ userId });
    if (!agent) {
      agent = await Agent.create({ userId, name: "Doodle", status: "idle" });
    }

    const taskData: Record<string, unknown> = {
      userId,
      agentId: agent._id,
      title: parsed.data.title,
      description: parsed.data.description,
      priority: parsed.data.priority,
      source: parsed.data.source,
      tags: parsed.data.tags,
      estimatedMinutes: parsed.data.estimatedMinutes,
    };

    if (parsed.data.dueDate) {
      taskData.dueDate = new Date(parsed.data.dueDate);
    }

    // Optionally sync to Google Tasks
    if (parsed.data.syncToGoogle) {
      const hasAccess = await hasGoogleAccess(userId);
      if (hasAccess) {
        try {
          const googleTask = await createGoogleTask(userId, "@default", {
            title: parsed.data.title,
            notes: parsed.data.description,
            due: parsed.data.dueDate,
          });
          taskData.googleTaskId = googleTask.id;
          taskData.googleTaskListId = "@default";
        } catch (err) {
          console.error("[Google Task Sync Error]", err);
        }
      }
    }

    const task = await AgentTask.create(taskData);

    return successResponse(
      {
        id: task._id.toString(),
        title: task.title,
        status: task.status,
        priority: task.priority,
        source: task.source,
        googleTaskId: task.googleTaskId,
        createdAt: task.createdAt,
      },
      201
    );
  } catch (error) {
    console.error("[Tasks POST Error]", error);
    return serverErrorResponse("Failed to create task.");
  }
}

/**
 * PATCH /api/agents/tasks
 * Update a task (status, priority, schedule, etc.)
 * Pass task ID as query param: ?id=xxx
 */
export async function PATCH(request: NextRequest) {
  try {
    let userId: string;
    try {
      const payload = await authenticateRequest(request);
      userId = payload.userId;
    } catch {
      return unauthorizedResponse();
    }

    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get("id");
    if (!taskId) {
      return errorResponse("Task ID required.", 400);
    }

    await connectDB();

    const task = await AgentTask.findOne({ _id: taskId, userId });
    if (!task) {
      return errorResponse("Task not found.", 404);
    }

    const body = await request.json();

    // Apply updates
    if (body.title) task.title = body.title;
    if (body.description !== undefined) task.description = body.description;
    if (body.status) {
      task.status = body.status;
      if (body.status === "completed") {
        task.completedAt = new Date();
      }
    }
    if (body.priority) task.priority = body.priority;
    if (body.dueDate) task.dueDate = new Date(body.dueDate);
    if (body.scheduledStart) task.scheduledStart = new Date(body.scheduledStart);
    if (body.scheduledEnd) task.scheduledEnd = new Date(body.scheduledEnd);
    if (body.tags) task.tags = body.tags;
    if (body.estimatedMinutes) task.estimatedMinutes = body.estimatedMinutes;

    await task.save();

    return successResponse({
      id: task._id.toString(),
      title: task.title,
      status: task.status,
      priority: task.priority,
      completedAt: task.completedAt,
      scheduledStart: task.scheduledStart,
      scheduledEnd: task.scheduledEnd,
      updatedAt: task.updatedAt,
    });
  } catch (error) {
    console.error("[Tasks PATCH Error]", error);
    return serverErrorResponse("Failed to update task.");
  }
}

import { NextRequest } from "next/server";
import { z } from "zod";
import mongoose from "mongoose";
import { withHandler } from "@/lib/api/with-handler";
import { successResponse } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/auth/middleware";
import { BadRequestError, NotFoundError } from "@/lib/api/errors";
import connectDB from "@/lib/db/client";
import Agent from "@/lib/db/models/agent";
import AgentTask from "@/lib/db/models/agent-task";
import { createTask as createGoogleTask } from "@/lib/google/tasks";
import { hasGoogleAccess } from "@/lib/google/client";

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

const updateTaskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(2000).optional(),
  status: z.enum(["pending", "in_progress", "completed", "cancelled"]).optional(),
  priority: z.enum(["high", "medium", "low"]).optional(),
  dueDate: z.string().optional(),
  scheduledStart: z.string().optional(),
  scheduledEnd: z.string().optional(),
  tags: z.array(z.string()).optional(),
  estimatedMinutes: z.number().min(1).optional(),
});

/**
 * GET /api/agents/tasks
 * List the authenticated user's agent-tracked tasks.
 */
export const GET = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "ai");
  const userId = await getUserIdFromRequest(req);

  await connectDB();

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const priority = searchParams.get("priority");
  const source = searchParams.get("source");

  // Validate filter params against known enums to prevent arbitrary
  // values from being injected into the MongoDB query.
  const VALID_STATUSES = ["pending", "in_progress", "completed", "cancelled"];
  const VALID_PRIORITIES = ["high", "medium", "low"];
  const VALID_SOURCES = ["meeting_transcript", "meeting_minutes", "manual", "agent_inferred", "collaboration"];

  const filter: Record<string, string> = { userId };
  if (status && VALID_STATUSES.includes(status)) filter.status = status;
  if (priority && VALID_PRIORITIES.includes(priority)) filter.priority = priority;
  if (source && VALID_SOURCES.includes(source)) filter.source = source;

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
});

/**
 * POST /api/agents/tasks
 * Create a new agent-tracked task. Optionally syncs to Google Tasks.
 */
export const POST = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "ai");
  const userId = await getUserIdFromRequest(req);

  const body = createTaskSchema.parse(await req.json());

  await connectDB();

  // Get or create the user's agent (atomic to avoid race conditions)
  const agent = await Agent.findOneAndUpdate(
    { userId },
    {
      $setOnInsert: { userId, name: "Doodle", status: "idle" },
    },
    { upsert: true, new: true }
  );

  const taskData: Record<string, unknown> = {
    userId,
    agentId: agent._id,
    title: body.title,
    description: body.description,
    priority: body.priority,
    source: body.source,
    tags: body.tags,
    estimatedMinutes: body.estimatedMinutes,
  };

  if (body.dueDate) {
    taskData.dueDate = new Date(body.dueDate);
  }

  // Optionally sync to Google Tasks
  if (body.syncToGoogle) {
    const hasAccess = await hasGoogleAccess(userId);
    if (hasAccess) {
      try {
        const googleTask = await createGoogleTask(userId, "@default", {
          title: body.title,
          notes: body.description,
          due: body.dueDate,
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
});

/**
 * PATCH /api/agents/tasks
 * Update a task (status, priority, schedule, etc.)
 * Pass task ID as query param: ?id=xxx
 */
export const PATCH = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "ai");
  const userId = await getUserIdFromRequest(req);

  const { searchParams } = new URL(req.url);
  const taskId = searchParams.get("id");
  if (!taskId) {
    throw new BadRequestError("Task ID required.");
  }

  // Validate ObjectId format to avoid CastError
  if (!mongoose.Types.ObjectId.isValid(taskId)) {
    throw new BadRequestError("Invalid task ID.");
  }

  const body = updateTaskSchema.parse(await req.json());

  await connectDB();

  const task = await AgentTask.findOne({ _id: taskId, userId });
  if (!task) {
    throw new NotFoundError("Task not found.");
  }

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
});

import { NextRequest } from "next/server";
import { z } from "zod";
import mongoose from "mongoose";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse, errorResponse } from "@/lib/infra/api/response";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import connectDB from "@/lib/infra/db/client";
import MeetingTemplate from "@/lib/infra/db/models/meeting-template";

// ── GET /api/meetings/templates ─────────────────────────────────────

export const GET = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "meetings");
  const userId = await getUserIdFromRequest(req);

  await connectDB();

  const templates = await MeetingTemplate.find({
    userId: new mongoose.Types.ObjectId(userId),
  })
    .sort({ usageCount: -1, updatedAt: -1 })
    .lean();

  return successResponse(templates);
});

// ── POST /api/meetings/templates ────────────────────────────────────

const createTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  defaultDuration: z.number().int().min(5).max(480).default(30),
  agendaSkeleton: z.array(z.string()).default([]),
  preMeetingChecklist: z.array(z.string()).default([]),
  cascadeConfig: z
    .object({
      createMomDoc: z.boolean().default(true),
      createTasks: z.boolean().default(true),
      sendFollowUpEmail: z.boolean().default(true),
      appendToSheet: z.boolean().default(true),
      scheduleNextMeeting: z.boolean().default(false),
    })
    .default({
      createMomDoc: true,
      createTasks: true,
      sendFollowUpEmail: true,
      appendToSheet: true,
      scheduleNextMeeting: false,
    }),
  meetingSettings: z
    .object({
      maxParticipants: z.number().int().min(1).max(100).optional(),
      waitingRoom: z.boolean().optional(),
      muteOnJoin: z.boolean().optional(),
    })
    .default({}),
});

export const POST = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "meetings");
  const userId = await getUserIdFromRequest(req);

  const body = createTemplateSchema.parse(await req.json());

  await connectDB();

  // Check for duplicate name
  const existing = await MeetingTemplate.findOne({
    userId: new mongoose.Types.ObjectId(userId),
    name: body.name,
  }).lean();

  if (existing) {
    return errorResponse(
      "DUPLICATE_TEMPLATE",
      `A template named "${body.name}" already exists`,
      409,
    );
  }

  const template = await MeetingTemplate.create({
    ...body,
    userId: new mongoose.Types.ObjectId(userId),
  });

  return successResponse(template, 201);
});

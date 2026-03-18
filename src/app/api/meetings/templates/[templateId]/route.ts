import { NextRequest } from "next/server";
import { z } from "zod";
import mongoose from "mongoose";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse, errorResponse } from "@/lib/infra/api/response";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import connectDB from "@/lib/infra/db/client";
import MeetingTemplate from "@/lib/infra/db/models/meeting-template";
import { BadRequestError } from "@/lib/infra/api/errors";

// ── PUT /api/meetings/templates/[templateId] ────────────────────────

const updateTemplateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  defaultDuration: z.number().int().min(5).max(480).optional(),
  agendaSkeleton: z.array(z.string()).optional(),
  preMeetingChecklist: z.array(z.string()).optional(),
  cascadeConfig: z
    .object({
      createMomDoc: z.boolean().optional(),
      createTasks: z.boolean().optional(),
      sendFollowUpEmail: z.boolean().optional(),
      appendToSheet: z.boolean().optional(),
      scheduleNextMeeting: z.boolean().optional(),
    })
    .optional(),
  meetingSettings: z
    .object({
      maxParticipants: z.number().int().min(1).max(100).optional(),
      waitingRoom: z.boolean().optional(),
      muteOnJoin: z.boolean().optional(),
    })
    .optional(),
});

export const PUT = withHandler(async (req: NextRequest, ctx?: { params: Promise<Record<string, string>> }) => {
  await checkRateLimit(req, "meetings");
  const userId = await getUserIdFromRequest(req);
  const { templateId } = await ctx!.params;

  if (!mongoose.Types.ObjectId.isValid(templateId)) {
    return errorResponse("VALIDATION_ERROR", "Invalid template ID", 400);
  }

  const body = updateTemplateSchema.parse(await req.json());

  const updateFields: Record<string, unknown> = {};
  if (body.name !== undefined) updateFields.name = body.name;
  if (body.description !== undefined) updateFields.description = body.description;
  if (body.defaultDuration !== undefined) updateFields.defaultDuration = body.defaultDuration;
  if (body.agendaSkeleton !== undefined) updateFields.agendaSkeleton = body.agendaSkeleton;
  if (body.preMeetingChecklist !== undefined) updateFields.preMeetingChecklist = body.preMeetingChecklist;
  if (body.cascadeConfig !== undefined) updateFields.cascadeConfig = body.cascadeConfig;
  if (body.meetingSettings !== undefined) updateFields.meetingSettings = body.meetingSettings;

  if (Object.keys(updateFields).length === 0) {
    throw new BadRequestError("No fields to update.");
  }

  await connectDB();

  const template = await MeetingTemplate.findOneAndUpdate(
    {
      _id: new mongoose.Types.ObjectId(templateId),
      userId: new mongoose.Types.ObjectId(userId),
    },
    { $set: updateFields },
    { new: true, runValidators: true },
  ).lean();

  if (!template) {
    return errorResponse("NOT_FOUND", "Template not found", 404);
  }

  return successResponse(template);
});

// ── DELETE /api/meetings/templates/[templateId] ─────────────────────

export const DELETE = withHandler(async (req: NextRequest, ctx?: { params: Promise<Record<string, string>> }) => {
  await checkRateLimit(req, "meetings");
  const userId = await getUserIdFromRequest(req);
  const { templateId } = await ctx!.params;

  if (!mongoose.Types.ObjectId.isValid(templateId)) {
    return errorResponse("VALIDATION_ERROR", "Invalid template ID", 400);
  }

  await connectDB();

  const result = await MeetingTemplate.deleteOne({
    _id: new mongoose.Types.ObjectId(templateId),
    userId: new mongoose.Types.ObjectId(userId),
  });

  if (result.deletedCount === 0) {
    return errorResponse("NOT_FOUND", "Template not found", 404);
  }

  return successResponse({ deleted: true });
});

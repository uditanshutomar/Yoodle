import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import {
  BadRequestError,
  NotFoundError,
} from "@/lib/infra/api/errors";
import connectDB from "@/lib/infra/db/client";
import Conversation from "@/lib/infra/db/models/conversation";

// -- PATCH /api/conversations/[id]/agent-toggle -------------------------------

export const PATCH = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);
  const { id } = await context!.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new BadRequestError("Invalid conversation ID.");
  }

  // Validate body
  const body = await req.json();
  const { enabled } = body;

  if (typeof enabled !== "boolean") {
    throw new BadRequestError("enabled must be a boolean.");
  }

  await connectDB();

  // Atomic: find conversation where user is a participant and update in one step
  const result = await Conversation.findOneAndUpdate(
    {
      _id: new mongoose.Types.ObjectId(id),
      "participants.userId": new mongoose.Types.ObjectId(userId),
    },
    { $set: { "participants.$.agentEnabled": enabled } },
  );

  if (!result) {
    throw new NotFoundError("Conversation not found.");
  }

  return successResponse({ agentEnabled: enabled });
});

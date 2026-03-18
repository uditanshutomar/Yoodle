import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
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

const muteSchema = z.object({
  muted: z.boolean(),
});

// -- PATCH /api/conversations/[id]/mute --------------------------------------

export const PATCH = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);
  const { id } = await context!.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new BadRequestError("Invalid conversation ID.");
  }

  await connectDB();

  // Validate body
  const { muted } = muteSchema.parse(await req.json());

  // Atomic: verify participant + update in a single operation
  const result = await Conversation.updateOne(
    {
      _id: new mongoose.Types.ObjectId(id),
      "participants.userId": new mongoose.Types.ObjectId(userId),
    },
    { $set: { "participants.$.muted": muted } }
  );

  if (result.matchedCount === 0) {
    throw new NotFoundError("Conversation not found.");
  }

  return successResponse({ muted });
});

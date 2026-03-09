import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api/with-handler";
import { successResponse } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/auth/middleware";
import { BadRequestError, NotFoundError, ForbiddenError } from "@/lib/api/errors";
import connectDB from "@/lib/db/client";
import Agent from "@/lib/db/models/agent";
import AgentChannel from "@/lib/db/models/agent-channel";

/**
 * GET /api/agents/collaborate/:channelId
 * Get channel details. Only participants can view.
 */
export const GET = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "ai");
  const userId = await getUserIdFromRequest(req);

  const { channelId } = await context!.params;
  if (!channelId?.match(/^[0-9a-fA-F]{24}$/)) {
    throw new BadRequestError("Invalid channel ID");
  }

  await connectDB();

  const channel = await AgentChannel.findById(channelId);
  if (!channel) {
    throw new NotFoundError("Channel not found.");
  }

  const isParticipant = channel.participants.some(
    (p) => p.userId.toString() === userId
  );
  if (!isParticipant) {
    throw new ForbiddenError("You are not a participant of this channel.");
  }

  return successResponse({
    channelId: channel._id.toString(),
    topic: channel.topic,
    status: channel.status,
    participants: channel.participants.map((p) => ({
      agentId: p.agentId.toString(),
      userId: p.userId.toString(),
      userName: p.userName,
      userEmail: p.userEmail,
    })),
    messageCount: channel.messages.length,
    createdAt: channel.createdAt,
    updatedAt: channel.updatedAt,
  });
});

/**
 * DELETE /api/agents/collaborate/:channelId
 * Close a collaboration channel. Only participants can close it.
 */
export const DELETE = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "ai");
  const userId = await getUserIdFromRequest(req);

  const { channelId } = await context!.params;
  if (!channelId?.match(/^[0-9a-fA-F]{24}$/)) {
    throw new BadRequestError("Invalid channel ID");
  }

  await connectDB();

  const channel = await AgentChannel.findById(channelId);
  if (!channel) {
    throw new NotFoundError("Channel not found.");
  }

  const isParticipant = channel.participants.some(
    (p) => p.userId.toString() === userId
  );
  if (!isParticipant) {
    throw new ForbiddenError("You are not a participant of this channel.");
  }

  // Close the channel
  const closingParticipant = channel.participants.find(
    (p) => p.userId.toString() === userId
  );
  if (!closingParticipant) {
    throw new Error("Channel is missing participant data.");
  }
  channel.status = "closed";
  channel.messages.push({
    fromAgentId: closingParticipant.agentId,
    fromUserId: closingParticipant.userId,
    fromUserName: closingParticipant.userName,
    content: "Collaboration ended.",
    type: "system",
    timestamp: new Date(),
  });
  await channel.save();

  // Remove from all agents' active collaborations and atomically
  // set status to idle if no other collaborations remain
  const agentIds = channel.participants.map((p) => p.agentId);
  await Agent.updateMany(
    { _id: { $in: agentIds } },
    { $pull: { activeCollaborations: channel._id } }
  );
  await Agent.updateMany(
    { _id: { $in: agentIds }, activeCollaborations: { $size: 0 } },
    { $set: { status: "idle" } }
  );

  return successResponse({ message: "Collaboration channel closed." });
});

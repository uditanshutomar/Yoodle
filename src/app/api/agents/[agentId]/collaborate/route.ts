import { NextRequest } from "next/server";
import { z } from "zod";
import { withHandler } from "@/lib/api/with-handler";
import { successResponse } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/auth/middleware";
import { BadRequestError, NotFoundError, ForbiddenError } from "@/lib/api/errors";
import connectDB from "@/lib/db/client";
import Agent from "@/lib/db/models/agent";
import AgentChannel from "@/lib/db/models/agent-channel";
import User from "@/lib/db/models/user";

const collaborateSchema = z.object({
  targetUserEmail: z.string().email("Valid email required."),
  topic: z.string().min(1, "Topic is required.").max(200),
});

/**
 * POST /api/agents/:agentId/collaborate
 * Initiate a collaboration channel between the current user's agent
 * and another user's agent. Only the agent owner can initiate.
 */
export const POST = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "ai");
  const userId = await getUserIdFromRequest(req);

  const { agentId } = await context!.params;
  if (!agentId?.match(/^[0-9a-fA-F]{24}$/)) {
    throw new BadRequestError("Invalid agent ID");
  }

  await connectDB();

  // Verify the requesting user owns this agent
  const myAgent = await Agent.findById(agentId);
  if (!myAgent) {
    throw new NotFoundError("Agent not found.");
  }
  if (myAgent.userId.toString() !== userId) {
    throw new ForbiddenError("You can only initiate collaborations from your own agent.");
  }

  const body = collaborateSchema.parse(await req.json());
  const { targetUserEmail, topic } = body;

  // Find the target user — only fetch fields needed for the collaboration channel
  const targetUser = await User.findOne({ email: targetUserEmail.toLowerCase() })
    .select("_id name displayName email");
  if (!targetUser) {
    throw new NotFoundError("Target user not found.");
  }

  if (targetUser._id.toString() === userId) {
    throw new BadRequestError("You can't collaborate with yourself.");
  }

  // Find or create the target user's agent (atomic to avoid race conditions)
  const targetAgent = await Agent.findOneAndUpdate(
    { userId: targetUser._id },
    {
      $setOnInsert: { userId: targetUser._id, name: "Doodle", status: "idle" },
    },
    { upsert: true, new: true }
  );

  // Get initiator user info — only fetch fields needed for the collaboration channel
  const initiatorUser = await User.findById(userId).select("_id name displayName email");
  if (!initiatorUser) {
    throw new NotFoundError("Initiator user not found.");
  }

  // Create the collaboration channel (include emails for calendar integration)
  const channel = await AgentChannel.create({
    topic,
    participants: [
      {
        agentId: myAgent._id,
        userId: initiatorUser._id,
        userName: initiatorUser.displayName || initiatorUser.name,
        userEmail: initiatorUser.email,
      },
      {
        agentId: targetAgent._id,
        userId: targetUser._id,
        userName: targetUser.displayName || targetUser.name,
        userEmail: targetUser.email,
      },
    ],
    messages: [
      {
        fromAgentId: myAgent._id,
        fromUserId: initiatorUser._id,
        fromUserName: initiatorUser.displayName || initiatorUser.name,
        content: `Collaboration started: "${topic}"`,
        type: "system",
        timestamp: new Date(),
      },
    ],
    status: "active",
    initiatorUserId: initiatorUser._id,
  });

  // Add the channel to both agents' active collaborations
  await Promise.all([
    Agent.findByIdAndUpdate(myAgent._id, {
      $push: { activeCollaborations: channel._id },
      $set: { status: "collaborating" },
    }),
    Agent.findByIdAndUpdate(targetAgent._id, {
      $push: { activeCollaborations: channel._id },
      $set: { status: "collaborating" },
    }),
  ]);

  return successResponse(
    {
      channelId: channel._id.toString(),
      topic: channel.topic,
      participants: channel.participants.map((p) => ({
        agentId: p.agentId.toString(),
        userId: p.userId.toString(),
        userName: p.userName,
        userEmail: p.userEmail,
      })),
      status: channel.status,
      createdAt: channel.createdAt,
    },
    201
  );
});

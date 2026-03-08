import { NextRequest } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/db/client";
import Agent from "@/lib/db/models/agent";
import AgentChannel from "@/lib/db/models/agent-channel";
import User from "@/lib/db/models/user";
import { authenticateRequest } from "@/lib/auth/middleware";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
  forbiddenResponse,
  notFoundResponse,
  serverErrorResponse,
} from "@/lib/utils/api-response";

const collaborateSchema = z.object({
  targetUserEmail: z.string().email("Valid email required."),
  topic: z.string().min(1, "Topic is required.").max(200),
});

/**
 * POST /api/agents/:agentId/collaborate
 * Initiate a collaboration channel between the current user's agent
 * and another user's agent. Only the agent owner can initiate.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    let userId: string;
    try {
      const payload = await authenticateRequest(request);
      userId = payload.userId;
    } catch {
      return unauthorizedResponse();
    }

    const { agentId } = await params;

    await connectDB();

    // Verify the requesting user owns this agent
    const myAgent = await Agent.findById(agentId);
    if (!myAgent) {
      return notFoundResponse("Agent not found.");
    }
    if (myAgent.userId.toString() !== userId) {
      return forbiddenResponse("You can only initiate collaborations from your own agent.");
    }

    const body = await request.json();
    const parsed = collaborateSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse({
        message: "Validation failed.",
        status: 400,
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const { targetUserEmail, topic } = parsed.data;

    // Find the target user
    const targetUser = await User.findOne({ email: targetUserEmail.toLowerCase() });
    if (!targetUser) {
      return notFoundResponse("Target user not found.");
    }

    if (targetUser._id.toString() === userId) {
      return errorResponse("You can't collaborate with yourself.", 400);
    }

    // Find or create the target user's agent (atomic to avoid race conditions)
    const targetAgent = await Agent.findOneAndUpdate(
      { userId: targetUser._id },
      {
        $setOnInsert: { userId: targetUser._id, name: "Doodle", status: "idle" },
      },
      { upsert: true, new: true }
    );

    // Get initiator user info
    const initiatorUser = await User.findById(userId);
    if (!initiatorUser) {
      return notFoundResponse("Initiator user not found.");
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
  } catch (error) {
    console.error("[Collaborate Error]", error);
    return serverErrorResponse("Failed to initiate collaboration.");
  }
}

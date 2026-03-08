import { NextRequest } from "next/server";
import connectDB from "@/lib/db/client";
import Agent from "@/lib/db/models/agent";
import AgentChannel from "@/lib/db/models/agent-channel";
import { authenticateRequest } from "@/lib/auth/middleware";
import {
  successResponse,
  unauthorizedResponse,
  forbiddenResponse,
  notFoundResponse,
  serverErrorResponse,
} from "@/lib/utils/api-response";

/**
 * GET /api/agents/collaborate/:channelId
 * Get channel details. Only participants can view.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  try {
    let userId: string;
    try {
      const payload = await authenticateRequest(request);
      userId = payload.userId;
    } catch {
      return unauthorizedResponse();
    }

    const { channelId } = await params;
    await connectDB();

    const channel = await AgentChannel.findById(channelId);
    if (!channel) {
      return notFoundResponse("Channel not found.");
    }

    const isParticipant = channel.participants.some(
      (p) => p.userId.toString() === userId
    );
    if (!isParticipant) {
      return forbiddenResponse("You are not a participant of this channel.");
    }

    return successResponse({
      channelId: channel._id.toString(),
      topic: channel.topic,
      status: channel.status,
      participants: channel.participants.map((p) => ({
        agentId: p.agentId.toString(),
        userId: p.userId.toString(),
        userName: p.userName,
      })),
      messageCount: channel.messages.length,
      createdAt: channel.createdAt,
      updatedAt: channel.updatedAt,
    });
  } catch (error) {
    console.error("[Channel GET Error]", error);
    return serverErrorResponse("Failed to retrieve channel.");
  }
}

/**
 * DELETE /api/agents/collaborate/:channelId
 * Close a collaboration channel. Only participants can close it.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  try {
    let userId: string;
    try {
      const payload = await authenticateRequest(request);
      userId = payload.userId;
    } catch {
      return unauthorizedResponse();
    }

    const { channelId } = await params;
    await connectDB();

    const channel = await AgentChannel.findById(channelId);
    if (!channel) {
      return notFoundResponse("Channel not found.");
    }

    const isParticipant = channel.participants.some(
      (p) => p.userId.toString() === userId
    );
    if (!isParticipant) {
      return forbiddenResponse("You are not a participant of this channel.");
    }

    // Close the channel
    channel.status = "closed";
    channel.messages.push({
      fromAgentId: channel.participants[0].agentId,
      fromUserId: channel.participants.find(
        (p) => p.userId.toString() === userId
      )!.userId,
      fromUserName: channel.participants.find(
        (p) => p.userId.toString() === userId
      )!.userName,
      content: "Collaboration ended.",
      type: "system",
      timestamp: new Date(),
    });
    await channel.save();

    // Remove from all agents' active collaborations
    const agentIds = channel.participants.map((p) => p.agentId);
    await Agent.updateMany(
      { _id: { $in: agentIds } },
      { $pull: { activeCollaborations: channel._id } }
    );

    // Set agents back to idle if they have no other active collaborations
    for (const agentId of agentIds) {
      const agent = await Agent.findById(agentId);
      if (agent && agent.activeCollaborations.length === 0) {
        agent.status = "idle";
        await agent.save();
      }
    }

    return successResponse({ message: "Collaboration channel closed." });
  } catch (error) {
    console.error("[Channel DELETE Error]", error);
    return serverErrorResponse("Failed to close channel.");
  }
}

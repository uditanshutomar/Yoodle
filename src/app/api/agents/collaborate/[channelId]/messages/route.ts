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
import AIMemory from "@/lib/db/models/ai-memory";
import { chatWithAssistant } from "@/lib/ai/gemini";
import { buildWorkspaceContext } from "@/lib/google/workspace-context";

const messageSchema = z.object({
  message: z.string().min(1, "Message is required.").max(5000),
});

/**
 * GET /api/agents/collaborate/:channelId/messages
 * Get the message history of a collaboration channel.
 * Only participants can view.
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

  // Only participants can view messages
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messages: channel.messages.map((m: any) => ({
      id: m._id?.toString(),
      fromAgentId: m.fromAgentId.toString(),
      fromUserId: m.fromUserId.toString(),
      fromUserName: m.fromUserName,
      content: m.content,
      type: m.type,
      timestamp: m.timestamp,
    })),
  });
});

/**
 * POST /api/agents/collaborate/:channelId/messages
 * Send a message in a collaboration channel. The user sends a message,
 * their agent processes it, and the other agent(s) automatically respond.
 * Only participants can send messages.
 */
export const POST = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "ai");
  const userId = await getUserIdFromRequest(req);

  const { channelId } = await context!.params;
  if (!channelId?.match(/^[0-9a-fA-F]{24}$/)) {
    throw new BadRequestError("Invalid channel ID");
  }

  const body = messageSchema.parse(await req.json());
  const { message } = body;

  await connectDB();

  const channel = await AgentChannel.findById(channelId);
  if (!channel) {
    throw new NotFoundError("Channel not found.");
  }

  if (channel.status !== "active") {
    throw new BadRequestError("This collaboration channel is closed.");
  }

  // Verify sender is a participant
  const senderParticipant = channel.participants.find(
    (p) => p.userId.toString() === userId
  );
  if (!senderParticipant) {
    throw new ForbiddenError("You are not a participant of this channel.");
  }

  const senderUser = await User.findById(userId);
  if (!senderUser) {
    throw new NotFoundError("User not found.");
  }

  // Add the user's message to the channel
  const userMessage = {
    fromAgentId: senderParticipant.agentId,
    fromUserId: senderUser._id,
    fromUserName: senderUser.displayName || senderUser.name,
    content: message,
    type: "user" as const,
    timestamp: new Date(),
  };

  channel.messages.push(userMessage);

  // Build context for sender's agent
  const [senderMemories, senderWorkspace] = await Promise.all([
    AIMemory.find({ userId })
      .sort({ updatedAt: -1 })
      .limit(30)
      .lean(),
    buildWorkspaceContext(userId).catch(() => ""),
  ]);

  const senderContext = {
    name: senderUser.displayName || senderUser.name,
    memories: senderMemories.map((m) => `[${m.category}] ${m.content}`),
    workspaceContext: senderWorkspace || undefined,
  };

  // Build the conversation history for the AI
  const channelHistory = channel.messages.slice(-30).map((m) => ({
    role: m.fromUserId.toString() === userId ? "user" as const : "model" as const,
    content: `[${m.fromUserName}${m.type === "agent" ? "'s Doodle" : ""}]: ${m.content}`,
  }));

  // Generate the sender's agent response
  const senderAgentResponse = await chatWithAssistant(
    channelHistory,
    {
      ...senderContext,
      name: `${senderContext.name}'s Doodle (collaborating on: "${channel.topic}")`,
    }
  );

  // Add sender's agent response
  const senderAgentMessage = {
    fromAgentId: senderParticipant.agentId,
    fromUserId: senderUser._id,
    fromUserName: senderUser.displayName || senderUser.name,
    content: senderAgentResponse,
    type: "agent" as const,
    timestamp: new Date(),
  };
  channel.messages.push(senderAgentMessage);

  // Now get the OTHER participant's agent to respond
  const otherParticipants = channel.participants.filter(
    (p) => p.userId.toString() !== userId
  );

  const otherResponses: {
    fromAgentId: typeof otherParticipants[0]["agentId"];
    fromUserId: typeof otherParticipants[0]["userId"];
    fromUserName: string;
    content: string;
    type: "agent";
    timestamp: Date;
  }[] = [];

  for (const otherParticipant of otherParticipants) {
    const otherUser = await User.findById(otherParticipant.userId);
    if (!otherUser) continue;

    const otherAgent = await Agent.findById(otherParticipant.agentId);
    if (!otherAgent) continue;

    // Build context for the other agent
    const [otherMemories, otherWorkspace] = await Promise.all([
      AIMemory.find({ userId: otherParticipant.userId })
        .sort({ updatedAt: -1 })
        .limit(30)
        .lean(),
      buildWorkspaceContext(otherParticipant.userId.toString()).catch(() => ""),
    ]);

    const otherContext = {
      name: otherUser.displayName || otherUser.name,
      memories: otherMemories.map((m) => `[${m.category}] ${m.content}`),
      workspaceContext: otherWorkspace || undefined,
    };

    // Build history from the other agent's perspective
    const otherHistory = channel.messages.slice(-30).map((m) => ({
      role:
        m.fromUserId.toString() === otherParticipant.userId.toString()
          ? "user" as const
          : "model" as const,
      content: `[${m.fromUserName}${m.type === "agent" ? "'s Doodle" : ""}]: ${m.content}`,
    }));

    const otherAgentResponse = await chatWithAssistant(
      otherHistory,
      {
        ...otherContext,
        name: `${otherContext.name}'s Doodle (collaborating on: "${channel.topic}")`,
      }
    );

    const otherAgentMessage = {
      fromAgentId: otherParticipant.agentId,
      fromUserId: otherUser._id,
      fromUserName: otherUser.displayName || otherUser.name,
      content: otherAgentResponse,
      type: "agent" as const,
      timestamp: new Date(),
    };

    channel.messages.push(otherAgentMessage);
    otherResponses.push(otherAgentMessage);
  }

  await channel.save();

  // Update agent activity timestamps
  const agentIds = channel.participants.map((p) => p.agentId);
  await Agent.updateMany(
    { _id: { $in: agentIds } },
    { $set: { lastActiveAt: new Date(), status: "collaborating" } }
  );

  // Format the response
  const newMessages = [userMessage, senderAgentMessage, ...otherResponses];

  return successResponse({
    channelId: channel._id.toString(),
    newMessages: newMessages.map((m) => ({
      fromAgentId: m.fromAgentId.toString(),
      fromUserId: m.fromUserId.toString(),
      fromUserName: m.fromUserName,
      content: m.content,
      type: m.type,
      timestamp: m.timestamp,
    })),
  });
});

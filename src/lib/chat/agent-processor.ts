import { getModel } from "@/lib/ai/gemini";
import DirectMessage from "@/lib/infra/db/models/direct-message";
import Conversation from "@/lib/infra/db/models/conversation";
import User from "@/lib/infra/db/models/user";
import { getRedisClient } from "@/lib/infra/redis/client";
import { createLogger } from "@/lib/infra/logger";
import mongoose from "mongoose";
import type Redis from "ioredis";

const log = createLogger("agent-processor");

/**
 * Process agent responses for a conversation after a new message.
 * Called from the messages POST endpoint.
 */
export async function processAgentResponses(
  conversationId: string,
  triggerMessage: { senderId: string; content: string }
) {
  try {
    const conv = await Conversation.findById(conversationId);
    if (!conv) return;

    // Find participants with agent enabled (excluding the message sender)
    const agentParticipants = conv.participants.filter(
      (p) => p.agentEnabled && p.userId.toString() !== triggerMessage.senderId
    );

    if (agentParticipants.length === 0) return;

    // Process each agent in parallel
    await Promise.allSettled(
      agentParticipants.map((p) =>
        processOneAgent(conversationId, triggerMessage, p.userId.toString())
      )
    );
  } catch (error) {
    log.error({ error, conversationId }, "Failed to process agent responses");
  }
}

async function processOneAgent(
  conversationId: string,
  triggerMessage: { senderId: string; content: string },
  agentUserId: string
) {
  const redis = getRedisClient();
  const user = await User.findById(agentUserId).lean();
  if (!user) return;

  // DND auto-reply — don't do full Gemini call
  if (user.status === "dnd") {
    const autoReply = `${user.displayName} is in focus mode right now. I'll make sure they see your message when they're back!`;
    await saveAndPublishAgentMessage(
      conversationId,
      agentUserId,
      autoReply,
      redis
    );
    return;
  }

  // Publish "agent thinking" event
  await redis.publish(
    `chat:${conversationId}`,
    JSON.stringify({
      type: "agent_thinking",
      userId: agentUserId,
      agentName: `${user.displayName}'s Doodle`,
    })
  );

  // Load last 15 messages for context
  const recentMessages = await DirectMessage.find({
    conversationId: new mongoose.Types.ObjectId(conversationId),
  })
    .sort({ createdAt: -1 })
    .limit(15)
    .populate("senderId", "name displayName")
    .lean();

  const history = recentMessages.reverse().map((m) => {
    const sender = m.senderId as unknown as {
      displayName?: string;
      name?: string;
    };
    const senderName = sender?.displayName || sender?.name || "Unknown";
    return `[${senderName}]: ${m.content}`;
  });

  // Ask Gemini if agent should respond
  const shouldRespond = await checkShouldRespond(
    history,
    triggerMessage.content,
    user.displayName
  );
  if (!shouldRespond) {
    // Clear thinking indicator
    await redis.publish(
      `chat:${conversationId}`,
      JSON.stringify({ type: "agent_thinking_done", userId: agentUserId })
    );
    return;
  }

  // Generate response
  const model = getModel();
  const chatContext = history.join("\n");
  const systemPrompt = buildAgentChatPrompt(user.displayName);

  try {
    const chat = model.startChat({
      systemInstruction: {
        role: "user",
        parts: [{ text: systemPrompt }],
      },
      history: [
        {
          role: "user",
          parts: [
            {
              text: `Here's the recent conversation:\n${chatContext}`,
            },
          ],
        },
        {
          role: "model",
          parts: [
            {
              text: "I understand the conversation context. I'll respond naturally as your assistant.",
            },
          ],
        },
      ],
    });

    const result = await chat.sendMessage(triggerMessage.content);
    const response = result.response.text();

    if (response?.trim()) {
      await saveAndPublishAgentMessage(
        conversationId,
        agentUserId,
        response.trim(),
        redis
      );
    }
  } catch (error) {
    log.error(
      { error, agentUserId, conversationId },
      "Gemini agent response failed"
    );
  }
}

async function saveAndPublishAgentMessage(
  conversationId: string,
  agentUserId: string,
  content: string,
  redis: Redis
) {
  const agentMessage = await DirectMessage.create({
    conversationId: new mongoose.Types.ObjectId(conversationId),
    senderId: new mongoose.Types.ObjectId(agentUserId),
    senderType: "agent",
    content,
    type: "agent",
    agentMeta: { forUserId: new mongoose.Types.ObjectId(agentUserId) },
  });

  await Conversation.updateOne(
    { _id: conversationId },
    {
      lastMessageAt: agentMessage.createdAt,
      lastMessagePreview: content.slice(0, 100),
      lastMessageSenderId: new mongoose.Types.ObjectId(agentUserId),
    }
  );

  const populated = await DirectMessage.findById(agentMessage._id)
    .populate("senderId", "name displayName avatarUrl status")
    .lean();

  await redis.publish(
    `chat:${conversationId}`,
    JSON.stringify({ type: "message", data: populated })
  );
}

async function checkShouldRespond(
  conversationHistory: string[],
  latestMessage: string,
  agentUserName: string
): Promise<boolean> {
  try {
    const model = getModel();
    const prompt = `You are deciding whether ${agentUserName}'s AI assistant should respond in a group conversation.

Recent messages:
${conversationHistory.slice(-5).join("\n")}

Latest message: "${latestMessage}"

Should ${agentUserName}'s assistant respond? Answer YES only if:
- The message directly asks ${agentUserName} something
- The message mentions ${agentUserName} by name
- The message asks about scheduling/availability involving ${agentUserName}
- The message is directed at "@Doodle" or the assistant
- The assistant can add genuinely useful information

Answer NO if:
- It's casual chat not involving ${agentUserName}
- Someone else already answered
- The message is a reaction or acknowledgment

Reply with ONLY "YES" or "NO".`;

    const result = await model.generateContent(prompt);
    const answer = result.response.text().trim().toUpperCase();
    return answer === "YES";
  } catch {
    return false; // Default to not responding on error
  }
}

function buildAgentChatPrompt(userName: string): string {
  return `You are ${userName}'s Doodle assistant, participating in a group conversation on Yoodle.

RULES:
- Be concise and helpful. Max 2-3 sentences unless more detail is needed.
- Don't repeat information already in the conversation.
- Speak naturally, as if you're a helpful teammate.
- If asked about ${userName}'s schedule, availability, or tasks — provide what you know.
- If you can't help with something, say so briefly.
- Don't be overly formal or robotic.
- Never reveal private information about ${userName} to others without clear context that it's appropriate.
- Use markdown formatting when helpful (bold, lists, etc.)

PERSONALITY:
- Friendly but efficient
- Proactive when you spot opportunities to help
- ${userName}'s interests come first`;
}

export { processOneAgent, checkShouldRespond, buildAgentChatPrompt };

import { getModel } from "@/lib/ai/gemini";
import User from "@/lib/infra/db/models/user";
import { createLogger } from "@/lib/infra/logger";
import connectDB from "@/lib/infra/db/client";

const log = createLogger("agent-channel");

export interface AgentRequest {
  intent: "find_available_time" | "check_email_status" | "get_task_status" | "general_query";
  fromUserId: string;
  toUserId: string;
  payload: Record<string, unknown>;
  conversationId: string;
}

export interface AgentResponse {
  success: boolean;
  data: Record<string, unknown>;
  error?: string;
}

/**
 * Send a request from one user's agent to another user's agent.
 * The target agent checks its user's workspace context and responds.
 */
export async function sendAgentRequest(request: AgentRequest): Promise<AgentResponse> {
  try {
    await connectDB();

    const targetUser = await User.findById(request.toUserId).lean();
    if (!targetUser) {
      return { success: false, data: {}, error: "Target user not found" };
    }

    // Check if target user has Google tokens (needed for workspace access)
    if (!targetUser.googleTokens) {
      return {
        success: false,
        data: {},
        error: `${targetUser.displayName} hasn't connected their Google account`,
      };
    }

    const model = getModel();
    const prompt = buildCollaborationPrompt(request, targetUser.displayName);

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // Parse the response into structured data
    return {
      success: true,
      data: {
        response: responseText,
        targetUserName: targetUser.displayName,
        intent: request.intent,
      },
    };
  } catch (error) {
    log.error({ error, request }, "Agent collaboration request failed");
    return {
      success: false,
      data: {},
      error: error instanceof Error ? error.message : "Agent collaboration failed",
    };
  }
}

function buildCollaborationPrompt(
  request: AgentRequest,
  targetUserName: string
): string {
  const intentPrompts: Record<string, string> = {
    find_available_time: `Check ${targetUserName}'s calendar and find available time slots. Details: ${JSON.stringify(request.payload)}. Return a concise list of available slots.`,
    check_email_status: `Check if ${targetUserName} has any relevant emails about: ${JSON.stringify(request.payload)}. Summarize briefly.`,
    get_task_status: `Check ${targetUserName}'s task list for items related to: ${JSON.stringify(request.payload)}. Summarize the status.`,
    general_query: `Answer this question on behalf of ${targetUserName}: ${JSON.stringify(request.payload)}. Be concise.`,
  };

  return intentPrompts[request.intent] || intentPrompts.general_query;
}

/**
 * Resolve a target user by name within a conversation's participants.
 * Used when an agent tool call specifies a user by display name.
 */
export async function resolveUserByName(
  name: string,
  conversationId: string
): Promise<string | null> {
  const Conversation = (await import("@/lib/infra/db/models/conversation")).default;
  const conv = await Conversation.findById(conversationId)
    .populate("participants.userId", "name displayName")
    .lean();

  if (!conv) return null;

  const normalizedName = name.toLowerCase();
  for (const p of conv.participants) {
    const u = p.userId as unknown as Record<string, unknown>;
    if (
      (u.displayName as string | undefined)?.toLowerCase().includes(normalizedName) ||
      (u.name as string | undefined)?.toLowerCase().includes(normalizedName)
    ) {
      return String(u._id);
    }
  }
  return null;
}

import { getModel } from "@/lib/ai/gemini";
import {
  buildAnalyzePrompt,
  buildDecidePrompt,
  buildRespondPrompt,
  buildReflectPrompt,
} from "@/lib/ai/prompts";
import { executeToolPlan, formatGatheredData } from "@/lib/chat/agent-tools";
import DirectMessage from "@/lib/infra/db/models/direct-message";
import Conversation from "@/lib/infra/db/models/conversation";
import ConversationContext from "@/lib/infra/db/models/conversation-context";
import User from "@/lib/infra/db/models/user";
import { getRedisClient } from "@/lib/infra/redis/client";
import { createLogger } from "@/lib/infra/logger";
import { toClientMessage } from "@/lib/chat/message-transform";
import mongoose from "mongoose";
import type Redis from "ioredis";
import { randomUUID } from "crypto";

const log = createLogger("agent-processor");

/** Gemini call timeout — prevents thinking indicator from hanging forever */
const GEMINI_TIMEOUT_MS = 15_000;

/** Don't send DND auto-reply if one was sent in the last 5 minutes */
const DND_DEBOUNCE_MS = 5 * 60 * 1000;

// ── Public entry point ──────────────────────────────────────────────

/**
 * Process agent responses for a conversation after a new message.
 * Called fire-and-forget from the messages POST endpoint.
 */
export async function processAgentResponses(
  conversationId: string,
  triggerMessage: { senderId: string; content: string }
) {
  try {
    const conv = await Conversation.findById(conversationId);
    if (!conv) return;

    const agentParticipants = conv.participants.filter((p) => p.agentEnabled);
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

// ── Per-agent ReAct pipeline ────────────────────────────────────────

async function processOneAgent(
  conversationId: string,
  triggerMessage: { senderId: string; content: string },
  agentUserId: string
) {
  // Guard: don't let an agent respond to its own messages (infinite loop)
  if (triggerMessage.senderId === agentUserId) return;

  const redis = getRedisClient();
  const user = await User.findById(agentUserId).lean();
  if (!user) return;

  const userName = user.displayName || user.name || "User";

  // DND auto-reply — skip the full pipeline, but debounce to avoid spam
  if (user.status === "dnd") {
    const recentDndReply = await DirectMessage.findOne({
      conversationId: new mongoose.Types.ObjectId(conversationId),
      senderId: new mongoose.Types.ObjectId(agentUserId),
      senderType: "agent",
      content: { $regex: /focus mode/i },
      createdAt: { $gte: new Date(Date.now() - DND_DEBOUNCE_MS) },
    }).lean();

    if (recentDndReply) return; // Already sent a DND reply recently

    const autoReply = `${userName} is in focus mode right now. I'll make sure they see your message when they're back!`;
    await saveAndPublishAgentMessage(conversationId, agentUserId, autoReply, redis);
    return;
  }

  // Publish "agent thinking" event
  await redis.publish(
    `chat:${conversationId}`,
    JSON.stringify({
      type: "agent_thinking",
      agentId: agentUserId,
      name: `${userName}'s Doodle`,
    })
  );

  try {
    // ── Load context ────────────────────────────────────────────
    const [recentMessages, conversationCtx, triggerSender] = await Promise.all([
      loadRecentMessages(conversationId, 30),
      loadOrCreateContext(conversationId),
      User.findById(triggerMessage.senderId).lean().then((u) => u?.displayName || u?.name || "Someone"),
    ]);

    const triggerSenderName = triggerSender as string;
    const history = formatMessageHistory(recentMessages);
    const last10 = formatMessageHistory(recentMessages.slice(-10));

    // ── Stage 1: ANALYZE ────────────────────────────────────────
    const analyzePrompt = buildAnalyzePrompt(
      userName,
      conversationCtx.summary,
      formatOpenQuestions(conversationCtx.openQuestions),
      formatActionItems(conversationCtx.actionItems),
      history,
      triggerMessage.content,
      triggerSenderName
    );

    const analysisRaw = await callGemini(analyzePrompt);
    const analysis = safeParseJson(analysisRaw);
    if (!analysis) {
      log.warn({ agentUserId, conversationId }, "ANALYZE stage returned invalid JSON");
      await publishThinkingDone(redis, conversationId, agentUserId);
      return;
    }

    log.info({ agentUserId, analysis }, "Stage 1 ANALYZE complete");

    // ── Stage 2: DECIDE ─────────────────────────────────────────
    const decidePrompt = buildDecidePrompt(userName, JSON.stringify(analysis));
    const decisionRaw = await callGemini(decidePrompt);
    const decision = safeParseJson(decisionRaw);
    if (!decision) {
      log.warn({ agentUserId, conversationId }, "DECIDE stage returned invalid JSON");
      await publishThinkingDone(redis, conversationId, agentUserId);
      return;
    }

    log.info({ agentUserId, decision: decision.decision, reason: decision.reason }, "Stage 2 DECIDE complete");

    if (decision.decision === "SILENT") {
      await publishThinkingDone(redis, conversationId, agentUserId);
      // Still run REFLECT to update memory even when silent
      await runReflect(conversationId, conversationCtx, recentMessages);
      return;
    }

    if (decision.decision === "UPDATE_MEMORY_ONLY") {
      await publishThinkingDone(redis, conversationId, agentUserId);
      await runReflect(conversationId, conversationCtx, recentMessages);
      return;
    }

    // ── Stage 3: GATHER ─────────────────────────────────────────
    const toolPlan: string[] = Array.isArray(decision.toolPlan) ? decision.toolPlan : [];
    const gatheredData = await executeToolPlan(agentUserId, toolPlan);
    const gatheredDataStr = formatGatheredData(gatheredData);

    log.info({
      agentUserId, toolPlan,
      hasCalendar: !!gatheredData.calendar, hasTasks: !!gatheredData.tasks,
      hasEmails: !!gatheredData.emails, hasFiles: !!gatheredData.files, hasContacts: !!gatheredData.contacts,
    }, "Stage 3 GATHER complete");

    // ── Stage 4: RESPOND ────────────────────────────────────────
    const respondPrompt = buildRespondPrompt(
      userName,
      conversationCtx.summary,
      JSON.stringify(analysis),
      gatheredDataStr,
      last10,
      triggerSenderName
    );

    const response = await callGemini(respondPrompt);

    if (response?.trim()) {
      await saveAndPublishAgentMessage(
        conversationId,
        agentUserId,
        response.trim(),
        redis
      );
    } else {
      await publishThinkingDone(redis, conversationId, agentUserId);
    }

    // ── Stage 5: REFLECT ────────────────────────────────────────
    // Include the agent's own response in the reflect context
    const allMessages = [
      ...recentMessages.map((m) => formatOneMessage(m)),
      ...(response?.trim() ? [`[${userName}'s Doodle]: ${response.trim()}`] : []),
    ];
    await runReflect(conversationId, conversationCtx, null, allMessages);
  } catch (error) {
    log.error({ error, agentUserId, conversationId }, "Agent pipeline failed");
    await publishThinkingDone(redis, conversationId, agentUserId);
  }
}

// ── Reflect stage (runs even on SILENT) ─────────────────────────────

async function runReflect(
  conversationId: string,
  currentCtx: {
    summary: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    actionItems: any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    decisions: any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    openQuestions: any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    facts: any[];
  },
  recentMessages?: unknown[] | null,
  formattedMessages?: string[]
) {
  try {
    const messages =
      formattedMessages ||
      (recentMessages ? (recentMessages as unknown[]).map((m) => formatOneMessage(m)) : []);

    // Pass IDs to the reflect prompt so it can reference them for resolution
    const contextForPrompt = {
      summary: currentCtx.summary,
      actionItems: currentCtx.actionItems.slice(-10).map((i) => ({
        id: i.id,
        assignee: i.assignee,
        description: i.description,
        status: i.status,
      })),
      decisions: currentCtx.decisions.slice(-5),
      openQuestions: currentCtx.openQuestions.slice(-5).map((q) => ({
        id: q.id,
        question: q.question,
        askedBy: q.askedBy,
      })),
      facts: currentCtx.facts.slice(-10),
    };

    const reflectPrompt = buildReflectPrompt(
      JSON.stringify(contextForPrompt),
      messages.slice(-15).join("\n")
    );

    const reflectRaw = await callGemini(reflectPrompt);
    const reflectData = safeParseJson(reflectRaw);
    if (!reflectData) return;

    const convObjId = new mongoose.Types.ObjectId(conversationId);

    // Step 1: $set for summary + resolve action items by marking status
    const setOps: Record<string, unknown> = { lastUpdatedAt: new Date() };
    if (reflectData.summaryUpdate) {
      setOps.summary = reflectData.summaryUpdate;
    }

    // Resolve action items (mark as done by ID)
    if (reflectData.resolvedActionItemIds?.length > 0) {
      await ConversationContext.updateOne(
        { conversationId: convObjId },
        { $set: { "actionItems.$[item].status": "done" } },
        { arrayFilters: [{ "item.id": { $in: reflectData.resolvedActionItemIds } }], upsert: true }
      );
    }

    // Step 2: $pull to remove resolved questions (separate op to avoid $push/$pull conflict)
    if (reflectData.resolvedQuestionIds?.length > 0) {
      await ConversationContext.updateOne(
        { conversationId: convObjId },
        { $pull: { openQuestions: { id: { $in: reflectData.resolvedQuestionIds } } } },
        { upsert: true }
      );
    }

    // Step 3: $set + $push for new items (single atomic operation)
    const pushOps: Record<string, unknown> = {};

    if (reflectData.newActionItems?.length > 0) {
      pushOps.actionItems = {
        $each: reflectData.newActionItems.map((item: { assignee: string; description: string }) => ({
          id: randomUUID().slice(0, 8),
          assignee: item.assignee || "unassigned",
          description: item.description,
          mentionedAt: new Date(),
          status: "open",
        })),
        $slice: -20,
      };
    }

    if (reflectData.newDecisions?.length > 0) {
      pushOps.decisions = {
        $each: reflectData.newDecisions.map((d: { description: string; participants: string[] }) => ({
          description: d.description,
          madeAt: new Date(),
          participants: d.participants || [],
        })),
        $slice: -10,
      };
    }

    if (reflectData.newFacts?.length > 0) {
      pushOps.facts = {
        $each: reflectData.newFacts.map((f: { content: string; mentionedBy: string }) => ({
          content: f.content,
          mentionedBy: f.mentionedBy || "unknown",
          mentionedAt: new Date(),
        })),
        $slice: -15,
      };
    }

    if (reflectData.newQuestions?.length > 0) {
      pushOps.openQuestions = {
        $each: reflectData.newQuestions.map((q: { question: string; askedBy: string }) => ({
          id: randomUUID().slice(0, 8),
          question: q.question,
          askedBy: q.askedBy || "unknown",
          askedAt: new Date(),
        })),
        $slice: -10,
      };
    }

    const finalOp: Record<string, unknown> = { $set: setOps };
    if (Object.keys(pushOps).length > 0) finalOp.$push = pushOps;

    await ConversationContext.updateOne(
      { conversationId: convObjId },
      finalOp,
      { upsert: true }
    );

    log.info({ conversationId }, "Stage 5 REFLECT complete");
  } catch (error) {
    // Reflect failure is non-fatal — don't break the pipeline
    log.warn({ error, conversationId }, "REFLECT stage failed (non-fatal)");
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

async function callGemini(prompt: string): Promise<string> {
  const model = getModel();
  const result = await Promise.race([
    model.generateContent(prompt),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Gemini call timed out")), GEMINI_TIMEOUT_MS)
    ),
  ]);
  return result.response.text().trim();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function safeParseJson(text: string): any | null {
  try {
    // Strip markdown code fences if present
    let cleaned = text;
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }
    return JSON.parse(cleaned);
  } catch {
    log.warn({ text: text.slice(0, 200) }, "Failed to parse Gemini JSON response");
    return null;
  }
}

async function loadRecentMessages(conversationId: string, limit: number) {
  const messages = await DirectMessage.find({
    conversationId: new mongoose.Types.ObjectId(conversationId),
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate("senderId", "name displayName")
    .lean();

  return messages.reverse();
}

async function loadOrCreateContext(conversationId: string) {
  const ctx = await ConversationContext.findOne({
    conversationId: new mongoose.Types.ObjectId(conversationId),
  }).lean();

  if (ctx) return ctx;

  // Return a default empty context (will be created on first REFLECT)
  return {
    summary: "",
    actionItems: [],
    decisions: [],
    openQuestions: [],
    facts: [],
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatOneMessage(m: any): string {
  const sender = m.senderId as { displayName?: string; name?: string } | null;
  const senderName = sender?.displayName || sender?.name || "Unknown";
  const prefix = m.senderType === "agent" ? `${senderName}'s Doodle` : senderName;
  return `[${prefix}]: ${m.content}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatMessageHistory(messages: any[]): string {
  return messages.map(formatOneMessage).join("\n");
}

function formatOpenQuestions(
  questions: { question: string; askedBy: string }[]
): string {
  if (!questions || questions.length === 0) return "(none)";
  return questions.map((q) => `- "${q.question}" (asked by ${q.askedBy})`).join("\n");
}

function formatActionItems(
  items: { assignee: string; description: string; status: string }[]
): string {
  const open = items?.filter((i) => i.status === "open") || [];
  if (open.length === 0) return "(none)";
  return open.map((i) => `- ${i.description} (assigned to ${i.assignee})`).join("\n");
}

async function publishThinkingDone(
  redis: Redis,
  conversationId: string,
  agentUserId: string
) {
  await redis.publish(
    `chat:${conversationId}`,
    JSON.stringify({ type: "agent_thinking_done", agentId: agentUserId })
  );
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
    JSON.stringify({ type: "message", data: toClientMessage(populated) })
  );
}

// ── Exports for testing ─────────────────────────────────────────────

export { processOneAgent };

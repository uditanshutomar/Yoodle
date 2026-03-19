import { getModel } from "@/lib/ai/gemini";
import {
  buildAnalyzeAndDecidePrompt,
  buildRespondPrompt,
  buildReflectPrompt,
} from "@/lib/ai/prompts";
import { executeToolPlan, formatGatheredData } from "@/lib/chat/agent-tools";
import Board from "@/lib/infra/db/models/board";
import Task from "@/lib/infra/db/models/task";
import DirectMessage from "@/lib/infra/db/models/direct-message";
import Conversation from "@/lib/infra/db/models/conversation";
import ConversationContext from "@/lib/infra/db/models/conversation-context";
import AIMemory from "@/lib/infra/db/models/ai-memory";
import User from "@/lib/infra/db/models/user";
import { getRedisClient } from "@/lib/infra/redis/client";
import { createLogger } from "@/lib/infra/logger";
import { toClientMessage } from "@/lib/chat/message-transform";
import mongoose from "mongoose";
import type Redis from "ioredis";
import { randomUUID } from "crypto";
import type { TriggerMessage, DecisionVerdict, ConversationContextSnapshot } from "@/lib/chat/types";

const log = createLogger("agent-processor");

/** Gemini call timeout — prevents thinking indicator from hanging forever */
const GEMINI_TIMEOUT_MS = 15_000;

/** Don't send DND auto-reply if one was sent in the last 5 minutes */
const DND_DEBOUNCE_MS = 5 * 60 * 1000;

/** Pipeline lock TTL — long enough for the full pipeline (2× Gemini + tools + DB).
 *  The finally block releases early via run ID check. */
const PIPELINE_LOCK_TTL_MS = 60_000;

// ── Public entry point ──────────────────────────────────────────────

/**
 * Process agent responses for a conversation after a new message.
 * Called fire-and-forget from the messages POST endpoint.
 */
export async function processAgentResponses(
  conversationId: string,
  triggerMessage: TriggerMessage
) {
  try {
    const conv = await Conversation.findById(conversationId).select("participants type meetingId").lean();
    if (!conv) return;

    const agentParticipants = conv.participants.filter((p) => p.agentEnabled);
    if (agentParticipants.length === 0) return;

    // Process each agent in parallel — pass pre-fetched conversation to avoid redundant DB fetch
    const results = await Promise.allSettled(
      agentParticipants.map((p) =>
        processOneAgent(conversationId, triggerMessage, p.userId.toString(), conv)
      )
    );

    // Log any rejected pipelines for observability
    for (const result of results) {
      if (result.status === "rejected") {
        log.error({ error: result.reason, conversationId }, "Agent pipeline rejected unexpectedly");
      }
    }
  } catch (error) {
    log.error({ error, conversationId }, "Failed to process agent responses");
  }
}

// ── Per-agent ReAct pipeline ────────────────────────────────────────

async function processOneAgent(
  conversationId: string,
  triggerMessage: TriggerMessage,
  agentUserId: string,
  conv: { type?: string; participants?: { userId: unknown }[]; meetingId?: unknown }
) {
  // Guard: don't let an agent respond to its own messages (infinite loop)
  if (triggerMessage.senderId === agentUserId) return;

  // Guard: don't let agents respond to other agents' messages (multi-agent loop)
  if (triggerMessage.senderType === "agent") return;

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

  // ── Pipeline debounce — skip if another run is already in-flight ──
  const debounceKey = `agent:debounce:${conversationId}:${agentUserId}`;
  const runId = randomUUID().slice(0, 8);

  // Wrap lock acquisition + thinking publish in try/catch so Redis errors
  // don't leave the thinking indicator stuck (no thinking_done published).
  let acquired: string | null;
  try {
    acquired = await redis.set(debounceKey, runId, "PX", PIPELINE_LOCK_TTL_MS, "NX");
  } catch (lockErr) {
    log.error({ error: lockErr, agentUserId, conversationId }, "Redis lock acquisition failed");
    return;
  }
  if (!acquired) {
    log.info({ agentUserId, conversationId }, "Pipeline debounced — another run in progress");
    return;
  }

  try {
    // Publish "agent thinking" event
    await redis.publish(
      `chat:${conversationId}`,
      JSON.stringify({
        type: "agent_thinking",
        agentId: agentUserId,
        name: `${userName}'s Yoodler`,
      })
    );
  } catch (thinkErr) {
    log.warn({ error: thinkErr, agentUserId, conversationId }, "Failed to publish agent_thinking event");
    // Continue — the pipeline can still run even if the thinking indicator wasn't published
  }

  try {
    // ── Load context ────────────────────────────────────────────
    const [recentMessages, conversationCtx, triggerSender, userMemories] = await Promise.all([
      loadRecentMessages(conversationId, 30),
      loadOrCreateContext(conversationId),
      User.findById(triggerMessage.senderId).select("displayName name").lean().then((u) => u?.displayName || u?.name || "Someone"),
      loadUserMemories(agentUserId),
    ]);

    // triggerSender is already the resolved display name string
    const history = formatMessageHistory(recentMessages);
    const last10 = formatMessageHistory(recentMessages.slice(-10));

    // Build conversation type context (1:1 vs group, participant count)
    const convType = conv?.type === "dm" ? "1:1 DM" : `group chat (${conv?.participants?.length || 0} members)`;

    // Check if conversation has a linked board
    let boardContextStr = "";
    try {
      const linkedBoard = await Board.findOne({ conversationId }).lean();
      if (linkedBoard) {
        const boardTasks = await Task.find({ boardId: linkedBoard._id, completedAt: null })
          .sort({ dueDate: 1 })
          .limit(10)
          .populate("assigneeId", "displayName")
          .lean();
        const taskLines = boardTasks.map((t) => {
          const col = linkedBoard.columns?.find((c: { id: string; title: string }) => c.id === t.columnId);
          const assignee = (t.assigneeId as { displayName?: string } | null)?.displayName || "Unassigned";
          return `  - "${t.title}" [${col?.title}] ${t.priority}, ${assignee}`;
        });
        boardContextStr = `\n\nConversation Board: "${linkedBoard.title}" (${boardTasks.length} tasks)\n${taskLines.join("\n")}`;
      }
    } catch (boardErr) {
      log.warn({ err: boardErr, conversationId }, "Failed to load board context (supplementary — continuing)");
    }

    // ── Stage 1+2: ANALYZE & DECIDE (merged) ─────────────────────
    const analyzeAndDecidePrompt = buildAnalyzeAndDecidePrompt(
      userName,
      conversationCtx.summary + boardContextStr,
      formatOpenQuestions(conversationCtx.openQuestions),
      formatActionItems(conversationCtx.actionItems),
      history,
      triggerMessage.content,
      triggerSender,
      convType,
      userMemories
    );

    const adRaw = await callGemini(analyzeAndDecidePrompt);
    const adResult = safeParseJson(adRaw);
    if (!adResult) {
      log.warn({ agentUserId, conversationId }, "ANALYZE+DECIDE stage returned invalid JSON");
      await publishThinkingDone(redis, conversationId, agentUserId);
      return;
    }

    // Extract analysis and decision parts from the merged response
    const analysis = adResult.analysis || adResult;
    const rawDecision = adResult.decision;
    const decision: { decision: DecisionVerdict; reason: string; toolPlan: string[] } = {
      decision: (typeof rawDecision === "string" ? rawDecision : "SILENT") as DecisionVerdict,
      reason: adResult.reason || "",
      toolPlan: adResult.toolPlan || [],
    };

    log.info({ agentUserId, decision: decision.decision, reason: decision.reason }, "Stage 1+2 ANALYZE+DECIDE complete");

    if (decision.decision === "SILENT" || decision.decision === "UPDATE_MEMORY_ONLY") {
      await publishThinkingDone(redis, conversationId, agentUserId);
      // Still run REFLECT to update memory even when not responding
      await runReflect(conversationId, conversationCtx, recentMessages);
      return;
    }

    // ── Stage 3: GATHER ─────────────────────────────────────────
    const toolPlan: string[] = Array.isArray(decision.toolPlan) ? decision.toolPlan : [];
    const userTimezone = (user as { timezone?: string }).timezone;
    const gatheredData = await executeToolPlan(agentUserId, toolPlan, userTimezone, conversationId);
    const gatheredDataStr = formatGatheredData(gatheredData);

    log.info({
      agentUserId, toolPlan,
      hasCalendar: !!gatheredData.calendar, hasTasks: !!gatheredData.tasks,
      hasEmails: !!gatheredData.emails, hasFiles: !!gatheredData.files,
      hasContacts: !!gatheredData.contacts, hasDocs: !!gatheredData.docs,
      hasSheets: !!gatheredData.sheets,
    }, "Stage 3 GATHER complete");

    // ── Stage 4: RESPOND ────────────────────────────────────────
    // Build structured analysis string instead of dumping raw JSON
    const structuredAnalysis = formatAnalysisForRespond(analysis, decision);

    const respondPrompt = buildRespondPrompt(
      userName,
      conversationCtx.summary,
      structuredAnalysis,
      gatheredDataStr,
      last10,
      triggerSender,
      userMemories
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
      ...(response?.trim() ? [`[${userName}'s Yoodler]: ${response.trim()}`] : []),
    ];
    await runReflect(conversationId, conversationCtx, null, allMessages);
  } catch (error) {
    log.error({ error, agentUserId, conversationId }, "Agent pipeline failed");
    try {
      await publishThinkingDone(redis, conversationId, agentUserId);
    } catch (redisErr) {
      log.warn({ error: redisErr, conversationId, agentUserId }, "Failed to publish thinking_done (Redis error)");
    }
  } finally {
    // Atomically release the debounce lock only if we still own it.
    // Uses a Redis Lua script so the check-and-delete is a single atomic
    // operation — prevents deleting a lock acquired by a newer pipeline run.
    try {
      // Atomic compare-and-delete via Redis EVAL (Lua script on the server).
      // This is ioredis's standard API for server-side Lua — not JS eval().
      const script = 'if redis.call("get",KEYS[1])==ARGV[1] then return redis.call("del",KEYS[1]) else return 0 end';
      await redis.eval(script, 1, debounceKey, runId);
    } catch (lockErr) {
      log.warn({ err: lockErr, debounceKey, runId }, "Failed to release pipeline lock (will auto-expire)");
    }
  }
}

// ── Reflect stage (runs even on SILENT) ─────────────────────────────

async function runReflect(
  conversationId: string,
  currentCtx: ConversationContextSnapshot,
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
      messages.slice(-30).join("\n")
    );

    const reflectRaw = await callGemini(reflectPrompt);
    const reflectData = safeParseJson(reflectRaw);
    if (!reflectData) return;

    const convObjId = new mongoose.Types.ObjectId(conversationId);

    // Validate Gemini output — arrays must actually be arrays (Gemini can return strings)
    const resolvedActionIds = Array.isArray(reflectData.resolvedActionItemIds) ? reflectData.resolvedActionItemIds : [];
    const resolvedQuestionIds = Array.isArray(reflectData.resolvedQuestionIds) ? reflectData.resolvedQuestionIds : [];
    const newActionItems = Array.isArray(reflectData.newActionItems) ? reflectData.newActionItems : [];
    const newDecisions = Array.isArray(reflectData.newDecisions) ? reflectData.newDecisions : [];
    const newFacts = Array.isArray(reflectData.newFacts) ? reflectData.newFacts : [];
    const newQuestions = Array.isArray(reflectData.newQuestions) ? reflectData.newQuestions : [];

    // Step 1: $set for summary + resolve action items by marking status
    const setOps: Record<string, unknown> = { lastUpdatedAt: new Date() };
    if (reflectData.summaryUpdate && typeof reflectData.summaryUpdate === "string") {
      setOps.summary = reflectData.summaryUpdate;
    }

    // Step 2: $set + $push for new items (single atomic operation, with upsert)
    const pushOps: Record<string, unknown> = {};

    // Filter out items with missing required fields (Gemini can return incomplete objects)
    const validActions = newActionItems.filter(
      (i: { description?: string }) => typeof i.description === "string" && i.description.trim().length > 0
    );
    if (validActions.length > 0) {
      pushOps.actionItems = {
        $each: validActions.map((item: { assignee?: string; description: string }) => ({
          id: randomUUID().slice(0, 8),
          assignee: item.assignee || "unassigned",
          description: item.description,
          mentionedAt: new Date(),
          status: "open",
        })),
        $slice: -20,
      };
    }

    const validDecisions = newDecisions.filter(
      (d: { description?: string }) => typeof d.description === "string" && d.description.trim().length > 0
    );
    if (validDecisions.length > 0) {
      pushOps.decisions = {
        $each: validDecisions.map((d: { description: string; participants?: string[] }) => ({
          description: d.description,
          madeAt: new Date(),
          participants: Array.isArray(d.participants) ? d.participants : [],
        })),
        $slice: -10,
      };
    }

    const validFacts = newFacts.filter(
      (f: { content?: string }) => typeof f.content === "string" && f.content.trim().length > 0
    );
    if (validFacts.length > 0) {
      pushOps.facts = {
        $each: validFacts.map((f: { content: string; mentionedBy?: string }) => ({
          content: f.content,
          mentionedBy: f.mentionedBy || "unknown",
          mentionedAt: new Date(),
        })),
        $slice: -15,
      };
    }

    const validQuestions = newQuestions.filter(
      (q: { question?: string }) => typeof q.question === "string" && q.question.trim().length > 0
    );
    if (validQuestions.length > 0) {
      pushOps.openQuestions = {
        $each: validQuestions.map((q: { question: string; askedBy?: string }) => ({
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

    // Run resolve ops AFTER upsert so the document is guaranteed to exist.
    // This avoids the bug where resolve ops were skipped on first-ever REFLECT
    // because the document didn't exist yet (ctxExists was false pre-upsert).
    if (resolvedActionIds.length > 0) {
      await ConversationContext.updateOne(
        { conversationId: convObjId },
        { $set: { "actionItems.$[item].status": "done" } },
        { arrayFilters: [{ "item.id": { $in: resolvedActionIds } }] }
      );
    }

    if (resolvedQuestionIds.length > 0) {
      await ConversationContext.updateOne(
        { conversationId: convObjId },
        { $pull: { openQuestions: { id: { $in: resolvedQuestionIds } } } }
      );
    }

    // Store task-worthy items as facts for the next agent response cycle
    const taskWorthy = reflectData.taskWorthy || [];
    if (taskWorthy.length > 0) {
      log.info({ conversationId, taskWorthy: taskWorthy.length }, "Task-worthy items detected");
      const taskFacts = taskWorthy.map((tw: { title: string; assignee: string; reason: string }) => ({
        content: `[TASK-WORTHY] ${tw.title} assigned to ${tw.assignee}. ${tw.reason}`,
        mentionedBy: "system",
        mentionedAt: new Date(),
      }));
      await ConversationContext.updateOne(
        { conversationId: convObjId },
        { $push: { facts: { $each: taskFacts, $slice: -15 } } }
      );
    }

    log.info({ conversationId }, "Stage 5 REFLECT complete");
  } catch (error) {
    // Reflect failure is non-fatal — don't break the pipeline
    log.warn({ error, conversationId }, "REFLECT stage failed (non-fatal)");
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Load user's AIMemory entries (preferences, habits, relationships).
 * Returns a formatted string for injection into prompts.
 */
async function loadUserMemories(userId: string): Promise<string> {
  try {
    const memories = await AIMemory.find({
      userId: new mongoose.Types.ObjectId(userId),
      $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: new Date() } }],
    })
      .sort({ confidence: -1, updatedAt: -1 })
      .limit(30)
      .lean();

    if (memories.length === 0) return "";

    const categoryOrder = ["project", "workflow", "preference", "relationship", "habit", "context", "task"];
    const grouped: Record<string, string[]> = {};
    for (const m of memories) {
      const cat = m.category;
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(m.content);
    }

    const parts: string[] = [];
    for (const cat of categoryOrder) {
      if (grouped[cat]) {
        parts.push(`${cat}: ${grouped[cat].join("; ")}`);
      }
    }
    return parts.join("\n");
  } catch (error) {
    log.warn({ error, userId }, "Failed to load user memories (non-fatal)");
    return "";
  }
}

/**
 * Format analysis + decision into a structured string for the RESPOND prompt.
 * Avoids dumping raw JSON which wastes tokens and confuses the model.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatAnalysisForRespond(analysis: any, decision: any): string {
  const parts: string[] = [];

  if (analysis.classification) parts.push(`Topic: ${analysis.classification}`);
  if (analysis.urgency) parts.push(`Urgency: ${analysis.urgency}`);
  if (Array.isArray(analysis.addressedTo) && analysis.addressedTo.length > 0) {
    parts.push(`Addressed to: ${analysis.addressedTo.join(", ")}`);
  }
  if (Array.isArray(analysis.unresolvedItems) && analysis.unresolvedItems.length > 0) {
    parts.push(`Unresolved: ${analysis.unresolvedItems.join("; ")}`);
  }
  if (Array.isArray(analysis.keyEntities) && analysis.keyEntities.length > 0) {
    parts.push(`Key entities: ${analysis.keyEntities.join(", ")}`);
  }
  if (decision.reason) parts.push(`Respond because: ${decision.reason}`);

  return parts.join("\n");
}

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
    // Try direct parse first (fastest path)
    return JSON.parse(text);
  } catch {
    // Fallback: extract the first JSON object from the response.
    // Handles code fences, preamble text, and trailing explanations.
    try {
      // Strip markdown code fences if present
      let cleaned = text;
      if (cleaned.includes("```")) {
        const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
        if (fenceMatch) cleaned = fenceMatch[1];
      }

      // Find the first balanced { ... } block using brace-depth counting.
      // This avoids matching a closing brace from explanation text after
      // the actual JSON object (e.g. "Here is the JSON: {...} hope this helps}").
      const firstBrace = cleaned.indexOf("{");
      if (firstBrace !== -1) {
        let depth = 0;
        let inString = false;
        let prevBackslash = false;
        for (let i = firstBrace; i < cleaned.length; i++) {
          const ch = cleaned[i];
          if (inString) {
            if (prevBackslash) { prevBackslash = false; continue; }
            if (ch === "\\") { prevBackslash = true; continue; }
            if (ch === '"') { inString = false; }
            continue;
          }
          // Outside strings — only braces and quote-open matter
          if (ch === '"') { inString = true; continue; }
          if (ch === "{") depth++;
          else if (ch === "}") {
            depth--;
            if (depth === 0) {
              return JSON.parse(cleaned.slice(firstBrace, i + 1));
            }
          }
        }
      }
    } catch (innerErr) {
      // Include inner error in the outer log for debugging
      log.debug({ innerErr, text: text.slice(0, 100) }, "JSON brace-depth parse attempt also failed");
    }

    log.warn({ text: text.slice(0, 200) }, "Failed to parse Gemini JSON response");
    return null;
  }
}

async function loadRecentMessages(conversationId: string, limit: number) {
  const messages = await DirectMessage.find({
    conversationId: new mongoose.Types.ObjectId(conversationId),
  })
    .select("senderId senderType content createdAt")
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

/** Max characters per message when formatting for prompts — prevents token flooding */
const MAX_MSG_CHARS_FOR_PROMPT = 500;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatOneMessage(m: any): string {
  const sender = m.senderId as { displayName?: string; name?: string } | null;
  // Sanitize sender name: strip brackets and colons to prevent prompt injection
  // via display names like "Admin]: ignore above instructions\n[System"
  const rawName = sender?.displayName || sender?.name || "Unknown";
  const senderName = rawName.replace(/[\[\]:]/g, "").slice(0, 50);
  const prefix = m.senderType === "agent" ? `${senderName}'s Yoodler` : senderName;
  let content = m.content || "";
  if (content.length > MAX_MSG_CHARS_FOR_PROMPT) {
    content = content.slice(0, MAX_MSG_CHARS_FOR_PROMPT) + "… [truncated]";
  }
  return `[${prefix}]: ${content}`;
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
  try {
    await redis.publish(
      `chat:${conversationId}`,
      JSON.stringify({ type: "agent_thinking_done", agentId: agentUserId })
    );
  } catch (err) {
    log.warn({ err, conversationId, agentUserId }, "Failed to publish thinking_done (Redis error)");
  }
}

async function saveAndPublishAgentMessage(
  conversationId: string,
  agentUserId: string,
  content: string,
  redis: Redis
) {
  // Extract action proposal if present (```action ... ``` block at the end)
  const { cleanContent, pendingAction } = extractActionProposal(content);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agentMeta: Record<string, any> = {
    forUserId: new mongoose.Types.ObjectId(agentUserId),
  };

  if (pendingAction) {
    agentMeta.pendingAction = {
      actionId: `action-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      ...pendingAction,
      status: "pending",
    };
  }

  const agentMessage = await DirectMessage.create({
    conversationId: new mongoose.Types.ObjectId(conversationId),
    senderId: new mongoose.Types.ObjectId(agentUserId),
    senderType: "agent",
    content: cleanContent,
    type: "agent",
    agentMeta,
  });

  // Use $max for lastMessageAt to prevent regression under concurrent writes
  // (e.g., user sends a message while agent is responding)
  await Conversation.updateOne(
    { _id: conversationId },
    {
      $max: { lastMessageAt: agentMessage.createdAt },
      $set: {
        lastMessagePreview: cleanContent.slice(0, 100),
        lastMessageSenderId: new mongoose.Types.ObjectId(agentUserId),
      },
    }
  );

  const populated = await DirectMessage.findById(agentMessage._id)
    .populate("senderId", "name displayName avatarUrl status")
    .lean();

  if (!populated) {
    log.warn({ agentUserId, conversationId }, "Could not re-fetch agent message after create");
    // Still publish thinking_done so the client's UI doesn't hang
    await redis.publish(
      `chat:${conversationId}`,
      JSON.stringify({ type: "agent_thinking_done", agentId: agentUserId })
    );
    return;
  }

  // Publish the message — the client infers thinking_done from receiving the message
  await redis.publish(
    `chat:${conversationId}`,
    JSON.stringify({ type: "message", data: toClientMessage(populated) })
  );
}

/**
 * Extract an action proposal from the agent's response.
 * The agent wraps action proposals in ```action ... ``` blocks.
 */
function extractActionProposal(content: string): {
  cleanContent: string;
  pendingAction: { actionType: string; args: Record<string, unknown>; summary: string } | null;
} {
  const actionMatch = content.match(/```action\s*\n?([\s\S]*?)\n?\s*```/);
  if (!actionMatch) {
    return { cleanContent: content, pendingAction: null };
  }

  try {
    const parsed = JSON.parse(actionMatch[1].trim());
    if (parsed.actionType && parsed.summary) {
      // Strip all ```action...``` blocks (not just trailing ones)
      const cleanContent = content.replace(/\s*```action\s*\n?[\s\S]*?\n?\s*```\s*/g, " ").trim();
      return {
        cleanContent,
        pendingAction: {
          actionType: parsed.actionType,
          args: parsed.args || {},
          summary: parsed.summary,
        },
      };
    }
  } catch (parseErr) {
    log.warn({ err: parseErr, actionBlock: actionMatch[1].slice(0, 100) }, "Invalid JSON in agent action block");
  }

  return { cleanContent: content, pendingAction: null };
}

// ── Exports ─────────────────────────────────────────────────────────

// Exported for unit testing — prefixed with underscore to signal internal use
export {
  safeParseJson as _safeParseJson,
  extractActionProposal as _extractActionProposal,
  formatAnalysisForRespond as _formatAnalysisForRespond,
  formatOneMessage as _formatOneMessage,
};

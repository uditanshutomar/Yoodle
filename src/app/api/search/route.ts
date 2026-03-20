import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { BadRequestError } from "@/lib/infra/api/errors";
import connectDB from "@/lib/infra/db/client";
import { createLogger } from "@/lib/infra/logger";
import User from "@/lib/infra/db/models/user";
import Meeting from "@/lib/infra/db/models/meeting";
import Conversation from "@/lib/infra/db/models/conversation";
import DirectMessage from "@/lib/infra/db/models/direct-message";
import { searchBoardTasks } from "@/lib/board/tools";

const log = createLogger("api:search");

const MAX_PER_CATEGORY = 5;
const MESSAGE_TRUNCATE_LENGTH = 120;

/**
 * GET /api/search?q=<query>
 * Global search across people, meetings, messages, and tasks.
 * Returns grouped results with max 5 per category.
 */
export const GET = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);

  const rawQ = req.nextUrl.searchParams.get("q")?.trim();
  if (!rawQ || rawQ.length < 2) {
    throw new BadRequestError(
      "Search query must be at least 2 characters.",
    );
  }
  if (rawQ.length > 200) {
    throw new BadRequestError(
      "Search query must not exceed 200 characters.",
    );
  }

  await connectDB();

  const escaped = rawQ.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = { $regex: escaped, $options: "i" };
  const userOid = new mongoose.Types.ObjectId(userId);

  const [peopleResult, meetingsResult, messagesResult, tasksResult] =
    await Promise.allSettled([
      // ── People (scoped to users the requester has conversations with) ──
      (async () => {
        const convos = await Conversation.find({ "participants.userId": userOid })
          .select("participants.userId")
          .lean();
        const contactIds = new Set<string>();
        for (const c of convos) {
          for (const p of c.participants) {
            const pid = p.userId.toString();
            if (pid !== userId) contactIds.add(pid);
          }
        }
        if (contactIds.size === 0) return [];
        const contactOids = [...contactIds].map((id) => new mongoose.Types.ObjectId(id));
        return User.find({
          _id: { $in: contactOids },
          $or: [{ name: regex }, { displayName: regex }],
        })
          .select("name displayName avatarUrl status mode")
          .limit(MAX_PER_CATEGORY)
          .lean();
      })(),

      // ── Meetings ──
      Meeting.find({
        title: regex,
        $or: [{ hostId: userOid }, { "participants.userId": userOid }],
      })
        .select("title code status scheduledAt type")
        .limit(MAX_PER_CATEGORY)
        .lean(),

      // ── Messages ──
      (async () => {
        const convos = await Conversation.find({
          "participants.userId": userOid,
        })
          .select("_id")
          .sort({ lastMessageAt: -1 })
          .limit(100) // Cap to prevent massive $in queries
          .lean();
        const convoIds = convos.map((c) => c._id);
        if (convoIds.length === 0) return [];
        return DirectMessage.find({
          conversationId: { $in: convoIds },
          content: regex,
          deleted: { $ne: true },
        })
          .select("content senderId conversationId createdAt")
          .populate("senderId", "name displayName")
          .limit(MAX_PER_CATEGORY)
          .lean();
      })(),

      // ── Tasks ──
      searchBoardTasks(userId, { query: rawQ }),
    ]);

  // ── Assemble results, logging any partial failures ──

  let people: unknown[] = [];
  if (peopleResult.status === "fulfilled") {
    people = peopleResult.value.map((u) => ({
      _id: u._id.toString(),
      name: u.name,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl || null,
      status: u.mode === "invisible" ? "offline" : u.status,
    }));
  } else {
    log.error({ err: peopleResult.reason }, "Search: people query failed");
  }

  let meetings: unknown[] = [];
  if (meetingsResult.status === "fulfilled") {
    meetings = meetingsResult.value.map((m) => ({
      _id: m._id.toString(),
      title: m.title,
      code: m.code,
      status: m.status,
      scheduledAt: m.scheduledAt ?? null,
      type: m.type,
    }));
  } else {
    log.error(
      { err: meetingsResult.reason },
      "Search: meetings query failed",
    );
  }

  let messages: unknown[] = [];
  if (messagesResult.status === "fulfilled") {
    messages = messagesResult.value.map((msg) => {
      const sender = msg.senderId as unknown as {
        _id: mongoose.Types.ObjectId;
        name: string;
        displayName: string;
      } | null;
      const content =
        msg.content.length > MESSAGE_TRUNCATE_LENGTH
          ? msg.content.slice(0, MESSAGE_TRUNCATE_LENGTH) + "..."
          : msg.content;
      return {
        _id: msg._id.toString(),
        content,
        conversationId: msg.conversationId.toString(),
        createdAt: msg.createdAt,
        sender: sender
          ? {
              _id: sender._id.toString(),
              name: sender.name,
              displayName: sender.displayName,
            }
          : null,
      };
    });
  } else {
    log.error(
      { err: messagesResult.reason },
      "Search: messages query failed",
    );
  }

  let tasks: unknown[] = [];
  if (tasksResult.status === "fulfilled") {
    const result = tasksResult.value;
    if (result.success && Array.isArray(result.data)) {
      tasks = result.data.slice(0, MAX_PER_CATEGORY);
    }
  } else {
    log.error({ err: tasksResult.reason }, "Search: tasks query failed");
  }

  return successResponse({ people, meetings, messages, tasks });
});

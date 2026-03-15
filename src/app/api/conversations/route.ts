import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse, badRequest } from "@/lib/infra/api/response";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import connectDB from "@/lib/infra/db/client";
import Conversation from "@/lib/infra/db/models/conversation";
import DirectMessage from "@/lib/infra/db/models/direct-message";
import User from "@/lib/infra/db/models/user";

// ─── Validation ────────────────────────────────────────────────────────

const createDmSchema = z.object({
  type: z.literal("dm"),
  recipientId: z.string().min(1),
});

const createGroupSchema = z.object({
  type: z.literal("group"),
  name: z.string().min(1, "Group name is required").max(200),
  participantIds: z.array(z.string().min(1)).min(1),
});

const createConversationSchema = z.discriminatedUnion("type", [
  createDmSchema,
  createGroupSchema,
]);

// ─── GET /api/conversations ────────────────────────────────────────────

export const GET = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);
  await connectDB();

  const userOid = new mongoose.Types.ObjectId(userId);

  // Find conversations where user is a participant, most recent first
  const conversations = await Conversation.find({
    "participants.userId": userOid,
  })
    .sort({ lastMessageAt: -1 })
    .limit(50)
    .lean();

  // Collect all participant userIds for a single batch populate
  const participantIdSet = new Set<string>();
  for (const conv of conversations) {
    for (const p of conv.participants) {
      participantIdSet.add(p.userId.toString());
    }
  }

  const users = await User.find({
    _id: { $in: [...participantIdSet].map((id) => new mongoose.Types.ObjectId(id)) },
  })
    .select("name displayName avatarUrl status")
    .lean();

  const userMap = new Map(users.map((u) => [u._id.toString(), u]));

  // Compute unread counts per conversation
  const unreadPipeline = conversations.map((conv) => {
    const me = conv.participants.find(
      (p) => p.userId.toString() === userId,
    );
    const lastReadAt = me?.lastReadAt ?? new Date(0);

    return DirectMessage.countDocuments({
      conversationId: conv._id,
      createdAt: { $gt: lastReadAt },
      senderId: { $ne: userOid },
    });
  });

  const unreadCounts = await Promise.all(unreadPipeline);

  // Build response with populated participants and unread count
  const result = conversations.map((conv, i) => ({
    ...conv,
    unreadCount: unreadCounts[i],
    participants: conv.participants.map((p) => ({
      ...p,
      user: userMap.get(p.userId.toString()) ?? null,
    })),
  }));

  return successResponse(result);
});

// ─── POST /api/conversations ───────────────────────────────────────────

export const POST = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);

  const body = createConversationSchema.parse(await req.json());

  await connectDB();

  const userOid = new mongoose.Types.ObjectId(userId);

  if (body.type === "dm") {
    if (body.recipientId === userId) {
      return badRequest("Cannot create a DM with yourself");
    }

    const recipientOid = new mongoose.Types.ObjectId(body.recipientId);

    // Check if a DM already exists between these two users
    const existing = await Conversation.findOne({
      type: "dm",
      "participants.userId": { $all: [userOid, recipientOid] },
    }).lean();

    if (existing) {
      return successResponse(existing);
    }

    // Verify recipient exists
    const recipientExists = await User.exists({ _id: recipientOid });
    if (!recipientExists) {
      return badRequest("Recipient user not found");
    }

    const conversation = await Conversation.create({
      type: "dm",
      participants: [
        { userId: userOid, role: "admin", joinedAt: new Date() },
        { userId: recipientOid, role: "member", joinedAt: new Date() },
      ],
      createdBy: userOid,
    });

    return successResponse(conversation, 201);
  }

  // Group conversation
  const allParticipantIds = Array.from(
    new Set([userId, ...body.participantIds]),
  );

  const participants = allParticipantIds.map((id) => ({
    userId: new mongoose.Types.ObjectId(id),
    role: id === userId ? ("admin" as const) : ("member" as const),
    joinedAt: new Date(),
  }));

  const conversation = await Conversation.create({
    type: "group",
    name: body.name.trim(),
    participants,
    createdBy: userOid,
  });

  return successResponse(conversation, 201);
});

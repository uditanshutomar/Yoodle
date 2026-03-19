/**
 * Transforms a populated Mongoose DirectMessage document into the shape
 * expected by the client's ChatMsg interface.
 *
 * DB field mapping:
 *   senderId (populated) → sender { _id, name, displayName, avatar }
 *   reactions [{ emoji, userId }] → reactions [{ emoji, users[] }]
 *   replyTo (populated) → replyTo (id string) + replyToMessage
 */

/** Shape of a populated DirectMessage document passed to toClientMessage */
interface PopulatedDirectMessage {
  _id?: { toString(): string };
  conversationId?: { toString(): string };
  senderId?: {
    _id?: { toString(): string };
    toString(): string;
    name?: string;
    displayName?: string;
    avatarUrl?: string;
  } | string;
  senderType?: string;
  type?: string;
  content?: string;
  reactions?: { emoji?: string; userId?: { toString(): string } | string }[];
  replyTo?: {
    _id?: { toString(): string };
    toString(): string;
    content?: string;
    senderId?: { name?: string };
  } | string;
  edited?: boolean;
  deleted?: boolean;
  agentMeta?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

export function toClientMessage(msg: PopulatedDirectMessage | null | undefined) {
  if (!msg) return msg;

  const senderId = msg.senderId;
  const sender =
    senderId && typeof senderId === "object"
      ? {
          _id: senderId._id?.toString() ?? senderId.toString(),
          name: senderId.name ?? "Unknown",
          displayName: senderId.displayName,
          avatar: senderId.avatarUrl,
        }
      : { _id: senderId?.toString() ?? "", name: "Unknown" };

  // Group per-user reactions by emoji
  const reactionsRaw = msg.reactions ?? [];
  const reactionMap = new Map<string, string[]>();
  for (const r of reactionsRaw) {
    if (!r.emoji) continue; // skip reactions with missing emoji
    const uid = r.userId?.toString?.() ?? (typeof r.userId === "string" ? r.userId : "");
    if (!uid) continue; // skip reactions with missing userId
    if (!reactionMap.has(r.emoji)) reactionMap.set(r.emoji, []);
    reactionMap.get(r.emoji)!.push(uid);
  }
  const reactions = [...reactionMap.entries()].map(([emoji, users]) => ({
    emoji,
    users,
  }));

  // Build replyToMessage if replyTo was populated with content
  let replyToMessage:
    | { content: string; sender: { name: string } }
    | undefined;
  if (msg.replyTo && typeof msg.replyTo === "object" && msg.replyTo.content) {
    replyToMessage = {
      content: msg.replyTo.content,
      sender: { name: msg.replyTo.senderId?.name ?? "Unknown" },
    };
  }

  return {
    _id: msg._id?.toString() ?? "",
    conversationId: msg.conversationId?.toString() ?? "",
    sender,
    senderType: msg.senderType,
    type: msg.type,
    content: msg.content,
    replyTo: typeof msg.replyTo === "object" ? msg.replyTo?._id?.toString() ?? msg.replyTo?.toString() : msg.replyTo,
    replyToMessage,
    reactions,
    edited: msg.edited,
    deleted: msg.deleted,
    agentMeta: msg.agentMeta,
    createdAt: msg.createdAt,
    updatedAt: msg.updatedAt,
  };
}

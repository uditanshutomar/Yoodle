/**
 * Transforms a populated Mongoose DirectMessage document into the shape
 * expected by the client's ChatMsg interface.
 *
 * DB field mapping:
 *   senderId (populated) → sender { _id, name, displayName, avatar }
 *   reactions [{ emoji, userId }] → reactions [{ emoji, users[] }]
 *   replyTo (populated) → replyTo (id string) + replyToMessage
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toClientMessage(msg: any) {
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
    const uid = r.userId?.toString?.() ?? r.userId;
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
    replyTo: msg.replyTo?._id?.toString() ?? msg.replyTo?.toString(),
    replyToMessage,
    reactions,
    edited: msg.edited,
    deleted: msg.deleted,
    agentMeta: msg.agentMeta,
    createdAt: msg.createdAt,
    updatedAt: msg.updatedAt,
  };
}

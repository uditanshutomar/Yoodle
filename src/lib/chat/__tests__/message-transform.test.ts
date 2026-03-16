import { describe, it, expect } from "vitest";
import { toClientMessage } from "../message-transform";

describe("toClientMessage", () => {
  it("returns null/undefined for falsy input", () => {
    expect(toClientMessage(null)).toBeNull();
    expect(toClientMessage(undefined)).toBeUndefined();
  });

  it("transforms a fully populated message", () => {
    const msg = {
      _id: { toString: () => "msg-1" },
      conversationId: { toString: () => "conv-1" },
      senderId: {
        _id: { toString: () => "user-1" },
        name: "alice",
        displayName: "Alice",
        avatarUrl: "https://example.com/alice.png",
      },
      senderType: "user",
      content: "Hello!",
      reactions: [],
      replyTo: null,
      edited: false,
      deleted: false,
      agentMeta: null,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
    const result = toClientMessage(msg);
    expect(result._id).toBe("msg-1");
    expect(result.conversationId).toBe("conv-1");
    expect(result.sender).toEqual({
      _id: "user-1",
      name: "alice",
      displayName: "Alice",
      avatar: "https://example.com/alice.png",
    });
    expect(result.senderType).toBe("user");
    expect(result.content).toBe("Hello!");
    expect(result.reactions).toEqual([]);
    expect(result.edited).toBe(false);
    expect(result.deleted).toBe(false);
  });

  it("handles senderId as a plain string (not populated)", () => {
    const msg = {
      _id: { toString: () => "msg-2" },
      conversationId: { toString: () => "conv-1" },
      senderId: "user-id-string",
      senderType: "user",
      content: "Hi",
    };
    const result = toClientMessage(msg);
    expect(result.sender).toEqual({ _id: "user-id-string", name: "Unknown" });
  });

  it("handles null senderId gracefully", () => {
    const msg = {
      _id: { toString: () => "msg-3" },
      conversationId: { toString: () => "conv-1" },
      senderId: null,
      senderType: "user",
      content: "Test",
    };
    const result = toClientMessage(msg);
    expect(result.sender).toEqual({ _id: "", name: "Unknown" });
  });

  it("handles undefined _id and conversationId", () => {
    const msg = {
      senderId: null,
      senderType: "user",
      content: "Test",
    };
    const result = toClientMessage(msg);
    expect(result._id).toBe("");
    expect(result.conversationId).toBe("");
  });

  it("groups reactions by emoji", () => {
    const msg = {
      _id: { toString: () => "msg-4" },
      conversationId: { toString: () => "conv-1" },
      senderId: { _id: { toString: () => "u1" }, name: "alice" },
      senderType: "user",
      content: "Funny!",
      reactions: [
        { emoji: "👍", userId: { toString: () => "user-a" } },
        { emoji: "👍", userId: { toString: () => "user-b" } },
        { emoji: "❤️", userId: { toString: () => "user-c" } },
      ],
    };
    const result = toClientMessage(msg);
    expect(result.reactions).toHaveLength(2);
    const thumbs = result.reactions.find((r: { emoji: string }) => r.emoji === "👍");
    expect(thumbs?.users).toEqual(["user-a", "user-b"]);
    const heart = result.reactions.find((r: { emoji: string }) => r.emoji === "❤️");
    expect(heart?.users).toEqual(["user-c"]);
  });

  it("handles reactions with plain string userId", () => {
    const msg = {
      _id: { toString: () => "msg-5" },
      conversationId: { toString: () => "conv-1" },
      senderId: null,
      senderType: "user",
      content: "Test",
      reactions: [{ emoji: "🎉", userId: "plain-id" }],
    };
    const result = toClientMessage(msg);
    expect(result.reactions[0].users).toEqual(["plain-id"]);
  });

  it("handles missing reactions array (defaults to empty)", () => {
    const msg = {
      _id: { toString: () => "msg-6" },
      conversationId: { toString: () => "conv-1" },
      senderId: null,
      senderType: "user",
      content: "Test",
      // no reactions field
    };
    const result = toClientMessage(msg);
    expect(result.reactions).toEqual([]);
  });

  it("builds replyToMessage when replyTo is populated", () => {
    const msg = {
      _id: { toString: () => "msg-7" },
      conversationId: { toString: () => "conv-1" },
      senderId: null,
      senderType: "user",
      content: "Reply",
      replyTo: {
        _id: { toString: () => "msg-original" },
        content: "Original message",
        senderId: { name: "bob" },
      },
    };
    const result = toClientMessage(msg);
    expect(result.replyTo).toBe("msg-original");
    expect(result.replyToMessage).toEqual({
      content: "Original message",
      sender: { name: "bob" },
    });
  });

  it("handles replyTo as an unpopulated ObjectId string", () => {
    const msg = {
      _id: { toString: () => "msg-8" },
      conversationId: { toString: () => "conv-1" },
      senderId: null,
      senderType: "user",
      content: "Reply",
      replyTo: "some-object-id",
    };
    const result = toClientMessage(msg);
    expect(result.replyTo).toBe("some-object-id");
    expect(result.replyToMessage).toBeUndefined();
  });

  it("handles replyTo populated but without content", () => {
    const msg = {
      _id: { toString: () => "msg-9" },
      conversationId: { toString: () => "conv-1" },
      senderId: null,
      senderType: "user",
      content: "Reply",
      replyTo: {
        _id: { toString: () => "msg-deleted" },
        // no content field (deleted message)
        senderId: { name: "charlie" },
      },
    };
    const result = toClientMessage(msg);
    expect(result.replyTo).toBe("msg-deleted");
    expect(result.replyToMessage).toBeUndefined();
  });

  it("handles replyTo with missing senderId name", () => {
    const msg = {
      _id: { toString: () => "msg-10" },
      conversationId: { toString: () => "conv-1" },
      senderId: null,
      senderType: "user",
      content: "Reply",
      replyTo: {
        _id: { toString: () => "msg-original" },
        content: "Original",
        senderId: null,
      },
    };
    const result = toClientMessage(msg);
    expect(result.replyToMessage?.sender.name).toBe("Unknown");
  });

  it("preserves agentMeta field", () => {
    const agentMeta = { action: "create_task", confidence: 0.95 };
    const msg = {
      _id: { toString: () => "msg-11" },
      conversationId: { toString: () => "conv-1" },
      senderId: null,
      senderType: "agent",
      content: "Done",
      agentMeta,
    };
    const result = toClientMessage(msg);
    expect(result.agentMeta).toBe(agentMeta);
  });

  it("skips reactions with null or undefined emoji", () => {
    const msg = {
      _id: { toString: () => "msg-13" },
      conversationId: { toString: () => "conv-1" },
      senderId: null,
      senderType: "user",
      content: "Test",
      reactions: [
        { emoji: null, userId: "user-a" },
        { emoji: undefined, userId: "user-b" },
        { emoji: "", userId: "user-c" },
        { emoji: "👍", userId: "user-d" },
      ],
    };
    const result = toClientMessage(msg);
    expect(result.reactions).toHaveLength(1);
    expect(result.reactions[0].emoji).toBe("👍");
    expect(result.reactions[0].users).toEqual(["user-d"]);
  });

  it("handles senderId object missing name (falls back to Unknown)", () => {
    const msg = {
      _id: { toString: () => "msg-12" },
      conversationId: { toString: () => "conv-1" },
      senderId: {
        _id: { toString: () => "user-x" },
        // no name field
      },
      senderType: "user",
      content: "Test",
    };
    const result = toClientMessage(msg);
    expect(result.sender.name).toBe("Unknown");
  });
});

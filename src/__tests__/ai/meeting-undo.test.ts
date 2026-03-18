/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/infra/redis/client", () => ({
  getRedisClient: vi.fn(),
}));

vi.mock("nanoid", () => ({
  nanoid: vi.fn(() => "ABCDEFGHIJKLMNOP"),
}));

import { getRedisClient } from "@/lib/infra/redis/client";
import {
  storeUndoToken,
  getUndoToken,
  consumeUndoToken,
  type UndoPayload,
} from "@/lib/ai/meeting-undo";

const mockedGetRedisClient = vi.mocked(getRedisClient);

const samplePayload: UndoPayload = {
  action: "move_task",
  resourceId: "task-123",
  reverseAction: "move_task",
  reverseArgs: { columnId: "col-original" },
  description: "Moved task to Done",
};

describe("meeting-undo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("storeUndoToken", () => {
    it("stores with correct key pattern and 24h TTL", async () => {
      const mockSet = vi.fn().mockResolvedValue("OK");
      mockedGetRedisClient.mockReturnValue({ set: mockSet } as any);

      const token = await storeUndoToken("user-1", samplePayload);

      expect(token).toBe("undo:ABCDEFGHIJKLMNOP");
      expect(mockSet).toHaveBeenCalledWith(
        "undo:ABCDEFGHIJKLMNOP",
        expect.any(String),
        "EX",
        86400
      );

      // Verify stored JSON contains payload + userId + createdAt
      const storedJson = JSON.parse(mockSet.mock.calls[0][1]);
      expect(storedJson.action).toBe("move_task");
      expect(storedJson.resourceId).toBe("task-123");
      expect(storedJson.reverseAction).toBe("move_task");
      expect(storedJson.reverseArgs).toEqual({ columnId: "col-original" });
      expect(storedJson.userId).toBe("user-1");
      expect(storedJson.createdAt).toBeDefined();
    });
  });

  describe("getUndoToken", () => {
    it("returns parsed StoredUndo when token exists", async () => {
      const stored = {
        ...samplePayload,
        userId: "user-1",
        createdAt: "2026-03-17T00:00:00.000Z",
      };
      mockedGetRedisClient.mockReturnValue({
        get: vi.fn().mockResolvedValue(JSON.stringify(stored)),
      } as any);

      const result = await getUndoToken("undo:ABCDEFGHIJKLMNOP");

      expect(result).toEqual(stored);
    });

    it("returns null for unknown token", async () => {
      mockedGetRedisClient.mockReturnValue({
        get: vi.fn().mockResolvedValue(null),
      } as any);

      const result = await getUndoToken("undo:nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("consumeUndoToken", () => {
    it("returns stored data and deletes the token", async () => {
      const stored = {
        ...samplePayload,
        userId: "user-1",
        createdAt: "2026-03-17T00:00:00.000Z",
      };
      const mockGet = vi.fn().mockResolvedValue(JSON.stringify(stored));
      const mockDel = vi.fn().mockResolvedValue(1);
      mockedGetRedisClient.mockReturnValue({
        get: mockGet,
        del: mockDel,
      } as any);

      const result = await consumeUndoToken("undo:ABCDEFGHIJKLMNOP");

      expect(result).toEqual(stored);
      expect(mockDel).toHaveBeenCalledWith("undo:ABCDEFGHIJKLMNOP");
    });

    it("returns null and does not delete when token does not exist", async () => {
      const mockGet = vi.fn().mockResolvedValue(null);
      const mockDel = vi.fn();
      mockedGetRedisClient.mockReturnValue({
        get: mockGet,
        del: mockDel,
      } as any);

      const result = await consumeUndoToken("undo:nonexistent");

      expect(result).toBeNull();
      expect(mockDel).not.toHaveBeenCalled();
    });
  });
});

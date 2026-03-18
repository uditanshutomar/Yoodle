import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const TEST_USER_ID = "507f1f77bcf86cd799439011";
const VALID_CONV_ID = "607f1f77bcf86cd799439022";

vi.mock("@/lib/infra/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock("@/lib/infra/db/client", () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/infra/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(undefined),
}));

const mockedGetUserId = vi.fn().mockResolvedValue(TEST_USER_ID);
vi.mock("@/lib/infra/auth/middleware", () => ({
  getUserIdFromRequest: (...args: unknown[]) => mockedGetUserId(...args),
}));

const mockFindByIdChain = {
  select: vi.fn().mockReturnThis(),
  lean: vi.fn(),
};
const mockUpdateOne = vi.fn().mockResolvedValue({ modifiedCount: 1 });
vi.mock("@/lib/infra/db/models/conversation", () => ({
  default: {
    findById: vi.fn(() => mockFindByIdChain),
    updateOne: (...args: unknown[]) => mockUpdateOne(...args),
  },
}));

function createRequest(method: string, body?: object): NextRequest {
  return new NextRequest(
    "http://localhost:3000/api/conversations/" + VALID_CONV_ID + "/mute",
    {
      method,
      headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
      body: body ? JSON.stringify(body) : undefined,
    },
  );
}

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

const { PATCH } = await import("../route");

describe("PATCH /api/conversations/[id]/mute", () => {
  beforeEach(() => vi.clearAllMocks());

  function setupParticipant() {
    mockFindByIdChain.lean.mockResolvedValue({
      _id: VALID_CONV_ID,
      participants: [
        { userId: { toString: () => TEST_USER_ID } },
      ],
    });
  }

  it("mutes a conversation", async () => {
    setupParticipant();

    const res = await PATCH(
      createRequest("PATCH", { muted: true }),
      makeContext(VALID_CONV_ID),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.muted).toBe(true);
    expect(mockUpdateOne).toHaveBeenCalled();
  });

  it("unmutes a conversation", async () => {
    setupParticipant();

    const res = await PATCH(
      createRequest("PATCH", { muted: false }),
      makeContext(VALID_CONV_ID),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.muted).toBe(false);
    expect(mockUpdateOne).toHaveBeenCalled();
  });
});

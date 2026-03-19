import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mock dependencies before importing the route ──────────────────

vi.mock("@/lib/infra/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/lib/infra/db/client", () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/infra/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/infra/auth/middleware", () => ({
  getUserIdFromRequest: vi.fn(),
}));

vi.mock("@/lib/infra/db/models/user", () => ({
  default: {},
}));

vi.mock("@/lib/infra/db/models/conversation", () => ({
  default: {
    findOne: vi.fn().mockResolvedValue(null),
    updateOne: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock("@/lib/infra/db/models/direct-message", () => ({
  default: {
    create: vi.fn().mockResolvedValue({ createdAt: new Date(), content: "" }),
  },
}));

vi.mock("@/lib/infra/redis/client", () => ({
  getRedisClient: vi.fn().mockReturnValue({
    publish: vi.fn().mockResolvedValue(undefined),
  }),
}));

// Mock Meeting model
const mockFindOneChain = {
  select: vi.fn().mockReturnThis(),
  lean: vi.fn().mockResolvedValue(null),
};

const mockFindOne = vi.fn(() => mockFindOneChain);
const mockUpdateOne = vi.fn().mockResolvedValue({});

vi.mock("@/lib/infra/db/models/meeting", () => ({
  default: {
    findOne: (...args: unknown[]) => mockFindOne(...args),
    updateOne: (...args: unknown[]) => mockUpdateOne(...args),
  },
}));

// Mock transcript model (dynamic import)
vi.mock("@/lib/infra/db/models/transcript", () => ({
  default: {
    findOne: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        segments: [
          { speakerName: "Alice", text: "Let's discuss the roadmap." },
          { speakerName: "Bob", text: "Agreed. We need to finalize Q2 goals." },
        ],
      }),
    }),
  },
}));

// Mock Gemini AI
const mockGenerateContent = vi.fn().mockResolvedValue({
  response: {
    text: () => JSON.stringify({
      summary: "Discussed Q2 roadmap",
      keyDecisions: ["Finalize Q2 goals"],
      discussionPoints: ["Roadmap discussion"],
      actionItems: [{ task: "Draft Q2 plan", assignee: "Alice", dueDate: "Next week" }],
      nextSteps: ["Follow-up meeting"],
    }),
  },
});

vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return { generateContent: mockGenerateContent };
    }
  },
}));

import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";

const mockedGetUserId = vi.mocked(getUserIdFromRequest);

const { GET, POST } = await import("../route");

// ── Test helpers ──────────────────────────────────────────────────

const TEST_USER_ID = "507f1f77bcf86cd799439011";
const TEST_MEETING_ID = "507f1f77bcf86cd799439022";

function createRequest(method: string) {
  return new NextRequest(
    `http://localhost:3000/api/meetings/${TEST_MEETING_ID}/mom`,
    {
      method,
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:3000",
        Host: "localhost:3000",
      },
    },
  );
}

const defaultContext = {
  params: Promise.resolve({ meetingId: TEST_MEETING_ID }),
};

// ── GET tests ─────────────────────────────────────────────────────

describe("GET /api/meetings/[meetingId]/mom", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUserId.mockResolvedValue(TEST_USER_ID);
  });

  it("returns meeting minutes", async () => {
    const fakeMeeting = {
      hostId: { toString: () => TEST_USER_ID },
      participants: [{ userId: { toString: () => TEST_USER_ID } }],
      mom: {
        summary: "Discussed roadmap",
        keyDecisions: ["Launch in Q2"],
        discussionPoints: [],
        actionItems: [],
        nextSteps: [],
      },
    };
    mockFindOneChain.lean.mockResolvedValueOnce(fakeMeeting);

    const req = createRequest("GET");
    const response = await GET(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.mom.summary).toBe("Discussed roadmap");
  });
});

// ── POST tests ────────────────────────────────────────────────────

describe("POST /api/meetings/[meetingId]/mom", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUserId.mockResolvedValue(TEST_USER_ID);
    process.env.GEMINI_API_KEY = "test-key";
  });

  it("generates and saves minutes", async () => {
    const fakeMeeting = {
      _id: TEST_MEETING_ID,
      title: "Standup",
      type: "regular",
      hostId: { toString: () => TEST_USER_ID },
      participants: [{ userId: { toString: () => TEST_USER_ID } }],
      calendarEventId: null,
    };
    mockFindOneChain.lean.mockResolvedValueOnce(fakeMeeting);

    const req = createRequest("POST");
    const response = await POST(req, defaultContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.mom.summary).toBe("Discussed Q2 roadmap");
    expect(mockUpdateOne).toHaveBeenCalled();
    expect(mockGenerateContent).toHaveBeenCalled();
  });
});

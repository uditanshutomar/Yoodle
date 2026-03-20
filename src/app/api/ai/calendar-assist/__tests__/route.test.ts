import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/infra/db/client", () => ({ default: vi.fn() }));
vi.mock("@/lib/infra/api/rate-limit", () => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/infra/auth/middleware", () => ({
  getUserIdFromRequest: vi.fn().mockResolvedValue("607f1f77bcf86cd799439011"),
}));

vi.mock("@/lib/google/calendar", () => ({
  listEvents: vi.fn().mockResolvedValue([
    {
      title: "Sprint Planning",
      location: "",
      description: "",
      start: "2026-03-10T10:00:00Z",
      end: "2026-03-10T11:00:00Z",
    },
    {
      title: "Team Standup",
      location: "https://app.yoodle.com/meetings/yoo-abc-def/room",
      description: "",
      start: "2026-03-11T09:00:00Z",
      end: "2026-03-11T09:15:00Z",
    },
  ]),
}));

vi.mock("@/lib/google/contacts", () => ({
  searchContacts: vi.fn().mockResolvedValue([
    {
      name: "Priya Sharma",
      email: "priya@test.com",
      phone: null,
      organization: null,
    },
  ]),
}));

vi.mock("@/lib/google/drive", () => ({
  searchFiles: vi.fn().mockResolvedValue([
    {
      name: "Sprint Doc",
      mimeType: "application/vnd.google-apps.document",
      modifiedTime: "2026-03-18T10:00:00Z",
      webViewLink: "https://docs.google.com/doc1",
    },
    {
      name: "Roadmap Sheet",
      mimeType: "application/vnd.google-apps.spreadsheet",
      modifiedTime: "2026-03-17T10:00:00Z",
      webViewLink: "https://docs.google.com/sheet1",
    },
  ]),
}));

vi.mock("@/lib/board/tools", () => ({
  searchBoardTasks: vi.fn().mockResolvedValue({
    success: true,
    summary: "Found 2 tasks",
    data: [
      { title: "Fix login bug", priority: "high", dueDate: "2026-03-25" },
      {
        title: "Update dashboard",
        priority: "medium",
        dueDate: "2026-03-28",
      },
    ],
  }),
}));

vi.mock("@/lib/infra/circuit-breaker", () => ({
  geminiBreaker: {
    execute: vi.fn((fn: () => Promise<unknown>) => fn()),
  },
}));

// The Gemini mock returns different JSON depending on the prompt field.
// Since generateContent receives a prompt string, we inspect it to decide the shape.
const mockGenerateContent = vi.fn().mockImplementation(({ contents }: { contents: string }) => {
  if (contents.includes("meeting titles")) {
    return Promise.resolve({
      text: '{"titles":[{"value":"Sprint Planning Review","reason":"Based on recent meetings"}]}',
    });
  }
  if (contents.includes("agenda items")) {
    return Promise.resolve({
      text: '{"items":[{"value":"Review sprint progress","reason":"Matches meeting title"}]}',
    });
  }
  if (contents.includes("reference documents")) {
    return Promise.resolve({
      text: '{"picks":[{"index":1,"reason":"Relevant sprint documentation"}]}',
    });
  }
  return Promise.resolve({ text: "{}" });
});

vi.mock("@/lib/ai/gemini", () => ({
  getClient: vi.fn(() => ({
    models: {
      generateContent: mockGenerateContent,
    },
  })),
  getModelName: vi.fn(() => "gemini-3.1-pro-preview"),
}));

vi.mock("@/lib/infra/db/models/meeting", () => {
  const find = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnThis(),
    sort: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue([]),
  });
  return { default: { find } };
});

vi.mock("@/lib/infra/db/models/user", () => {
  const find = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue([]),
  });
  return { default: { find } };
});

vi.mock("@/lib/infra/db/models/board", () => {
  const find = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue([]),
  });
  return { default: { find } };
});

import { POST } from "../route";
import { NextRequest } from "next/server";

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/ai/calendar-assist", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/ai/calendar-assist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("field: titles", () => {
    it("returns title suggestions for valid partial input", async () => {
      const res = await POST(makeRequest({ field: "titles", partial: "Sprint Pl" }));
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data.suggestions)).toBe(true);
      expect(json.data).toHaveProperty("suggestYoodleRoom");
      expect(json.data).toHaveProperty("yoodleRoomReason");
    });

    it("rejects partial shorter than 3 characters", async () => {
      const res = await POST(makeRequest({ field: "titles", partial: "Sp" }));
      expect(res.status).toBe(400);
    });

    it("returns suggestYoodleRoom based on past meeting history", async () => {
      const res = await POST(makeRequest({ field: "titles", partial: "Sprint Planning" }));
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(typeof json.data.suggestYoodleRoom).toBe("boolean");
    });
  });

  describe("field: attendees", () => {
    it("returns attendee suggestions for valid title", async () => {
      const res = await POST(
        makeRequest({
          field: "attendees",
          title: "Sprint Planning",
          existingAttendees: [],
        }),
      );
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data.suggestions)).toBe(true);
    });

    it("accepts empty existingAttendees by default", async () => {
      const res = await POST(
        makeRequest({
          field: "attendees",
          title: "Sprint Planning",
        }),
      );
      const json = await res.json();
      expect(json.success).toBe(true);
    });
  });

  describe("field: agenda", () => {
    it("returns agenda suggestions", async () => {
      const res = await POST(
        makeRequest({
          field: "agenda",
          title: "Sprint Planning",
          attendees: [],
        }),
      );
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data.suggestions)).toBe(true);
    });
  });

  describe("field: references", () => {
    it("returns reference suggestions", async () => {
      const res = await POST(
        makeRequest({
          field: "references",
          title: "Sprint Planning",
          attendees: [],
          agenda: "Review tasks and discuss blockers",
        }),
      );
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data.suggestions)).toBe(true);
    });
  });

  describe("validation", () => {
    it("rejects unknown field", async () => {
      const res = await POST(makeRequest({ field: "unknown" }));
      expect(res.status).toBe(400);
    });

    it("rejects missing field", async () => {
      const res = await POST(makeRequest({}));
      expect(res.status).toBe(400);
    });

    it("rejects titles without partial", async () => {
      const res = await POST(makeRequest({ field: "titles" }));
      expect(res.status).toBe(400);
    });

    it("rejects attendees without title", async () => {
      const res = await POST(makeRequest({ field: "attendees" }));
      expect(res.status).toBe(400);
    });
  });
});

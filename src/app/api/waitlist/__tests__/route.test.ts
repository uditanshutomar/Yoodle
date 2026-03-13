import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mock dependencies before importing the route ──────────────────

vi.mock("@/lib/infra/db/client", () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

const mockWaitlistFindOne = vi.fn();
const mockWaitlistCreate = vi.fn();
const mockWaitlistCountDocuments = vi.fn();

vi.mock("@/lib/infra/db/models/waitlist", () => ({
  default: {
    findOne: mockWaitlistFindOne,
    create: mockWaitlistCreate,
    countDocuments: mockWaitlistCountDocuments,
  },
}));

// Import route handlers after mocks
const { POST, GET } = await import("../route");

// ── Test helpers ──────────────────────────────────────────────────

function createPostRequest(body?: object) {
  const url = "http://localhost:3000/api/waitlist";
  const init = {
    method: "POST" as const,
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
      Host: "localhost:3000",
    },
    body: body ? JSON.stringify(body) : undefined,
  };
  return new NextRequest(url, init);
}

describe("POST /api/waitlist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no duplicate, creation succeeds
    mockWaitlistFindOne.mockResolvedValue(null);
    mockWaitlistCreate.mockResolvedValue({
      _id: "waitlist-entry-123",
      email: "new@example.com",
      source: "website",
    });
    mockWaitlistCountDocuments.mockResolvedValue(42);
  });

  it("returns success message for valid email", async () => {
    const req = createPostRequest({ email: "new@example.com" });
    const response = await POST(req);
    const body = await response.json();

    // successResponse({ message, id, position }, 201) → { success: true, data: { message, id, position } }
    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.message).toContain("on the list");
  });

  it("creates entry with lowercased email", async () => {
    const req = createPostRequest({ email: "Test@EXAMPLE.com" });
    await POST(req);

    // The route calls Waitlist.create with email.toLowerCase()
    expect(mockWaitlistCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "test@example.com",
      }),
    );
  });

  it("passes optional name and source fields", async () => {
    const req = createPostRequest({
      email: "user@example.com",
      name: "Test User",
      source: "producthunt",
    });
    await POST(req);

    expect(mockWaitlistCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "user@example.com",
        name: "Test User",
        source: "producthunt",
      }),
    );
  });

  it("defaults source to 'website' when not provided", async () => {
    const req = createPostRequest({ email: "user@example.com" });
    await POST(req);

    expect(mockWaitlistCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "website",
      }),
    );
  });

  it("returns idempotent success when email already exists (duplicate)", async () => {
    mockWaitlistFindOne.mockResolvedValue({
      _id: "existing-entry",
      email: "dupe@example.com",
    });

    const req = createPostRequest({ email: "dupe@example.com" });
    const response = await POST(req);
    const body = await response.json();

    // successResponse({ message, alreadyJoined }) → { success: true, data: { message, alreadyJoined } }
    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.message).toContain("already on the waitlist");
  });

  it("does NOT call Waitlist.create when email already exists", async () => {
    mockWaitlistFindOne.mockResolvedValue({
      _id: "existing-entry",
      email: "dupe@example.com",
    });

    const req = createPostRequest({ email: "dupe@example.com" });
    await POST(req);

    expect(mockWaitlistCreate).not.toHaveBeenCalled();
  });

  it("returns 400 with invalid email format", async () => {
    const req = createPostRequest({ email: "not-an-email" });
    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("returns 400 when email is missing", async () => {
    const req = createPostRequest({});
    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("returns 400 when email is empty string", async () => {
    const req = createPostRequest({ email: "" });
    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("returns 400 when name exceeds 100 characters", async () => {
    const req = createPostRequest({
      email: "user@example.com",
      name: "A".repeat(101),
    });
    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("returns 400 when source exceeds 50 characters", async () => {
    const req = createPostRequest({
      email: "user@example.com",
      source: "x".repeat(51),
    });
    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("returns 500 when an unexpected error occurs", async () => {
    mockWaitlistFindOne.mockRejectedValue(new Error("DB crashed"));

    const req = createPostRequest({ email: "user@example.com" });
    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
  });
});

describe("GET /api/waitlist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWaitlistCountDocuments.mockResolvedValue(100);
  });

  it("returns 200 with waitlist count", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.count).toBe(100);
  });

  it("returns 500 when countDocuments fails", async () => {
    mockWaitlistCountDocuments.mockRejectedValue(new Error("DB error"));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
  });
});

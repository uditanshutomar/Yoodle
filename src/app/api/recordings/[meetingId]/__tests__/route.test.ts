import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const TEST_USER_ID = "507f1f77bcf86cd799439011";
const TEST_MEETING_ID = "507f1f77bcf86cd799439022";
const TEST_HOST_ID = "507f1f77bcf86cd799439033";

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

const mockFindById = vi.fn();
vi.mock("@/lib/infra/db/models/meeting", () => ({
  default: {
    findById: (...args: unknown[]) => mockFindById(...args),
  },
}));

const mockHasGoogleAccess = vi.fn();
vi.mock("@/lib/google/client", () => ({
  hasGoogleAccess: (...args: unknown[]) => mockHasGoogleAccess(...args),
}));

const mockListRecordings = vi.fn();
vi.mock("@/lib/google/drive-recordings", () => ({
  listMeetingRecordings: (...args: unknown[]) => mockListRecordings(...args),
}));

function createRequest(): NextRequest {
  const url = `http://localhost:3000/api/recordings/${TEST_MEETING_ID}`;
  return new NextRequest(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
}

const meetingDoc = {
  _id: TEST_MEETING_ID,
  hostId: { toString: () => TEST_HOST_ID },
  participants: [{ userId: { toString: () => TEST_USER_ID } }],
};

const sampleRecording = {
  fileId: "file-1",
  name: "Recording_2025-01-01.webm",
  mimeType: "video/webm",
  size: "1024",
  createdTime: "2025-01-01T00:00:00Z",
  webViewLink: "https://drive.google.com/view/1",
  webContentLink: "https://drive.google.com/download/1",
};

const { GET } = await import("../route");

describe("GET /api/recordings/[meetingId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindById.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve(meetingDoc) }),
    });
    mockHasGoogleAccess.mockResolvedValue(true);
    mockListRecordings.mockResolvedValue([sampleRecording]);
  });

  it("returns recordings for a meeting", async () => {
    const res = await GET(createRequest(), {
      params: Promise.resolve({ meetingId: TEST_MEETING_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.recordings).toHaveLength(1);
    expect(body.data.recordings[0].fileId).toBe("file-1");
    expect(body.data.meetingId).toBe(TEST_MEETING_ID);
  });

  it("returns empty recordings when no recordings exist", async () => {
    mockListRecordings.mockResolvedValue([]);

    const res = await GET(createRequest(), {
      params: Promise.resolve({ meetingId: TEST_MEETING_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.recordings).toHaveLength(0);
  });

  it("returns 401 when user is not authenticated", async () => {
    const { UnauthorizedError } = await import("@/lib/infra/api/errors");
    mockedGetUserId.mockRejectedValueOnce(new UnauthorizedError());

    const res = await GET(createRequest(), {
      params: Promise.resolve({ meetingId: TEST_MEETING_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
  });

  it("returns 404 for invalid meetingId format", async () => {
    const res = await GET(createRequest(), {
      params: Promise.resolve({ meetingId: "invalid-id" }),
    });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
  });

  it("returns 404 when meeting is not found", async () => {
    mockFindById.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve(null) }),
    });

    const res = await GET(createRequest(), {
      params: Promise.resolve({ meetingId: TEST_MEETING_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
  });

  it("returns 403 when user is not a participant", async () => {
    mockFindById.mockReturnValue({
      select: () => ({
        lean: () =>
          Promise.resolve({
            ...meetingDoc,
            hostId: { toString: () => "other-host" },
            participants: [{ userId: { toString: () => "other-user" } }],
          }),
      }),
    });

    const res = await GET(createRequest(), {
      params: Promise.resolve({ meetingId: TEST_MEETING_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
  });

  it("falls back to host drive when user has no Google access", async () => {
    mockHasGoogleAccess
      .mockResolvedValueOnce(false) // user has no access
      .mockResolvedValueOnce(true); // host has access

    const res = await GET(createRequest(), {
      params: Promise.resolve({ meetingId: TEST_MEETING_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.recordings).toHaveLength(1);
    expect(mockListRecordings).toHaveBeenCalledWith(TEST_HOST_ID, TEST_MEETING_ID);
  });

  it("returns empty list when neither user nor host has Google access", async () => {
    mockHasGoogleAccess.mockResolvedValue(false);

    const res = await GET(createRequest(), {
      params: Promise.resolve({ meetingId: TEST_MEETING_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.recordings).toHaveLength(0);
  });
});

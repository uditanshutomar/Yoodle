import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const TEST_USER_ID = "507f1f77bcf86cd799439011";
const TEST_MEETING_ID = "507f1f77bcf86cd799439022";

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

const mockFindOneAndUpdate = vi.fn();
vi.mock("@/lib/infra/db/models/transcript", () => ({
  default: {
    findOneAndUpdate: (...args: unknown[]) => mockFindOneAndUpdate(...args),
  },
}));

const mockHasGoogleAccess = vi.fn();
vi.mock("@/lib/google/client", () => ({
  hasGoogleAccess: (...args: unknown[]) => mockHasGoogleAccess(...args),
}));

const mockUploadRecording = vi.fn();
vi.mock("@/lib/google/drive-recordings", () => ({
  uploadRecordingToDrive: (...args: unknown[]) => mockUploadRecording(...args),
}));

const mockQueueAdd = vi.fn();
vi.mock("@/lib/infra/jobs/queue", () => ({
  QUEUE_NAMES: { RECORDING_PROCESS: "recording-process" },
  getQueue: () => ({ add: (...args: unknown[]) => mockQueueAdd(...args) }),
}));

vi.mock("mongoose", async () => {
  const actual = await vi.importActual("mongoose");
  return { ...actual as object };
});

function createUploadRequest(
  fields: Record<string, string | Blob>,
): NextRequest {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.append(key, value);
  }
  const url = "http://localhost:3000/api/recordings/upload";
  return new NextRequest(url, {
    method: "POST",
    headers: { Origin: "http://localhost:3000" },
    body: formData,
  });
}

function createTestFile(
  content = "test-content",
  type = "video/webm",
  name = "recording.webm",
): File {
  return new File([content], name, { type });
}

const meetingDoc = {
  _id: TEST_MEETING_ID,
  hostId: { toString: () => TEST_USER_ID },
  participants: [],
  settings: { allowRecording: true },
  title: "Test Meeting",
};

const { POST } = await import("../route");

describe("POST /api/recordings/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindById.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve(meetingDoc) }),
    });
    mockHasGoogleAccess.mockResolvedValue(true);
    mockUploadRecording.mockResolvedValue({
      fileId: "drive-file-123",
      name: "Test_Meeting_2025-01-01_12-00.webm",
      webViewLink: "https://drive.google.com/view/123",
      webContentLink: "https://drive.google.com/download/123",
    });
    mockQueueAdd.mockResolvedValue(undefined);
  });

  it("uploads recording successfully", async () => {
    const req = createUploadRequest({
      file: createTestFile(),
      meetingId: TEST_MEETING_ID,
    });

    const res = await POST(req, { params: Promise.resolve({}) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.fileId).toBe("drive-file-123");
    expect(body.data.transcriptionQueued).toBe(true);
    expect(mockUploadRecording).toHaveBeenCalledOnce();
  });

  it("returns 401 when user is not authenticated", async () => {
    const { UnauthorizedError } = await import("@/lib/infra/api/errors");
    mockedGetUserId.mockRejectedValueOnce(new UnauthorizedError());

    const req = createUploadRequest({
      file: createTestFile(),
      meetingId: TEST_MEETING_ID,
    });

    const res = await POST(req, { params: Promise.resolve({}) });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
  });

  it("returns 400 when file is missing", async () => {
    const req = createUploadRequest({
      meetingId: TEST_MEETING_ID,
    });

    const res = await POST(req, { params: Promise.resolve({}) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.message).toContain("file");
  });

  it("returns 400 when meetingId is missing", async () => {
    const req = createUploadRequest({
      file: createTestFile(),
    });

    const res = await POST(req, { params: Promise.resolve({}) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.message).toContain("Meeting ID");
  });

  it("returns 400 when meetingId is invalid", async () => {
    const req = createUploadRequest({
      file: createTestFile(),
      meetingId: "not-a-valid-id",
    });

    const res = await POST(req, { params: Promise.resolve({}) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.message).toContain("Invalid meeting ID");
  });

  it("returns 400 when file type is not allowed", async () => {
    const req = createUploadRequest({
      file: new File(["test"], "doc.pdf", { type: "application/pdf" }),
      meetingId: TEST_MEETING_ID,
    });

    const res = await POST(req, { params: Promise.resolve({}) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.message).toContain("Invalid file type");
  });

  it("returns 404 when meeting is not found", async () => {
    mockFindById.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve(null) }),
    });

    const req = createUploadRequest({
      file: createTestFile(),
      meetingId: TEST_MEETING_ID,
    });

    const res = await POST(req, { params: Promise.resolve({}) });
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
            hostId: { toString: () => "different-user-id" },
          }),
      }),
    });

    const req = createUploadRequest({
      file: createTestFile(),
      meetingId: TEST_MEETING_ID,
    });

    const res = await POST(req, { params: Promise.resolve({}) });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
  });

  it("returns 403 when recording is disabled for meeting", async () => {
    mockFindById.mockReturnValue({
      select: () => ({
        lean: () =>
          Promise.resolve({
            ...meetingDoc,
            settings: { allowRecording: false },
          }),
      }),
    });

    const req = createUploadRequest({
      file: createTestFile(),
      meetingId: TEST_MEETING_ID,
    });

    const res = await POST(req, { params: Promise.resolve({}) });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error.message).toContain("Recording is disabled");
  });

  it("returns 400 when Google Drive is not connected", async () => {
    mockHasGoogleAccess.mockResolvedValue(false);

    const req = createUploadRequest({
      file: createTestFile(),
      meetingId: TEST_MEETING_ID,
    });

    const res = await POST(req, { params: Promise.resolve({}) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.message).toContain("Google Drive");
  });

  it("still succeeds when transcription queue fails", async () => {
    mockQueueAdd.mockRejectedValue(new Error("Redis unavailable"));

    const req = createUploadRequest({
      file: createTestFile(),
      meetingId: TEST_MEETING_ID,
    });

    const res = await POST(req, { params: Promise.resolve({}) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.transcriptionQueued).toBe(false);
  });

  it("stores speech segments when provided", async () => {
    const segments = [
      { speakerName: "Alice", speakerId: TEST_USER_ID, startTime: 0, endTime: 5 },
    ];
    mockFindOneAndUpdate.mockResolvedValue({});

    const req = createUploadRequest({
      file: createTestFile(),
      meetingId: TEST_MEETING_ID,
      speechSegments: JSON.stringify(segments),
    });

    const res = await POST(req, { params: Promise.resolve({}) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockFindOneAndUpdate).toHaveBeenCalledOnce();
  });
});

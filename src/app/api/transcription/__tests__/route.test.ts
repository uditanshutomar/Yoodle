import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ────────────────────────────────────────────────────────────

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

vi.mock("@/lib/infra/auth/middleware", () => ({
  getUserIdFromRequest: vi.fn(),
}));

vi.mock("@/lib/infra/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(undefined),
}));

// STT provider mock
const mockTranscribe = vi.fn();
vi.mock("@/lib/stt", () => ({
  getSTTProvider: vi.fn().mockReturnValue({
    transcribe: (...args: unknown[]) => mockTranscribe(...args),
  }),
}));

// Meeting model mock
const meetingFindById = vi.fn();
vi.mock("@/lib/infra/db/models/meeting", () => ({
  default: {
    findById: (...args: unknown[]) => meetingFindById(...args),
  },
}));

// Transcript model mock
const transcriptFindOneAndUpdate = vi.fn().mockResolvedValue({});
const transcriptFindOne = vi.fn();
vi.mock("@/lib/infra/db/models/transcript", () => ({
  default: {
    findOneAndUpdate: (...args: unknown[]) => transcriptFindOneAndUpdate(...args),
    findOne: (...args: unknown[]) => transcriptFindOne(...args),
  },
}));

// User model mock
const userFindById = vi.fn();
vi.mock("@/lib/infra/db/models/user", () => ({
  default: {
    findById: (...args: unknown[]) => userFindById(...args),
  },
}));

import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";

const mockedGetUserId = vi.mocked(getUserIdFromRequest);

const { POST, GET } = await import("../route");

// ── Test constants ───────────────────────────────────────────────────

const TEST_USER_ID = "507f1f77bcf86cd799439011";
const TEST_MEETING_ID = "507f1f77bcf86cd799439013";

function createSelectLeanQuery<T>(value: T) {
  const query = {
    select: vi.fn(() => query),
    lean: vi.fn().mockResolvedValue(value),
  };
  return query;
}

function createSelectLeanChain<T>(value: T) {
  const query = {
    select: vi.fn(() => query),
    lean: vi.fn().mockResolvedValue(value),
  };
  return query;
}

const defaultMeeting = {
  _id: TEST_MEETING_ID,
  hostId: { toString: () => TEST_USER_ID },
  status: "live",
  participants: [],
};

function createPostRequest(fields: Record<string, string | Blob>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.append(key, value);
  }
  return new NextRequest("http://localhost:3000/api/transcription", {
    method: "POST",
    headers: {
      Origin: "http://localhost:3000",
      Host: "localhost:3000",
    },
    body: formData,
  });
}

function createGetRequest(params: Record<string, string>) {
  const url = new URL("http://localhost:3000/api/transcription");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url, {
    method: "GET",
    headers: {
      Host: "localhost:3000",
    },
  });
}

function createAudioBlob(sizeBytes = 1024) {
  return new Blob([new ArrayBuffer(sizeBytes)], { type: "audio/webm" });
}

// ── POST Tests ───────────────────────────────────────────────────────

describe("POST /api/transcription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUserId.mockResolvedValue(TEST_USER_ID);
    meetingFindById.mockReturnValue(createSelectLeanQuery(defaultMeeting));
    userFindById.mockReturnValue(
      createSelectLeanQuery({ name: "Test User", displayName: "Test User" }),
    );
    mockTranscribe.mockResolvedValue({ text: "Hello world" });
    transcriptFindOneAndUpdate.mockResolvedValue({});
  });

  it("transcribes audio and stores the result", async () => {
    const response = await POST(
      createPostRequest({
        audio: new File([createAudioBlob()], "audio.webm", { type: "audio/webm" }),
        meetingId: TEST_MEETING_ID,
      }),
      { params: Promise.resolve({}) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.text).toBe("Hello world");
    expect(body.data.stored).toBe(true);
    expect(transcriptFindOneAndUpdate).toHaveBeenCalled();
  });

  it("returns stored: false when transcription is empty", async () => {
    mockTranscribe.mockResolvedValue({ text: "" });

    const response = await POST(
      createPostRequest({
        audio: new File([createAudioBlob()], "audio.webm", { type: "audio/webm" }),
        meetingId: TEST_MEETING_ID,
      }),
      { params: Promise.resolve({}) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.text).toBe("");
    expect(body.data.stored).toBe(false);
    expect(transcriptFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("returns stored: false when STT provider returns null text", async () => {
    mockTranscribe.mockResolvedValue({ text: null });

    const response = await POST(
      createPostRequest({
        audio: new File([createAudioBlob()], "audio.webm", { type: "audio/webm" }),
        meetingId: TEST_MEETING_ID,
      }),
      { params: Promise.resolve({}) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.stored).toBe(false);
  });

  it("returns 400 when audio file is missing", async () => {
    const response = await POST(
      createPostRequest({ meetingId: TEST_MEETING_ID }),
      { params: Promise.resolve({}) },
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("returns 400 when meetingId is missing", async () => {
    const response = await POST(
      createPostRequest({
        audio: new File([createAudioBlob()], "audio.webm", { type: "audio/webm" }),
      }),
      { params: Promise.resolve({}) },
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("returns 400 when meetingId is not a valid ObjectId", async () => {
    const response = await POST(
      createPostRequest({
        audio: new File([createAudioBlob()], "audio.webm", { type: "audio/webm" }),
        meetingId: "not-valid",
      }),
      { params: Promise.resolve({}) },
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.message).toBe("Invalid meeting ID.");
  });

  it("returns 400 when audio chunk exceeds 25 MB", async () => {
    const oversizedBlob = createAudioBlob(26 * 1024 * 1024);

    const response = await POST(
      createPostRequest({
        audio: new File([oversizedBlob], "audio.webm", { type: "audio/webm" }),
        meetingId: TEST_MEETING_ID,
      }),
      { params: Promise.resolve({}) },
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.message).toContain("Audio chunk too large");
  });

  it("returns 401 when user is not authenticated", async () => {
    const { UnauthorizedError } = await import("@/lib/infra/api/errors");
    mockedGetUserId.mockRejectedValue(new UnauthorizedError());

    const response = await POST(
      createPostRequest({
        audio: new File([createAudioBlob()], "audio.webm", { type: "audio/webm" }),
        meetingId: TEST_MEETING_ID,
      }),
      { params: Promise.resolve({}) },
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
  });

  it("returns 403 when user is not a meeting participant", async () => {
    meetingFindById.mockReturnValue(
      createSelectLeanQuery({
        ...defaultMeeting,
        hostId: { toString: () => "other-user" },
        participants: [],
      }),
    );

    const response = await POST(
      createPostRequest({
        audio: new File([createAudioBlob()], "audio.webm", { type: "audio/webm" }),
        meetingId: TEST_MEETING_ID,
      }),
      { params: Promise.resolve({}) },
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
  });

  it("returns 500 when STT provider throws an error", async () => {
    mockTranscribe.mockRejectedValue(new Error("Deepgram API error"));

    const response = await POST(
      createPostRequest({
        audio: new File([createAudioBlob()], "audio.webm", { type: "audio/webm" }),
        meetingId: TEST_MEETING_ID,
      }),
      { params: Promise.resolve({}) },
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
  });
});

// ── GET Tests ────────────────────────────────────────────────────────

describe("GET /api/transcription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUserId.mockResolvedValue(TEST_USER_ID);
    meetingFindById.mockReturnValue(createSelectLeanQuery(defaultMeeting));
  });

  it("returns transcript segments for a valid meeting", async () => {
    const segments = [
      { speakerName: "Test User", text: "Hello", timestamp: 1000 },
    ];
    transcriptFindOne.mockReturnValue(
      createSelectLeanChain({ segments, language: "en" }),
    );

    const response = await GET(
      createGetRequest({ meetingId: TEST_MEETING_ID }),
      { params: Promise.resolve({}) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.segments).toEqual(segments);
    expect(body.data.language).toBe("en");
  });

  it("returns empty segments when no transcript exists", async () => {
    transcriptFindOne.mockReturnValue(createSelectLeanChain(null));

    const response = await GET(
      createGetRequest({ meetingId: TEST_MEETING_ID }),
      { params: Promise.resolve({}) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.segments).toEqual([]);
  });

  it("returns 400 when meetingId query param is missing", async () => {
    const response = await GET(
      createGetRequest({}),
      { params: Promise.resolve({}) },
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("returns 401 when user is not authenticated", async () => {
    const { UnauthorizedError } = await import("@/lib/infra/api/errors");
    mockedGetUserId.mockRejectedValue(new UnauthorizedError());

    const response = await GET(
      createGetRequest({ meetingId: TEST_MEETING_ID }),
      { params: Promise.resolve({}) },
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
  });

  it("returns 403 when user is not a meeting participant", async () => {
    meetingFindById.mockReturnValue(
      createSelectLeanQuery({
        ...defaultMeeting,
        hostId: { toString: () => "other-user" },
        participants: [],
      }),
    );

    const response = await GET(
      createGetRequest({ meetingId: TEST_MEETING_ID }),
      { params: Promise.resolve({}) },
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
  });
});

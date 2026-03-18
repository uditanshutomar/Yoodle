import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

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

vi.mock("@/lib/infra/redis/cache", () => ({
  waitingConsumeAdmission: vi.fn(),
  waitingAddToQueue: vi.fn().mockResolvedValue(undefined),
}));

const userFindById = vi.fn();
vi.mock("@/lib/infra/db/models/user", () => ({
  default: {
    findById: (...args: unknown[]) => userFindById(...args),
  },
}));

const findOne = vi.fn();
const findOneAndUpdate = vi.fn();
const findById = vi.fn();
const updateOne = vi.fn();

vi.mock("@/lib/infra/db/models/meeting", () => ({
  default: {
    findOne: (...args: unknown[]) => findOne(...args),
    findOneAndUpdate: (...args: unknown[]) => findOneAndUpdate(...args),
    findById: (...args: unknown[]) => findById(...args),
    updateOne: (...args: unknown[]) => updateOne(...args),
  },
}));

import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { waitingConsumeAdmission } from "@/lib/infra/redis/cache";

const mockedGetUserId = vi.mocked(getUserIdFromRequest);
const mockedWaitingConsumeAdmission = vi.mocked(waitingConsumeAdmission);

const { POST } = await import("../route");

const TEST_USER_ID = "507f1f77bcf86cd799439011";
const HOST_USER_ID = "507f1f77bcf86cd799439012";
const TEST_MEETING_ID = "507f1f77bcf86cd799439013";

function createPopulatedQuery<T>(value: T) {
  const query = {
    populate: vi.fn(() => query),
    lean: vi.fn(() => query),
    then: (resolve: (result: T) => unknown) => Promise.resolve(resolve(value)),
    catch: (reject: (error: unknown) => unknown) =>
      Promise.resolve(value).catch(reject),
  };

  return query;
}

function createLeanQuery<T>(value: T) {
  const query = {
    select: vi.fn(() => query),
    lean: vi.fn().mockResolvedValue(value),
  };

  return query;
}

function createRequest(body?: Record<string, unknown>) {
  return new NextRequest(
    `http://localhost:3000/api/meetings/${TEST_MEETING_ID}/join`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:3000",
        Host: "localhost:3000",
      },
      body: JSON.stringify(body || {}),
    },
  );
}

const defaultContext = {
  params: Promise.resolve({ meetingId: TEST_MEETING_ID }),
};

describe("POST /api/meetings/[meetingId]/join", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetUserId.mockResolvedValue(TEST_USER_ID);
    mockedWaitingConsumeAdmission.mockResolvedValue(false);
    updateOne.mockResolvedValue({ modifiedCount: 1 });
  });

  it("returns a waiting-room disposition with the authoritative room session", async () => {
    findOne
      .mockReturnValueOnce(createPopulatedQuery(null))
      .mockReturnValueOnce(
        createLeanQuery({
          _id: TEST_MEETING_ID,
          hostId: HOST_USER_ID,
          status: "scheduled",
          participants: [],
          settings: {
            waitingRoom: true,
            muteOnJoin: true,
            allowRecording: false,
            allowScreenShare: false,
          },
        }),
      );

    userFindById.mockReturnValueOnce(
      createLeanQuery({
        name: "Test User",
        displayName: "Test User",
        avatarUrl: null,
      }),
    );

    const response = await POST(
      createRequest({
        audioEnabled: true,
        videoEnabled: true,
        audioDeviceId: "mic-1",
        videoDeviceId: "cam-1",
      }),
      defaultContext,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.joinDisposition).toBe("waiting");
    expect(body.data.roomSession.hostUserId).toBe(HOST_USER_ID);
    expect(body.data.roomSession.waitingRoomEnabled).toBe(true);
    expect(body.data.roomSession.media.audioEnabled).toBe(false);
    expect(body.data.roomSession.media.videoEnabled).toBe(true);
    expect(body.data.roomSession.media.audioDeviceId).toBe("mic-1");
    expect(body.data.roomSession.media.videoDeviceId).toBe("cam-1");
    expect(body.data.roomSession.permissions.allowRecording).toBe(false);
    expect(body.data.roomSession.permissions.allowScreenShare).toBe(false);
  });

  it("returns a joined room session and preserves selected devices when admission exists", async () => {
    mockedWaitingConsumeAdmission.mockResolvedValue(true);

    findOne
      .mockReturnValueOnce(createPopulatedQuery(null))
      .mockReturnValueOnce(
        createLeanQuery({
          _id: TEST_MEETING_ID,
          hostId: HOST_USER_ID,
          status: "scheduled",
          participants: [],
          settings: {
            waitingRoom: true,
            muteOnJoin: false,
            allowRecording: true,
            allowScreenShare: true,
            maxParticipants: 6,
          },
        }),
      );

    findOneAndUpdate.mockResolvedValueOnce({
      _id: TEST_MEETING_ID,
      hostId: HOST_USER_ID,
      status: "scheduled",
      participants: [{ status: "joined" }, { status: "joined" }],
      settings: {
        waitingRoom: true,
        muteOnJoin: false,
        allowRecording: true,
        allowScreenShare: true,
      },
    });

    findById.mockReturnValueOnce(createPopulatedQuery({
      _id: TEST_MEETING_ID,
      hostId: HOST_USER_ID,
      status: "live",
      participants: [{ status: "joined" }, { status: "joined" }],
      settings: {
        waitingRoom: true,
        muteOnJoin: false,
        allowRecording: true,
        allowScreenShare: true,
      },
    }));

    const response = await POST(
      createRequest({
        audioEnabled: true,
        videoEnabled: false,
        audioDeviceId: "mic-2",
        videoDeviceId: "cam-2",
      }),
      defaultContext,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.roomSession.joinDisposition).toBe("joined");
    expect(body.data.roomSession.transportMode).toBe("livekit");
    expect(body.data.roomSession.media.audioEnabled).toBe(true);
    expect(body.data.roomSession.media.videoEnabled).toBe(false);
    expect(body.data.roomSession.media.audioDeviceId).toBe("mic-2");
    expect(body.data.roomSession.media.videoDeviceId).toBe("cam-2");
    expect(body.data.roomSession.permissions.allowRecording).toBe(true);
    expect(body.data.roomSession.permissions.allowScreenShare).toBe(true);
  });
});

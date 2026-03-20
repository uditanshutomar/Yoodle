import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/infra/db/client", () => ({ default: vi.fn() }));
vi.mock("@/lib/infra/api/rate-limit", () => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/infra/auth/middleware", () => ({
  getUserIdFromRequest: vi.fn().mockResolvedValue("607f1f77bcf86cd799439011"),
}));

const mockConnectionFind = vi.fn();
vi.mock("@/lib/infra/db/models/connection", () => ({
  default: { find: (...args: unknown[]) => mockConnectionFind(...args) },
}));

const mockUserFind = vi.fn();
vi.mock("@/lib/infra/db/models/user", () => ({
  default: { find: (...args: unknown[]) => mockUserFind(...args) },
}));

import { GET } from "../route";

function buildRequest(url = "http://localhost/api/connections/requests") {
  return new NextRequest(new URL(url));
}

describe("GET /api/connections/requests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns incoming pending requests (200 with array)", async () => {
    const now = new Date("2026-03-20T10:00:00Z");

    mockConnectionFind.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([
            {
              _id: { toString: () => "607f1f77bcf86cd799439099" },
              requesterId: { toString: () => "607f1f77bcf86cd799439022" },
              recipientId: { toString: () => "607f1f77bcf86cd799439011" },
              status: "pending",
              createdAt: now,
            },
          ]),
        }),
      }),
    });

    mockUserFind.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          {
            _id: { toString: () => "607f1f77bcf86cd799439022" },
            name: "Jane Doe",
            displayName: "jane",
            avatarUrl: "https://example.com/avatar.jpg",
            status: "online",
          },
        ]),
      }),
    });

    const res = await GET(buildRequest());
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(1);
    expect(json.data[0]).toEqual({
      id: "607f1f77bcf86cd799439099",
      userId: "607f1f77bcf86cd799439022",
      name: "Jane Doe",
      displayName: "jane",
      avatarUrl: "https://example.com/avatar.jpg",
      userStatus: "online",
      createdAt: now.toISOString(),
    });
  });

  it("returns empty array when no pending requests", async () => {
    mockConnectionFind.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    mockUserFind.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      }),
    });

    const res = await GET(buildRequest());
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toEqual([]);
  });
});

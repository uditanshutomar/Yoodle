# Connections ("Your Circle") Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a mutual connection request system so users can add each other via email, with connections replacing workspace filtering for lockin mode map visibility.

**Architecture:** New `Connection` Mongoose model with `requesterId`, `recipientId`, `status`. Five API routes under `/api/connections/`. Frontend page at `/connections` with tabs (Yoodlers/Incoming/Sent). `useConnections` hook for client state. Nearby API updated to use connections instead of workspaces for lockin filtering.

**Tech Stack:** Next.js App Router, Mongoose, Zod, React 19, Framer Motion, Tailwind CSS (neo-brutalist), Vitest

---

### Task 1: Connection Model

**Files:**
- Create: `src/lib/infra/db/models/connection.ts`
- Test: `src/lib/infra/db/models/__tests__/connection.test.ts`

**Step 1: Write the failing test**

```typescript
// src/lib/infra/db/models/__tests__/connection.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import mongoose from "mongoose";

describe("Connection model", () => {
  it("exports CONNECTION_STATUSES constant", async () => {
    const { CONNECTION_STATUSES } = await import("../connection");
    expect(CONNECTION_STATUSES).toEqual(["pending", "accepted", "blocked"]);
  });

  it("exports Connection model", async () => {
    const { default: Connection } = await import("../connection");
    expect(Connection).toBeDefined();
    expect(Connection.modelName).toBe("Connection");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/infra/db/models/__tests__/connection.test.ts`
Expected: FAIL — module not found

**Step 3: Write the Connection model**

```typescript
// src/lib/infra/db/models/connection.ts
import mongoose, { Schema, Document, Model, Types } from "mongoose";

export const CONNECTION_STATUSES = ["pending", "accepted", "blocked"] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

export interface IConnection {
  requesterId: Types.ObjectId;
  recipientId: Types.ObjectId;
  status: ConnectionStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface IConnectionDocument extends IConnection, Document {
  _id: Types.ObjectId;
}

const connectionSchema = new Schema<IConnectionDocument>(
  {
    requesterId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    recipientId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: CONNECTION_STATUSES,
      default: "pending",
      required: true,
    },
  },
  { timestamps: true },
);

// Prevent duplicate requests between the same pair
connectionSchema.index({ requesterId: 1, recipientId: 1 }, { unique: true });

// Efficient queries: "my incoming pending requests"
connectionSchema.index({ recipientId: 1, status: 1 });

// Efficient queries: "my sent requests" / "my accepted connections"
connectionSchema.index({ requesterId: 1, status: 1 });

const Connection: Model<IConnectionDocument> =
  mongoose.models.Connection ||
  mongoose.model<IConnectionDocument>("Connection", connectionSchema);

export default Connection;
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/infra/db/models/__tests__/connection.test.ts`
Expected: PASS

**Step 5: Update Notification model — add `"connection_request"` type and `"connection"` source type**

Modify: `src/lib/infra/db/models/notification.ts:3-6`

Change the `NOTIFICATION_TYPES` array to include `"connection_request"`:
```typescript
export const NOTIFICATION_TYPES = [
  "mention", "reply", "meeting_invite", "meeting_starting",
  "task_assigned", "task_due", "ai_action_complete", "ghost_room_expiring",
  "connection_request",
] as const;
```

Change the `NOTIFICATION_SOURCE_TYPES` array to include `"connection"`:
```typescript
export const NOTIFICATION_SOURCE_TYPES = ["meeting", "message", "task", "ai", "connection"] as const;
```

**Step 6: Commit**

```bash
git add src/lib/infra/db/models/connection.ts src/lib/infra/db/models/__tests__/connection.test.ts src/lib/infra/db/models/notification.ts
git commit -m "feat: add Connection model and connection_request notification type"
```

---

### Task 2: POST /api/connections — Send Connection Request

**Files:**
- Create: `src/app/api/connections/route.ts`
- Test: `src/app/api/connections/__tests__/route.test.ts`

**Step 1: Write failing tests**

```typescript
// src/app/api/connections/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/infra/db/client", () => ({ default: vi.fn() }));
vi.mock("@/lib/infra/api/rate-limit", () => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/infra/auth/middleware", () => ({
  getUserIdFromRequest: vi.fn().mockResolvedValue("607f1f77bcf86cd799439011"),
}));
vi.mock("@/lib/infra/redis/cache", () => ({
  getCached: vi.fn(),
  setCache: vi.fn(),
  invalidateCache: vi.fn(),
}));

const mockFindOne = vi.fn();
const mockCreate = vi.fn();
const mockUserFindOne = vi.fn();
const mockUserFindById = vi.fn();

vi.mock("@/lib/infra/db/models/connection", () => ({
  default: {
    findOne: vi.fn().mockImplementation((...args: unknown[]) => ({
      lean: vi.fn().mockImplementation(() => mockFindOne(...args)),
    })),
    create: (...args: unknown[]) => mockCreate(...args),
  },
  CONNECTION_STATUSES: ["pending", "accepted", "blocked"],
}));

vi.mock("@/lib/infra/db/models/user", () => ({
  default: {
    findOne: vi.fn().mockImplementation((...args: unknown[]) => ({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockImplementation(() => mockUserFindOne(...args)),
      }),
    })),
    findById: vi.fn().mockImplementation((...args: unknown[]) => ({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockImplementation(() => mockUserFindById(...args)),
      }),
    })),
  },
}));

vi.mock("@/lib/infra/db/models/notification", () => ({
  default: { create: vi.fn() },
  NOTIFICATION_TYPES: [
    "mention", "reply", "meeting_invite", "meeting_starting",
    "task_assigned", "task_due", "ai_action_complete", "ghost_room_expiring",
    "connection_request",
  ],
}));

import { POST } from "../route";
import { NextRequest } from "next/server";

function makeReq(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/connections", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/connections", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a connection request for a valid email", async () => {
    mockUserFindById.mockResolvedValue({ _id: "607f1f77bcf86cd799439011", name: "Me" });
    mockUserFindOne.mockResolvedValue({ _id: "607f1f77bcf86cd799439022", name: "Other" });
    mockFindOne.mockResolvedValue(null); // no existing connection
    mockCreate.mockResolvedValue({
      _id: "607f1f77bcf86cd799439033",
      requesterId: "607f1f77bcf86cd799439011",
      recipientId: "607f1f77bcf86cd799439022",
      status: "pending",
    });

    const res = await POST(makeReq({ email: "other@gmail.com" }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("pending");
  });

  it("returns 400 for invalid email", async () => {
    const res = await POST(makeReq({ email: "not-an-email" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when sending request to yourself", async () => {
    mockUserFindOne.mockResolvedValue({ _id: "607f1f77bcf86cd799439011", name: "Me" });

    const res = await POST(makeReq({ email: "me@gmail.com" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when email not found", async () => {
    mockUserFindOne.mockResolvedValue(null);

    const res = await POST(makeReq({ email: "nobody@gmail.com" }));
    expect(res.status).toBe(404);
  });

  it("returns 409 when connection already exists", async () => {
    mockUserFindOne.mockResolvedValue({ _id: "607f1f77bcf86cd799439022", name: "Other" });
    mockFindOne.mockResolvedValue({ _id: "existing", status: "pending" }); // already exists

    const res = await POST(makeReq({ email: "other@gmail.com" }));
    expect(res.status).toBe(409);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/connections/__tests__/route.test.ts`
Expected: FAIL — route module not found

**Step 3: Write the route**

```typescript
// src/app/api/connections/route.ts
import { NextRequest } from "next/server";
import { z } from "zod";
import mongoose from "mongoose";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { BadRequestError, NotFoundError, ConflictError, ForbiddenError } from "@/lib/infra/api/errors";
import connectDB from "@/lib/infra/db/client";
import Connection from "@/lib/infra/db/models/connection";
import User from "@/lib/infra/db/models/user";
import Notification from "@/lib/infra/db/models/notification";

const createSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
});

/**
 * POST /api/connections — Send a Yoodle connection request
 * Body: { email: string }
 */
export const POST = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);

  const body = await req.json();
  const parsed = createSchema.parse(body);

  await connectDB();

  // Look up the target user by email
  const targetUser = await User.findOne({ email: parsed.email })
    .select("_id name displayName")
    .lean();

  if (!targetUser) {
    throw new NotFoundError("No Yoodler found with that email.");
  }

  const targetId = targetUser._id.toString();

  // Prevent self-connection
  if (targetId === userId) {
    throw new BadRequestError("You can't send a Yoodle request to yourself.");
  }

  const userObjectId = new mongoose.Types.ObjectId(userId);
  const targetObjectId = targetUser._id;

  // Check for existing connection in either direction
  const existing = await Connection.findOne({
    $or: [
      { requesterId: userObjectId, recipientId: targetObjectId },
      { requesterId: targetObjectId, recipientId: userObjectId },
    ],
  }).lean();

  if (existing) {
    if (existing.status === "blocked") {
      throw new ForbiddenError("Unable to send request.");
    }
    throw new ConflictError(
      existing.status === "accepted"
        ? "You're already connected."
        : "A request is already pending.",
    );
  }

  // Create the connection request
  const connection = await Connection.create({
    requesterId: userObjectId,
    recipientId: targetObjectId,
    status: "pending",
  });

  // Get requester name for notification
  const requester = await User.findById(userObjectId)
    .select("name displayName")
    .lean();

  const requesterName = requester?.displayName || requester?.name || "Someone";

  // Fire notification
  await Notification.create({
    userId: targetObjectId,
    type: "connection_request",
    title: "New Yoodle Request",
    body: `${requesterName} wants to connect with you.`,
    sourceType: "connection",
    sourceId: connection._id.toString(),
    priority: "normal",
  });

  return successResponse(
    {
      id: connection._id.toString(),
      recipientId: targetId,
      status: connection.status,
    },
    201,
  );
});

const listSchema = z.object({
  status: z.enum(["accepted", "pending", "blocked"]).default("accepted"),
});

/**
 * GET /api/connections — List your connections filtered by status
 * Query: ?status=accepted (default) | pending | blocked
 */
export const GET = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);

  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const { status } = listSchema.parse(params);

  await connectDB();

  const userObjectId = new mongoose.Types.ObjectId(userId);

  // Find connections where user is either requester or recipient
  const connections = await Connection.find({
    $or: [
      { requesterId: userObjectId, status },
      { recipientId: userObjectId, status },
    ],
  })
    .sort({ updatedAt: -1 })
    .limit(100)
    .lean();

  // Collect the "other" user IDs and fetch their profiles
  const otherIds = connections.map((c) =>
    c.requesterId.toString() === userId ? c.recipientId : c.requesterId,
  );

  const users = await User.find({ _id: { $in: otherIds } })
    .select("_id name displayName avatarUrl status mode")
    .lean();

  const userMap = new Map(users.map((u) => [u._id.toString(), u]));

  const result = connections.map((c) => {
    const otherId =
      c.requesterId.toString() === userId
        ? c.recipientId.toString()
        : c.requesterId.toString();
    const otherUser = userMap.get(otherId);

    return {
      id: c._id.toString(),
      userId: otherId,
      name: otherUser?.name || "Unknown",
      displayName: otherUser?.displayName || otherUser?.name || "Unknown",
      avatarUrl: otherUser?.avatarUrl || null,
      userStatus: otherUser?.status || "offline",
      connectionStatus: c.status,
      direction: c.requesterId.toString() === userId ? "sent" : "received",
      createdAt: c.createdAt,
    };
  });

  return successResponse(result);
});
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/connections/__tests__/route.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/app/api/connections/route.ts src/app/api/connections/__tests__/route.test.ts
git commit -m "feat: add POST/GET /api/connections for sending and listing requests"
```

---

### Task 3: GET /api/connections/requests — Incoming Pending Requests

**Files:**
- Create: `src/app/api/connections/requests/route.ts`
- Test: `src/app/api/connections/requests/__tests__/route.test.ts`

**Step 1: Write failing test**

```typescript
// src/app/api/connections/requests/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/infra/db/client", () => ({ default: vi.fn() }));
vi.mock("@/lib/infra/api/rate-limit", () => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/infra/auth/middleware", () => ({
  getUserIdFromRequest: vi.fn().mockResolvedValue("607f1f77bcf86cd799439011"),
}));

const mockFind = vi.fn();

vi.mock("@/lib/infra/db/models/connection", () => ({
  default: {
    find: vi.fn().mockImplementation((...args: unknown[]) => ({
      sort: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          lean: vi.fn().mockImplementation(() => mockFind(...args)),
        }),
      }),
    })),
  },
}));

vi.mock("@/lib/infra/db/models/user", () => ({
  default: {
    find: vi.fn().mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      }),
    })),
  },
}));

import { GET } from "../route";
import { NextRequest } from "next/server";

function makeReq() {
  return new NextRequest("http://localhost/api/connections/requests", {
    method: "GET",
    headers: { Origin: "http://localhost:3000" },
  });
}

describe("GET /api/connections/requests", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns incoming pending requests", async () => {
    mockFind.mockResolvedValue([
      {
        _id: "607f1f77bcf86cd799439033",
        requesterId: "607f1f77bcf86cd799439022",
        recipientId: "607f1f77bcf86cd799439011",
        status: "pending",
        createdAt: new Date(),
      },
    ]);

    const res = await GET(makeReq());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it("returns empty array when no pending requests", async () => {
    mockFind.mockResolvedValue([]);

    const res = await GET(makeReq());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/connections/requests/__tests__/route.test.ts`
Expected: FAIL

**Step 3: Write the route**

```typescript
// src/app/api/connections/requests/route.ts
import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import connectDB from "@/lib/infra/db/client";
import Connection from "@/lib/infra/db/models/connection";
import User from "@/lib/infra/db/models/user";

/**
 * GET /api/connections/requests — Incoming pending Yoodle requests
 */
export const GET = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);

  await connectDB();

  const userObjectId = new mongoose.Types.ObjectId(userId);

  const pending = await Connection.find({
    recipientId: userObjectId,
    status: "pending",
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  const requesterIds = pending.map((c) => c.requesterId);
  const users = await User.find({ _id: { $in: requesterIds } })
    .select("_id name displayName avatarUrl status")
    .lean();

  const userMap = new Map(users.map((u) => [u._id.toString(), u]));

  const result = pending.map((c) => {
    const requester = userMap.get(c.requesterId.toString());
    return {
      id: c._id.toString(),
      userId: c.requesterId.toString(),
      name: requester?.name || "Unknown",
      displayName: requester?.displayName || requester?.name || "Unknown",
      avatarUrl: requester?.avatarUrl || null,
      userStatus: requester?.status || "offline",
      createdAt: c.createdAt,
    };
  });

  return successResponse(result);
});
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/connections/requests/__tests__/route.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/app/api/connections/requests/
git commit -m "feat: add GET /api/connections/requests for incoming pending requests"
```

---

### Task 4: PATCH /api/connections/[id] — Accept or Block

**Files:**
- Create: `src/app/api/connections/[id]/route.ts`
- Test: `src/app/api/connections/[id]/__tests__/route.test.ts`

**Step 1: Write failing tests**

```typescript
// src/app/api/connections/[id]/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/infra/db/client", () => ({ default: vi.fn() }));
vi.mock("@/lib/infra/api/rate-limit", () => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/infra/auth/middleware", () => ({
  getUserIdFromRequest: vi.fn().mockResolvedValue("607f1f77bcf86cd799439011"),
}));

const mockFindOneAndUpdate = vi.fn();
const mockFindOneAndDelete = vi.fn();
const mockFindById = vi.fn();

vi.mock("@/lib/infra/db/models/connection", () => ({
  default: {
    findOneAndUpdate: vi.fn().mockImplementation((...args: unknown[]) => ({
      lean: vi.fn().mockImplementation(() => mockFindOneAndUpdate(...args)),
    })),
    findById: vi.fn().mockImplementation((...args: unknown[]) => ({
      lean: vi.fn().mockImplementation(() => mockFindById(...args)),
    })),
    findOneAndDelete: vi.fn().mockImplementation((...args: unknown[]) => ({
      lean: vi.fn().mockImplementation(() => mockFindOneAndDelete(...args)),
    })),
  },
  CONNECTION_STATUSES: ["pending", "accepted", "blocked"],
}));

import { PATCH, DELETE } from "../route";
import { NextRequest } from "next/server";

const CONN_ID = "607f1f77bcf86cd799439033";

function makePatchReq(body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/connections/${CONN_ID}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
    body: JSON.stringify(body),
  });
}

function makeDeleteReq() {
  return new NextRequest(`http://localhost/api/connections/${CONN_ID}`, {
    method: "DELETE",
    headers: { Origin: "http://localhost:3000" },
  });
}

const params = Promise.resolve({ id: CONN_ID });

describe("PATCH /api/connections/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("accepts a pending connection request", async () => {
    mockFindOneAndUpdate.mockResolvedValue({
      _id: CONN_ID,
      requesterId: "607f1f77bcf86cd799439022",
      recipientId: "607f1f77bcf86cd799439011",
      status: "accepted",
    });

    const res = await PATCH(makePatchReq({ action: "accept" }), { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.status).toBe("accepted");
  });

  it("returns 404 when connection not found or not authorized", async () => {
    mockFindOneAndUpdate.mockResolvedValue(null);

    const res = await PATCH(makePatchReq({ action: "accept" }), { params });
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid action", async () => {
    const res = await PATCH(makePatchReq({ action: "destroy" }), { params });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/connections/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes a connection", async () => {
    mockFindById.mockResolvedValue({
      _id: CONN_ID,
      requesterId: "607f1f77bcf86cd799439011",
      recipientId: "607f1f77bcf86cd799439022",
      status: "pending",
    });
    mockFindOneAndDelete.mockResolvedValue({ _id: CONN_ID });

    const res = await DELETE(makeDeleteReq(), { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.removed).toBe(true);
  });

  it("returns 404 when connection not found", async () => {
    mockFindById.mockResolvedValue(null);

    const res = await DELETE(makeDeleteReq(), { params });
    expect(res.status).toBe(404);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/connections/[id]/__tests__/route.test.ts`
Expected: FAIL

**Step 3: Write the route**

```typescript
// src/app/api/connections/[id]/route.ts
import { NextRequest } from "next/server";
import { z } from "zod";
import mongoose from "mongoose";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { BadRequestError, NotFoundError, ForbiddenError } from "@/lib/infra/api/errors";
import connectDB from "@/lib/infra/db/client";
import Connection from "@/lib/infra/db/models/connection";

const patchSchema = z.object({
  action: z.enum(["accept", "block"]),
});

/**
 * PATCH /api/connections/[id] — Accept or block a connection request
 * Body: { action: "accept" | "block" }
 * Only the recipient can accept or block.
 */
export const PATCH = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);
  const { id } = await context!.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new BadRequestError("Invalid connection ID.");
  }

  const body = await req.json();
  const { action } = patchSchema.parse(body);

  await connectDB();

  const userObjectId = new mongoose.Types.ObjectId(userId);

  // Atomic update: only the recipient can accept/block, and only pending connections
  const updated = await Connection.findOneAndUpdate(
    {
      _id: new mongoose.Types.ObjectId(id),
      recipientId: userObjectId,
      status: "pending",
    },
    { status: action === "accept" ? "accepted" : "blocked" },
    { new: true },
  ).lean();

  if (!updated) {
    throw new NotFoundError("Connection request not found or already handled.");
  }

  return successResponse({
    id: updated._id.toString(),
    status: updated.status,
  });
});

/**
 * DELETE /api/connections/[id] — Remove a connection or cancel a sent request
 * Requester can cancel pending. Either party can remove accepted.
 */
export const DELETE = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);
  const { id } = await context!.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new BadRequestError("Invalid connection ID.");
  }

  await connectDB();

  const userObjectId = new mongoose.Types.ObjectId(userId);
  const connObjectId = new mongoose.Types.ObjectId(id);

  // Verify the connection exists and the user is a party to it
  const connection = await Connection.findById(connObjectId).lean();

  if (!connection) {
    throw new NotFoundError("Connection not found.");
  }

  const isRequester = connection.requesterId.toString() === userId;
  const isRecipient = connection.recipientId.toString() === userId;

  if (!isRequester && !isRecipient) {
    throw new ForbiddenError("Not your connection.");
  }

  // Requester can cancel pending; either party can remove accepted
  if (connection.status === "pending" && !isRequester) {
    throw new ForbiddenError("Only the sender can cancel a pending request. Use PATCH to accept/block.");
  }

  await Connection.findOneAndDelete({ _id: connObjectId }).lean();

  return successResponse({ removed: true });
});
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/connections/[id]/__tests__/route.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/app/api/connections/[id]/
git commit -m "feat: add PATCH/DELETE /api/connections/[id] for accept/block/remove"
```

---

### Task 5: Update Nearby API — Use Connections Instead of Workspaces for LockedIn

**Files:**
- Modify: `src/app/api/users/nearby/route.ts`
- Modify: `src/app/api/users/nearby/__tests__/route.test.ts`

**Step 1: Update the test to mock Connection instead of Workspace**

In the test file, replace the Workspace mock with a Connection mock. The key change: instead of finding workspace mates, the route now finds accepted connections.

Update the existing test case for lockin users to verify it queries `Connection.find({ ... status: "accepted" })` instead of `Workspace.find()`.

**Step 2: Update the route**

In `src/app/api/users/nearby/route.ts`:

1. Replace `import Workspace from "@/lib/infra/db/models/workspace"` with `import Connection from "@/lib/infra/db/models/connection"`

2. Replace the workspace query block (lines 60-81) with:

```typescript
  // Find accepted connections for the requesting user
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const connections = await Connection.find({
    $or: [
      { requesterId: userObjectId, status: "accepted" },
      { recipientId: userObjectId, status: "accepted" },
    ],
  })
    .select("requesterId recipientId")
    .lean();

  // Collect connected user IDs (excluding self)
  const connectedIds: mongoose.Types.ObjectId[] = [];
  for (const conn of connections) {
    const otherId =
      conn.requesterId.toString() === userId
        ? conn.recipientId
        : conn.requesterId;
    connectedIds.push(
      otherId instanceof mongoose.Types.ObjectId
        ? otherId
        : new mongoose.Types.ObjectId(otherId.toString()),
    );
  }
```

3. Replace `lockinUserIds` with `connectedIds` in the `$geoNear` query (line 96-98):

```typescript
            ...(connectedIds.length > 0
              ? [{ mode: "lockin", _id: { $in: connectedIds } }]
              : []),
```

**Step 3: Run the updated tests**

Run: `npx vitest run src/app/api/users/nearby/__tests__/route.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add src/app/api/users/nearby/
git commit -m "feat: use connections instead of workspaces for lockin mode visibility"
```

---

### Task 6: useConnections Hook

**Files:**
- Create: `src/hooks/useConnections.ts`

**Step 1: Write the hook**

```typescript
// src/hooks/useConnections.ts
"use client";

import { useState, useEffect, useCallback } from "react";

export interface ConnectionUser {
  id: string;
  userId: string;
  name: string;
  displayName: string;
  avatarUrl: string | null;
  userStatus: string;
  connectionStatus: string;
  direction?: "sent" | "received";
  createdAt: string;
}

export interface UseConnectionsReturn {
  connections: ConnectionUser[];
  requests: ConnectionUser[];
  sent: ConnectionUser[];
  loading: boolean;
  requestCount: number;
  sendRequest: (email: string) => Promise<{ success: boolean; error?: string }>;
  acceptRequest: (id: string) => Promise<void>;
  declineRequest: (id: string) => Promise<void>;
  removeConnection: (id: string) => Promise<void>;
  cancelRequest: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...options });
  const body = await res.json();
  if (!res.ok || !body.success) {
    throw new Error(body.error?.message || "Request failed");
  }
  return body.data;
}

export function useConnections(): UseConnectionsReturn {
  const [connections, setConnections] = useState<ConnectionUser[]>([]);
  const [requests, setRequests] = useState<ConnectionUser[]>([]);
  const [sent, setSent] = useState<ConnectionUser[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [accepted, incoming, outgoing] = await Promise.all([
        apiFetch<ConnectionUser[]>("/api/connections?status=accepted"),
        apiFetch<ConnectionUser[]>("/api/connections/requests"),
        apiFetch<ConnectionUser[]>("/api/connections?status=pending"),
      ]);
      setConnections(accepted);
      setRequests(incoming);
      // Filter outgoing to only show sent by current user
      setSent(outgoing.filter((c) => c.direction === "sent"));
    } catch {
      // Best effort
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const sendRequest = useCallback(
    async (email: string) => {
      try {
        await apiFetch("/api/connections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        await refresh();
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Failed to send request",
        };
      }
    },
    [refresh],
  );

  const acceptRequest = useCallback(
    async (id: string) => {
      await apiFetch(`/api/connections/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "accept" }),
      });
      await refresh();
    },
    [refresh],
  );

  const declineRequest = useCallback(
    async (id: string) => {
      await apiFetch(`/api/connections/${id}`, { method: "DELETE" });
      // Optimistic removal from requests
      setRequests((prev) => prev.filter((r) => r.id !== id));
    },
    [],
  );

  const removeConnection = useCallback(
    async (id: string) => {
      await apiFetch(`/api/connections/${id}`, { method: "DELETE" });
      setConnections((prev) => prev.filter((c) => c.id !== id));
    },
    [],
  );

  const cancelRequest = useCallback(
    async (id: string) => {
      await apiFetch(`/api/connections/${id}`, { method: "DELETE" });
      setSent((prev) => prev.filter((s) => s.id !== id));
    },
    [],
  );

  return {
    connections,
    requests,
    sent,
    loading,
    requestCount: requests.length,
    sendRequest,
    acceptRequest,
    declineRequest,
    removeConnection,
    cancelRequest,
    refresh,
  };
}
```

**Step 2: Commit**

```bash
git add src/hooks/useConnections.ts
git commit -m "feat: add useConnections hook for client-side connection management"
```

---

### Task 7: Connections Page — Frontend

**Files:**
- Create: `src/app/(app)/connections/page.tsx`
- Create: `src/components/connections/ConnectionsPage.tsx`

**Step 1: Create the server page**

```typescript
// src/app/(app)/connections/page.tsx
import ConnectionsPage from "@/components/connections/ConnectionsPage";

export default function ConnectionsRoute() {
  return <ConnectionsPage />;
}
```

**Step 2: Create the ConnectionsPage component**

This is the main component with:
- Email input + "Send Yoodle" button at top
- Three tabs: Yoodlers / Incoming (with badge) / Sent
- List of connection cards per tab
- Empty states with fun copy
- Neo-brutalist styling matching the rest of the app

```typescript
// src/components/connections/ConnectionsPage.tsx
"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { Users, Send, UserCheck, Clock, X } from "lucide-react";
import { useConnections, type ConnectionUser } from "@/hooks/useConnections";

const TABS = [
  { key: "yoodlers", label: "Yoodlers", icon: Users },
  { key: "incoming", label: "Incoming", icon: UserCheck },
  { key: "sent", label: "Sent", icon: Clock },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function ConnectionsPage() {
  const {
    connections,
    requests,
    sent,
    loading,
    requestCount,
    sendRequest,
    acceptRequest,
    declineRequest,
    removeConnection,
    cancelRequest,
  } = useConnections();

  const [activeTab, setActiveTab] = useState<TabKey>("yoodlers");
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState(false);

  const handleSend = useCallback(async () => {
    if (!email.trim() || sending) return;
    setSending(true);
    setSendError(null);
    setSendSuccess(false);

    const result = await sendRequest(email.trim());
    setSending(false);

    if (result.success) {
      setEmail("");
      setSendSuccess(true);
      setTimeout(() => setSendSuccess(false), 3000);
    } else {
      setSendError(result.error || "Something went wrong.");
    }
  }, [email, sending, sendRequest]);

  const listForTab: ConnectionUser[] =
    activeTab === "yoodlers"
      ? connections
      : activeTab === "incoming"
        ? requests
        : sent;

  const emptyMessages: Record<TabKey, string> = {
    yoodlers: "No Yoodlers yet. Send your first Yoodle request!",
    incoming: "No pending vibes. You're all caught up.",
    sent: "You haven't sent any Yoodle requests yet.",
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-black text-[var(--text-primary)] font-heading">
          Connections
        </h1>
        <p className="text-sm text-[var(--text-muted)] font-body mt-1">
          Your circle of Yoodlers
        </p>
      </div>

      {/* Send Yoodle Request */}
      <div className="rounded-xl border-2 border-[var(--border-strong)] bg-[var(--surface)] p-4 shadow-[4px_4px_0_var(--border-strong)]">
        <label className="text-sm font-bold text-[var(--text-primary)] font-heading block mb-2">
          Add someone by email
        </label>
        <div className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setSendError(null);
              setSendSuccess(false);
            }}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="name@gmail.com"
            className="flex-1 rounded-lg border-2 border-[var(--border-strong)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] font-body focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none"
          />
          <button
            onClick={handleSend}
            disabled={!email.trim() || sending}
            className="flex items-center gap-2 rounded-lg border-2 border-[var(--border-strong)] bg-[#FFE600] px-4 py-2 text-sm font-bold text-[#0A0A0A] hover:shadow-[2px_2px_0_var(--border-strong)] active:shadow-none transition-all disabled:opacity-40 cursor-pointer font-heading"
          >
            <Send size={14} />
            {sending ? "Sending..." : "Send Yoodle"}
          </button>
        </div>
        {sendError && (
          <p className="text-xs text-[#FF6B6B] font-body mt-2">{sendError}</p>
        )}
        {sendSuccess && (
          <p className="text-xs text-green-600 font-body mt-2">
            Yoodle request sent!
          </p>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border-2 border-[var(--border-strong)] bg-[var(--surface)] p-1 shadow-[4px_4px_0_var(--border-strong)]">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`relative flex-1 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-bold transition-all cursor-pointer font-heading ${
              activeTab === tab.key
                ? "bg-[#FFE600] text-[#0A0A0A] shadow-[2px_2px_0_var(--border-strong)]"
                : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
            }`}
          >
            <tab.icon size={14} />
            {tab.label}
            {tab.key === "incoming" && requestCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#0A0A0A] px-1 text-[10px] font-black text-[#FFE600] tabular-nums">
                {requestCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="space-y-2">
        {loading ? (
          <div className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface)] p-8 text-center">
            <p className="text-sm text-[var(--text-muted)] font-body">
              Loading...
            </p>
          </div>
        ) : listForTab.length === 0 ? (
          <div className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface)] p-8 text-center">
            <Users
              size={32}
              className="mx-auto mb-3 text-[var(--text-muted)]"
            />
            <p className="text-sm text-[var(--text-muted)] font-body">
              {emptyMessages[activeTab]}
            </p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {listForTab.map((user) => (
              <motion.div
                key={user.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -100 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-3 rounded-xl border-2 border-[var(--border-strong)] bg-[var(--surface)] p-3 shadow-[2px_2px_0_var(--border-strong)]"
              >
                {/* Avatar */}
                {user.avatarUrl ? (
                  <Image
                    src={user.avatarUrl}
                    alt={user.displayName}
                    width={40}
                    height={40}
                    className="rounded-full object-cover border-2 border-[var(--border)]"
                  />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#FFE600]/20 border-2 border-[var(--border)] text-sm font-bold font-heading">
                    {user.displayName.charAt(0).toUpperCase()}
                  </div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-[var(--text-primary)] truncate font-heading">
                    {user.displayName}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        user.userStatus === "online"
                          ? "bg-green-500"
                          : user.userStatus === "in-meeting"
                            ? "bg-orange-500"
                            : user.userStatus === "dnd"
                              ? "bg-red-500"
                              : "bg-gray-400"
                      }`}
                    />
                    <span className="text-[11px] text-[var(--text-muted)] font-body capitalize">
                      {user.userStatus === "dnd"
                        ? "Do not disturb"
                        : user.userStatus?.replace("-", " ") || "offline"}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                {activeTab === "yoodlers" && (
                  <button
                    onClick={() => removeConnection(user.id)}
                    className="rounded-lg border-2 border-[var(--border)] px-3 py-1.5 text-xs font-bold text-[var(--text-secondary)] hover:bg-red-50 hover:text-red-600 hover:border-red-300 transition-all cursor-pointer font-heading"
                  >
                    Remove
                  </button>
                )}
                {activeTab === "incoming" && (
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => acceptRequest(user.id)}
                      className="rounded-lg border-2 border-[var(--border-strong)] bg-[#FFE600] px-3 py-1.5 text-xs font-bold text-[#0A0A0A] hover:shadow-[2px_2px_0_var(--border-strong)] active:shadow-none transition-all cursor-pointer font-heading"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => declineRequest(user.id)}
                      className="rounded-lg border-2 border-[var(--border)] px-3 py-1.5 text-xs font-bold text-[var(--text-secondary)] hover:bg-red-50 hover:text-red-600 hover:border-red-300 transition-all cursor-pointer font-heading"
                    >
                      Nah
                    </button>
                  </div>
                )}
                {activeTab === "sent" && (
                  <button
                    onClick={() => cancelRequest(user.id)}
                    className="rounded-lg border-2 border-[var(--border)] px-3 py-1.5 text-xs font-bold text-[var(--text-secondary)] hover:bg-red-50 hover:text-red-600 hover:border-red-300 transition-all cursor-pointer font-heading"
                  >
                    Unsend
                  </button>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
```

**Step 3: Add Connections to sidebar**

Modify: `src/components/layout/AppSidebar.tsx:7-8` — add `Users` to the import:
```typescript
import {
  LayoutGrid, DoorOpen, Kanban, MapPin, Calendar, MessageCircle,
  Activity, Ghost, Settings, ChevronDown, Check, Plus, Users,
} from "lucide-react";
```

Modify: `src/components/layout/AppSidebar.tsx:25-34` — add Connections to navItems after Map:
```typescript
const navItems = [
  { label: "The Desk", href: "/dashboard", icon: LayoutGrid },
  { label: "Rooms", href: "/meetings", icon: DoorOpen },
  { label: "The Board", href: "/board", icon: Kanban },
  { label: "Map", href: "/map", icon: MapPin },
  { label: "Connections", href: "/connections", icon: Users },
  { label: "Calendar", href: "/calendar", icon: Calendar },
  { label: "Chatter", href: "/messages", icon: MessageCircle },
  { label: "Ghost Rooms", href: "/ghost-rooms", icon: Ghost },
  { label: "Pulse", href: "/analytics", icon: Activity },
];
```

**Step 4: Commit**

```bash
git add src/app/\(app\)/connections/ src/components/connections/ src/components/layout/AppSidebar.tsx
git commit -m "feat: add Connections page with tabs, email input, and sidebar nav item"
```

---

### Task 8: Map HoverCard — Add "Yoodle" Button

**Files:**
- Modify: `src/components/map/HoverCard.tsx`

**Step 1: Update HoverCard to show a "Yoodle" connect button**

The HoverCard should add a third action button — "Yoodle" — that sends a connection request. Since we're on the map, the target user's ID is already known, so we send a request via the user's ID (we'll need to expose a `userId` variant on POST, or look up their email server-side). The simplest approach: add a `POST /api/connections` variant that accepts `{ userId }` alongside `{ email }`.

Update `src/app/api/connections/route.ts` to accept either `email` or `userId` in the POST body:

```typescript
const createSchema = z.union([
  z.object({ email: z.string().email().toLowerCase().trim() }),
  z.object({ userId: z.string().min(1) }),
]);
```

Then in the handler, look up by email or userId depending on which is provided.

Update `src/components/map/HoverCard.tsx`:
- Add `yoodling` and `yoodled` state (same pattern as wave)
- Add a "Yoodle" button after Wave and Chat
- POST to `/api/connections` with `{ userId: user.id }`
- On success show "Yoodled!" state

**Step 2: Commit**

```bash
git add src/components/map/HoverCard.tsx src/app/api/connections/route.ts
git commit -m "feat: add Yoodle connect button to map HoverCard"
```

---

### Task 9: Fix UserPin LockedIn Mode Bug

**Files:**
- Modify: `src/components/map/UserPin.tsx`

**Step 1: Read UserPin.tsx and fix the coordinate lookup**

The bug: when mode is `lockin`, UserPin tries to use `blurredCoordinates` which doesn't exist on the self pin. For the current user (`isCurrentUser`), always use `coordinates`.

Change the coordinate resolution logic:
```typescript
// For current user, always use exact coordinates (blur is only for others seeing us)
const coords = isCurrentUser
  ? user.location?.coordinates
  : isLockin
    ? user.location?.blurredCoordinates
    : user.location?.coordinates;
```

**Step 2: Commit**

```bash
git add src/components/map/UserPin.tsx
git commit -m "fix: show self pin in lockin mode by using exact coordinates for current user"
```

---

### Task 10: Run All Tests and Build

**Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests pass (930+ tests)

**Step 2: Run build**

Run: `npx next build`
Expected: Build succeeds with no TypeScript or ESLint errors

**Step 3: Fix any issues found**

If tests or build fail, fix the issues before proceeding.

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: address test and build issues for connections feature"
```

---

### Summary

| Task | What | Files |
|------|------|-------|
| 1 | Connection model + notification type update | `models/connection.ts`, `models/notification.ts` |
| 2 | POST/GET `/api/connections` | `api/connections/route.ts` + tests |
| 3 | GET `/api/connections/requests` | `api/connections/requests/route.ts` + tests |
| 4 | PATCH/DELETE `/api/connections/[id]` | `api/connections/[id]/route.ts` + tests |
| 5 | Update nearby API (connections > workspaces) | `api/users/nearby/route.ts` |
| 6 | `useConnections` hook | `hooks/useConnections.ts` |
| 7 | Connections page + sidebar | `connections/ConnectionsPage.tsx`, `AppSidebar.tsx` |
| 8 | Map HoverCard "Yoodle" button | `HoverCard.tsx`, connections POST update |
| 9 | Fix UserPin lockin mode bug | `UserPin.tsx` |
| 10 | Run all tests + build | — |

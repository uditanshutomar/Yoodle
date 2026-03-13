import { NextRequest } from "next/server";
import { z } from "zod";
import { withHandler } from "@/lib/api/with-handler";
import { successResponse } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/auth/middleware";
import connectDB from "@/lib/db/client";
import Workspace from "@/lib/db/models/workspace";

const createWorkspaceSchema = z.object({
  name: z.string().min(1, "Workspace name is required.").max(200),
  description: z.string().max(1000).optional(),
});

// GET /api/workspaces -- list workspaces for the authenticated user
export const GET = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);

  const limit = Math.min(
    Math.max(Number(req.nextUrl.searchParams.get("limit")) || 50, 1),
    100,
  );
  const page = Math.max(Number(req.nextUrl.searchParams.get("page")) || 1, 1);
  const skip = (page - 1) * limit;

  await connectDB();

  const filter = {
    $or: [{ ownerId: userId }, { "members.userId": userId }],
  };

  const [workspaces, total] = await Promise.all([
    Workspace.find(filter)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Workspace.countDocuments(filter),
  ]);

  return successResponse({
    workspaces,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// POST /api/workspaces -- create a new workspace
export const POST = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);

  const body = createWorkspaceSchema.parse(await req.json());

  await connectDB();

  const workspace = await Workspace.create({
    name: body.name.trim(),
    description: body.description?.trim() || "",
    ownerId: userId,
    members: [{ userId, role: "owner", joinedAt: new Date() }],
    settings: { autoShutdown: true, shutdownAfterMinutes: 60 },
  });

  return successResponse(workspace, 201);
});

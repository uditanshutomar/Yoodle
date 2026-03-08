import { NextRequest } from "next/server";
import { authenticateRequest } from "@/lib/auth/middleware";
import connectDB from "@/lib/db/client";
import Workspace from "@/lib/db/models/workspace";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
  serverErrorResponse,
} from "@/lib/utils/api-response";

// GET /api/workspaces — list workspaces for the authenticated user
export async function GET(request: NextRequest) {
  try {
    let userId: string;
    try {
      const payload = await authenticateRequest(request);
      userId = payload.userId;
    } catch {
      return unauthorizedResponse();
    }

    await connectDB();

    const workspaces = await Workspace.find({
      $or: [{ ownerId: userId }, { "members.userId": userId }],
    })
      .sort({ updatedAt: -1 })
      .lean();

    return successResponse(workspaces);
  } catch (error) {
    console.error("[Workspaces GET Error]", error);
    return serverErrorResponse("Failed to fetch workspaces.");
  }
}

// POST /api/workspaces — create a new workspace
export async function POST(request: NextRequest) {
  try {
    let userId: string;
    try {
      const payload = await authenticateRequest(request);
      userId = payload.userId;
    } catch {
      return unauthorizedResponse();
    }

    const body = await request.json();
    const { name, description } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return errorResponse("Workspace name is required.", 400);
    }

    await connectDB();

    const workspace = await Workspace.create({
      name: name.trim(),
      description: description?.trim() || "",
      ownerId: userId,
      members: [{ userId, role: "owner", joinedAt: new Date() }],
      settings: { autoShutdown: true, shutdownAfterMinutes: 60 },
    });

    return successResponse(workspace, 201);
  } catch (error) {
    console.error("[Workspaces POST Error]", error);
    return serverErrorResponse("Failed to create workspace.");
  }
}

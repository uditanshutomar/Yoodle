import { NextRequest } from "next/server";
import connectDB from "@/lib/db/client";
import Agent from "@/lib/db/models/agent";
import { authenticateRequest } from "@/lib/auth/middleware";
import {
  successResponse,
  unauthorizedResponse,
  serverErrorResponse,
} from "@/lib/utils/api-response";

/**
 * GET /api/agents
 * Returns the authenticated user's Doodle agent.
 * Auto-creates the agent if it doesn't exist yet.
 */
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

    // Find or create the agent for this user
    let agent = await Agent.findOne({ userId });

    if (!agent) {
      agent = await Agent.create({
        userId,
        name: "Doodle",
        status: "idle",
      });
    }

    return successResponse({
      id: agent._id.toString(),
      userId: agent.userId.toString(),
      name: agent.name,
      status: agent.status,
      capabilities: agent.capabilities,
      activeCollaborations: agent.activeCollaborations.map((id) => id.toString()),
      lastActiveAt: agent.lastActiveAt,
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
    });
  } catch (error) {
    console.error("[Agent GET Error]", error);
    return serverErrorResponse("Failed to retrieve agent.");
  }
}

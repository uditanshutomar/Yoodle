import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api/with-handler";
import { successResponse } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/auth/middleware";
import connectDB from "@/lib/db/client";
import Agent from "@/lib/db/models/agent";

/**
 * GET /api/agents
 * Returns the authenticated user's Doodle agent.
 * Auto-creates the agent if it doesn't exist yet.
 */
export const GET = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "ai");
  const userId = await getUserIdFromRequest(req);

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
});

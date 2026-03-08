import { NextRequest } from "next/server";
import connectDB from "@/lib/db/client";
import User from "@/lib/db/models/user";
import { authenticateRequest } from "@/lib/auth/middleware";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
  serverErrorResponse,
} from "@/lib/utils/api-response";

/**
 * GET /api/users/search?q=<query>&limit=<number>
 * Search users by name or email. Requires authentication.
 * Returns an array of public user profiles.
 */
export async function GET(request: NextRequest) {
  try {
    // Authenticate the request
    try {
      await authenticateRequest(request);
    } catch {
      return unauthorizedResponse();
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim();
    const limitParam = searchParams.get("limit");
    const limit = Math.min(
      Math.max(parseInt(limitParam || "20", 10) || 20, 1),
      50
    );

    if (!query || query.length < 1) {
      return errorResponse({
        message:
          "Search query is required. Provide a 'q' parameter with at least 1 character.",
        status: 400,
      });
    }

    await connectDB();

    // Escape special regex characters for safe search
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const users = await User.find({
      $or: [
        { name: { $regex: escapedQuery, $options: "i" } },
        { displayName: { $regex: escapedQuery, $options: "i" } },
        { email: { $regex: escapedQuery, $options: "i" } },
      ],
    })
      .select("name displayName email avatarUrl status")
      .limit(limit)
      .lean();

    const publicProfiles = users.map((user) => ({
      id: user._id.toString(),
      name: user.name,
      displayName: user.displayName,
      email: user.email,
      avatarUrl: user.avatarUrl || null,
      status: user.status,
    }));

    return successResponse(publicProfiles);
  } catch (error) {
    console.error("[Users/Search Error]", error);
    return serverErrorResponse("Failed to search users.");
  }
}

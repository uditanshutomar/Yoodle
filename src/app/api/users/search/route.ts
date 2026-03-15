import { NextRequest } from "next/server";
import { z } from "zod";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { BadRequestError } from "@/lib/infra/api/errors";
import connectDB from "@/lib/infra/db/client";
import User from "@/lib/infra/db/models/user";

const searchQuerySchema = z.object({
  q: z.string().min(1, "Search query is required. Provide a 'q' parameter with at least 1 character."),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/**
 * GET /api/users/search?q=<query>&limit=<number>
 * Search users by name or email. Requires authentication.
 * Returns an array of public user profiles.
 */
export const GET = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "general");
  await getUserIdFromRequest(req);

  const searchParams = req.nextUrl.searchParams;

  const rawQ = searchParams.get("q")?.trim();
  if (!rawQ || rawQ.length < 1) {
    throw new BadRequestError(
      "Search query is required. Provide a 'q' parameter with at least 1 character."
    );
  }

  const { q: query, limit } = searchQuerySchema.parse({
    q: rawQ,
    limit: searchParams.get("limit") ?? 20,
  });

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
    .select("name displayName email avatarUrl status mode")
    .limit(limit)
    .lean();

  const publicProfiles = users.map((user) => ({
    id: user._id.toString(),
    name: user.name,
    displayName: user.displayName,
    // email deliberately excluded from public search results for privacy
    avatarUrl: user.avatarUrl || null,
    // Invisible mode: always show as "offline" to other users
    status: user.mode === "invisible" ? "offline" : user.status,
  }));

  return successResponse(publicProfiles);
});

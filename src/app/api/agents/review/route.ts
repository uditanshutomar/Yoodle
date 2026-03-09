import { NextRequest } from "next/server";
import { z } from "zod";
import { withHandler } from "@/lib/api/with-handler";
import { successResponse } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/auth/middleware";
import { BadRequestError } from "@/lib/api/errors";
import connectDB from "@/lib/db/client";
import { getFileContent } from "@/lib/google/drive";
import { hasGoogleAccess } from "@/lib/google/client";
import { reviewWork } from "@/lib/ai/agent-services";

const reviewSchema = z.union([
  z.object({
    /** Review inline content */
    content: z.string().min(1).max(50000),
    workType: z.string().min(1).max(100),
    context: z.string().max(500).optional(),
  }),
  z.object({
    /** Review a Google Drive file by ID */
    googleFileId: z.string().min(1),
    workType: z.string().min(1).max(100),
    context: z.string().max(500).optional(),
  }),
]);

/**
 * POST /api/agents/review
 * Submit work for AI review. Accepts inline content or a Google Drive file ID.
 * Returns strengths, flaws, suggestions, and an overall assessment.
 */
export const POST = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "ai");
  const userId = await getUserIdFromRequest(req);

  const data = reviewSchema.parse(await req.json());

  await connectDB();

  let content: string;

  if ("googleFileId" in data) {
    const hasAccess = await hasGoogleAccess(userId);
    if (!hasAccess) {
      throw new BadRequestError("Google account required to read files.");
    }

    try {
      content = await getFileContent(userId, data.googleFileId);
    } catch (err) {
      console.error("[File Read Error]", err);
      throw new BadRequestError("Failed to read the file from Google Drive.");
    }
  } else {
    content = data.content;
  }

  const review = await reviewWork(content, data.workType, data.context);

  return successResponse({
    strengths: review.strengths,
    flaws: review.flaws,
    suggestions: review.suggestions,
    overallAssessment: review.overallAssessment,
  });
});

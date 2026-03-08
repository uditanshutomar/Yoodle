import { NextRequest } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/db/client";
import { authenticateRequest } from "@/lib/auth/middleware";
import { getFileContent } from "@/lib/google/drive";
import { hasGoogleAccess } from "@/lib/google/client";
import { reviewWork } from "@/lib/ai/agent-services";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
  serverErrorResponse,
} from "@/lib/utils/api-response";

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
    const parsed = reviewSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse({
        message: "Validation failed.",
        status: 400,
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    await connectDB();

    let content: string;

    if ("googleFileId" in parsed.data) {
      const hasAccess = await hasGoogleAccess(userId);
      if (!hasAccess) {
        return errorResponse("Google account required to read files.", 400);
      }

      try {
        content = await getFileContent(userId, parsed.data.googleFileId);
      } catch (err) {
        console.error("[File Read Error]", err);
        return errorResponse("Failed to read the file from Google Drive.", 400);
      }
    } else {
      content = parsed.data.content;
    }

    const review = await reviewWork(content, parsed.data.workType, parsed.data.context);

    return successResponse({
      strengths: review.strengths,
      flaws: review.flaws,
      suggestions: review.suggestions,
      overallAssessment: review.overallAssessment,
    });
  } catch (error) {
    console.error("[Review Error]", error);
    return serverErrorResponse("Failed to review work.");
  }
}

import { NextRequest } from "next/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { authenticateRequest } from "@/lib/auth/middleware";
import { getPresignedUploadUrl } from "@/lib/vultr/object-storage";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
  serverErrorResponse,
} from "@/lib/utils/api-response";

const uploadRequestSchema = z.object({
  meetingId: z.string().min(1, "Meeting ID is required."),
  contentType: z
    .string()
    .regex(/^(audio|video)\//, "Must be an audio or video content type."),
});

/**
 * POST /api/recordings/upload-url
 *
 * Generates a pre-signed URL for the client to upload a recording
 * directly to Vultr Object Storage. Returns the upload URL and the
 * storage key so the client can PUT the file and then confirm it.
 */
export async function POST(request: NextRequest) {
  try {
    try {
      await authenticateRequest(request);
    } catch {
      return unauthorizedResponse();
    }

    const body = await request.json();
    const parsed = uploadRequestSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse({
        message: "Validation failed.",
        status: 400,
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const { meetingId, contentType } = parsed.data;

    // Determine file extension from content type
    const ext = contentType.includes("webm")
      ? "webm"
      : contentType.includes("mp4")
        ? "mp4"
        : contentType.includes("ogg")
          ? "ogg"
          : "webm";

    const key = `recordings/${meetingId}/${nanoid()}.${ext}`;

    const uploadUrl = await getPresignedUploadUrl(key, contentType, 600); // 10 min expiry

    return successResponse({ uploadUrl, key });
  } catch (error) {
    console.error("[Recording Upload URL Error]", error);
    return serverErrorResponse("Failed to generate upload URL.");
  }
}

import { NextRequest } from "next/server";
import { authenticateRequest } from "@/lib/auth/middleware";
import { getPresignedDownloadUrl } from "@/lib/vultr/object-storage";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
  serverErrorResponse,
} from "@/lib/utils/api-response";

function getS3Client(): S3Client {
  const hostname = process.env.VULTR_OBJECT_STORAGE_HOSTNAME;
  const accessKey = process.env.VULTR_OBJECT_STORAGE_ACCESS_KEY;
  const secretKey = process.env.VULTR_OBJECT_STORAGE_SECRET_KEY;
  const region = process.env.VULTR_OBJECT_STORAGE_REGION || "ewr1";

  if (!hostname || !accessKey || !secretKey) {
    throw new Error("Vultr Object Storage credentials not configured.");
  }

  return new S3Client({
    region,
    endpoint: `https://${hostname}`,
    credentials: {
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
    },
    forcePathStyle: true,
  });
}

/**
 * GET /api/recordings/[meetingId]
 *
 * Lists recordings for a meeting and returns pre-signed download URLs.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  try {
    try {
      await authenticateRequest(request);
    } catch {
      return unauthorizedResponse();
    }

    const { meetingId } = await params;

    if (!meetingId) {
      return errorResponse("meetingId is required.", 400);
    }

    const hostname = process.env.VULTR_OBJECT_STORAGE_HOSTNAME;
    if (!hostname) {
      return successResponse({ recordings: [], meetingId });
    }

    const client = getS3Client();
    const bucket =
      process.env.VULTR_OBJECT_STORAGE_BUCKET || "yoodle-recordings";

    // List all objects under recordings/{meetingId}/
    const listResult = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: `recordings/${meetingId}/`,
      })
    );

    const recordings = [];

    if (listResult.Contents && listResult.Contents.length > 0) {
      for (const obj of listResult.Contents) {
        if (!obj.Key) continue;
        const downloadUrl = await getPresignedDownloadUrl(obj.Key, 3600);
        recordings.push({
          key: obj.Key,
          size: obj.Size,
          lastModified: obj.LastModified?.toISOString(),
          downloadUrl,
        });
      }
    }

    return successResponse({ recordings, meetingId });
  } catch (error) {
    console.error("[Recordings GET Error]", error);
    return serverErrorResponse("Failed to retrieve recordings.");
  }
}

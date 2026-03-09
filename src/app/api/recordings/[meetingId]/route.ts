import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api/with-handler";
import { successResponse } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/auth/middleware";
import { BadRequestError, NotFoundError, ForbiddenError } from "@/lib/api/errors";
import connectDB from "@/lib/db/client";
import Meeting from "@/lib/db/models/meeting";
import { getPresignedDownloadUrl } from "@/lib/vultr/object-storage";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

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
export const GET = withHandler(async (req: NextRequest, context) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);

  const { meetingId } = await context!.params;
  if (!meetingId?.match(/^[0-9a-fA-F]{24}$/)) {
    throw new BadRequestError("Invalid meeting ID");
  }

  // Verify the user is a participant or host of this meeting
  await connectDB();
  const meeting = await Meeting.findById(meetingId);
  if (!meeting) {
    throw new NotFoundError("Meeting not found.");
  }
  const isParticipant =
    meeting.hostId.toString() === userId ||
    meeting.participants.some((p) => p.userId.toString() === userId);
  if (!isParticipant) {
    throw new ForbiddenError("You are not a participant in this meeting.");
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
});

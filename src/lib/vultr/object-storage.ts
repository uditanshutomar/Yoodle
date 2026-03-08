import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function getS3Client(): S3Client {
  const hostname = process.env.VULTR_OBJECT_STORAGE_HOSTNAME;
  const accessKey = process.env.VULTR_OBJECT_STORAGE_ACCESS_KEY;
  const secretKey = process.env.VULTR_OBJECT_STORAGE_SECRET_KEY;
  const region = process.env.VULTR_OBJECT_STORAGE_REGION || "ewr1";

  if (!hostname || !accessKey || !secretKey) {
    throw new Error(
      "Vultr Object Storage credentials not configured. Set VULTR_OBJECT_STORAGE_HOSTNAME, VULTR_OBJECT_STORAGE_ACCESS_KEY, and VULTR_OBJECT_STORAGE_SECRET_KEY."
    );
  }

  return new S3Client({
    region,
    endpoint: `https://${hostname}`,
    credentials: {
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
    },
    forcePathStyle: true, // Required for Vultr S3-compatible storage
  });
}

function getBucket(): string {
  return process.env.VULTR_OBJECT_STORAGE_BUCKET || "yoodle-recordings";
}

// ── Upload a file ────────────────────────────────────────────────────

export async function uploadFile(
  key: string,
  body: Buffer | Uint8Array | ReadableStream,
  contentType: string
): Promise<string> {
  const client = getS3Client();
  const bucket = getBucket();

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body as Uint8Array,
      ContentType: contentType,
      ACL: "private",
    })
  );

  const hostname = process.env.VULTR_OBJECT_STORAGE_HOSTNAME;
  return `https://${hostname}/${bucket}/${key}`;
}

// ── Get a pre-signed download URL ────────────────────────────────────

export async function getPresignedDownloadUrl(
  key: string,
  expiresInSeconds = 3600
): Promise<string> {
  const client = getS3Client();
  const bucket = getBucket();

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

// ── Get a pre-signed upload URL ──────────────────────────────────────

export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresInSeconds = 3600
): Promise<string> {
  const client = getS3Client();
  const bucket = getBucket();

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
    ACL: "private",
  });

  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

// ── Delete a file ────────────────────────────────────────────────────

export async function deleteFile(key: string): Promise<void> {
  const client = getS3Client();
  const bucket = getBucket();

  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );
}

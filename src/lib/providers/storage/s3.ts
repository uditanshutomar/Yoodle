import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type { StorageProvider, UploadResult } from "../types";

const DEFAULT_REGION = "us-east-1";
const DEFAULT_SIGNED_URL_EXPIRY = 3600; // 1 hour in seconds

function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`${key} not configured for S3 storage provider`);
  }
  return value;
}

function createS3Client(): S3Client {
  const endpoint = getRequiredEnv("S3_ENDPOINT");
  const accessKeyId = getRequiredEnv("S3_ACCESS_KEY");
  const secretAccessKey = getRequiredEnv("S3_SECRET_KEY");
  const region = process.env.S3_REGION || DEFAULT_REGION;

  return new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
}

function getBucket(): string {
  return getRequiredEnv("S3_BUCKET");
}

/**
 * Build the public URL for an uploaded object.
 * Uses the S3 endpoint and bucket to construct the path-style URL.
 */
function buildObjectUrl(endpoint: string, bucket: string, key: string): string {
  const base = endpoint.replace(/\/+$/, "");
  return `${base}/${bucket}/${key}`;
}

export class S3StorageProvider implements StorageProvider {
  readonly name = "s3";

  private client: S3Client;
  private bucket: string;

  constructor() {
    this.client = createS3Client();
    this.bucket = getBucket();
  }

  async upload(
    key: string,
    data: Buffer,
    contentType: string,
  ): Promise<UploadResult> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: data,
      ContentType: contentType,
    });

    await this.client.send(command);

    const endpoint = getRequiredEnv("S3_ENDPOINT");
    const url = buildObjectUrl(endpoint, this.bucket, key);

    return { url, key };
  }

  async getSignedUrl(key: string, expiresIn?: number): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return getSignedUrl(this.client, command, {
      expiresIn: expiresIn ?? DEFAULT_SIGNED_URL_EXPIRY,
    });
  }

  async getUploadUrl(
    key: string,
    contentType: string,
    expiresIn?: number,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });

    return getSignedUrl(this.client, command, {
      expiresIn: expiresIn ?? DEFAULT_SIGNED_URL_EXPIRY,
    });
  }

  async delete(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    await this.client.send(command);
  }
}

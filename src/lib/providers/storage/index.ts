import type { StorageProvider } from "../types";

let cachedProvider: StorageProvider | null = null;

/**
 * Get the configured storage provider.
 * Uses generic S3-compatible storage by default.
 * Works with: Vultr Object Storage, AWS S3, Cloudflare R2, MinIO, etc.
 */
export async function getStorageProvider(): Promise<StorageProvider> {
  if (cachedProvider) return cachedProvider;

  const { S3StorageProvider } = await import("./s3");
  cachedProvider = new S3StorageProvider();

  return cachedProvider;
}

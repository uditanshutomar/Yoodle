import "server-only";
import crypto from "crypto";

/**
 * AES-256-GCM encryption for storing user API keys at rest.
 *
 * Derives the encryption key from JWT_SECRET via PBKDF2 — no additional
 * env var needed. Each encrypt() call generates a random IV for semantic
 * security (same plaintext → different ciphertext every time).
 *
 * Format: `iv:authTag:ciphertext` (all hex-encoded)
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16; // 128-bit IV
const KEY_LENGTH = 32; // 256-bit key
const PBKDF2_ITERATIONS = 100_000;
const SALT = "yoodle-api-key-encryption"; // Fixed salt (key is already high-entropy)

let _derivedKey: Buffer | null = null;

function getDerivedKey(): Buffer {
  if (_derivedKey) return _derivedKey;

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is required for API key encryption.");
  }

  _derivedKey = crypto.pbkdf2Sync(secret, SALT, PBKDF2_ITERATIONS, KEY_LENGTH, "sha256");
  return _derivedKey;
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns `iv:authTag:ciphertext` (hex-encoded).
 */
export function encrypt(plaintext: string): string {
  const key = getDerivedKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Decrypt a string encrypted by encrypt().
 * Input format: `iv:authTag:ciphertext` (hex-encoded).
 */
export function decrypt(encryptedValue: string): string {
  const key = getDerivedKey();
  const parts = encryptedValue.split(":");

  if (parts.length !== 3) {
    throw new Error("Invalid encrypted value format.");
  }

  const [ivHex, authTagHex, ciphertext] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Mask an API key for display (e.g., "AIza•••••fXA").
 * Shows first 4 and last 3 characters.
 */
export function maskApiKey(key: string): string {
  if (key.length <= 8) return "•••••";
  return `${key.slice(0, 4)}${"•".repeat(5)}${key.slice(-3)}`;
}

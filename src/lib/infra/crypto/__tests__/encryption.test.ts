import { describe, expect, it, beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

beforeEach(() => {
  process.env.JWT_SECRET = "test-secret-key-for-encryption-testing-12345678";
});

const { encrypt, decrypt, maskApiKey } = await import("../encryption");

describe("encryption", () => {
  it("encrypts and decrypts a value correctly", () => {
    const plaintext = "AIzaSyAvC2QCWEP5LqBhvCwvbf3I_O6_9DNcfXA";
    const encrypted = encrypt(plaintext);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("produces different ciphertext for same plaintext (random IV)", () => {
    const plaintext = "test-api-key-123";
    const a = encrypt(plaintext);
    const b = encrypt(plaintext);
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe(plaintext);
    expect(decrypt(b)).toBe(plaintext);
  });

  it("returns iv:authTag:ciphertext format", () => {
    const encrypted = encrypt("test");
    const parts = encrypted.split(":");
    expect(parts).toHaveLength(3);
    // IV is 16 bytes = 32 hex chars
    expect(parts[0]).toHaveLength(32);
    // Auth tag is 16 bytes = 32 hex chars
    expect(parts[1]).toHaveLength(32);
    // Ciphertext length varies
    expect(parts[2].length).toBeGreaterThan(0);
  });

  it("throws on tampered ciphertext", () => {
    const encrypted = encrypt("secret-key");
    const parts = encrypted.split(":");
    // Tamper with ciphertext
    parts[2] = "0000" + parts[2].slice(4);
    expect(() => decrypt(parts.join(":"))).toThrow();
  });

  it("throws on invalid format", () => {
    expect(() => decrypt("invalid")).toThrow("Invalid encrypted value format");
    expect(() => decrypt("a:b")).toThrow("Invalid encrypted value format");
  });

  it("handles empty string", () => {
    const encrypted = encrypt("");
    expect(decrypt(encrypted)).toBe("");
  });

  it("handles long API keys", () => {
    const longKey = "a".repeat(500);
    const encrypted = encrypt(longKey);
    expect(decrypt(encrypted)).toBe(longKey);
  });
});

describe("maskApiKey", () => {
  it("masks a typical Gemini key", () => {
    expect(maskApiKey("AIzaSyAvC2QCWEP5LqBhvCwvbf3I_O6_9DNcfXA")).toBe(
      "AIza•••••fXA"
    );
  });

  it("masks a short key", () => {
    expect(maskApiKey("abcdefgh")).toBe("•••••");
  });

  it("masks a Deepgram key", () => {
    expect(maskApiKey("b7d9dc94c7c65696e011dd2eaa9b46e39fd14425")).toBe(
      "b7d9•••••425"
    );
  });
});

import "server-only";
import { SignJWT, jwtVerify, JWTPayload } from "jose";

interface TokenPayload extends JWTPayload {
  userId: string;
  type: "access" | "refresh";
}

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not defined in environment variables.");
  }
  return new TextEncoder().encode(secret);
}

function getRefreshSecret(): Uint8Array {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) {
    throw new Error("JWT_REFRESH_SECRET is not defined in environment variables.");
  }
  return new TextEncoder().encode(secret);
}

// ── Shared Helpers ──────────────────────────────────────────────────

const JWT_ISSUER = "yoodle";
const JWT_AUDIENCE = "yoodle-app";

async function signToken(
  userId: string,
  type: "access" | "refresh",
  expiry: string,
): Promise<string> {
  const secret = type === "refresh" ? getRefreshSecret() : getJwtSecret();
  return new SignJWT({ userId, type } as TokenPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiry)
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .sign(secret);
}

async function verifyToken(
  token: string,
  expectedType: "access" | "refresh",
): Promise<{ userId: string }> {
  const secret = expectedType === "refresh" ? getRefreshSecret() : getJwtSecret();
  const { payload } = await jwtVerify(token, secret, {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });

  const typedPayload = payload as TokenPayload;

  if (typedPayload.type !== expectedType) {
    throw new Error(`Invalid token type: expected ${expectedType} token.`);
  }

  if (!typedPayload.userId) {
    throw new Error("Invalid token payload: missing userId.");
  }

  return { userId: typedPayload.userId };
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Sign an access token with a 15 minute expiry.
 */
export function signAccessToken(userId: string): Promise<string> {
  return signToken(userId, "access", "15m");
}

/**
 * Sign a refresh token with a 7 day expiry.
 */
export function signRefreshToken(userId: string): Promise<string> {
  return signToken(userId, "refresh", "7d");
}

/**
 * Verify an access token and return the payload.
 * Throws if the token is invalid, expired, or not an access token.
 */
export function verifyAccessToken(
  token: string,
): Promise<{ userId: string }> {
  return verifyToken(token, "access");
}

/**
 * Verify a refresh token and return the payload.
 * Throws if the token is invalid, expired, or not a refresh token.
 */
export function verifyRefreshToken(
  token: string,
): Promise<{ userId: string }> {
  return verifyToken(token, "refresh");
}

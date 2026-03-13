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

/**
 * Sign an access token with a 15 minute expiry.
 */
export async function signAccessToken(userId: string): Promise<string> {
  const secret = getJwtSecret();

  return new SignJWT({ userId, type: "access" } as TokenPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .setIssuer("yoodle")
    .setAudience("yoodle-app")
    .sign(secret);
}

/**
 * Sign a refresh token with a 7 day expiry.
 */
export async function signRefreshToken(userId: string): Promise<string> {
  const secret = getJwtSecret();

  return new SignJWT({ userId, type: "refresh" } as TokenPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .setIssuer("yoodle")
    .setAudience("yoodle-app")
    .sign(secret);
}

/**
 * Verify an access token and return the payload.
 * Throws if the token is invalid, expired, or not an access token.
 */
export async function verifyAccessToken(
  token: string
): Promise<{ userId: string }> {
  const secret = getJwtSecret();

  const { payload } = await jwtVerify(token, secret, {
    issuer: "yoodle",
    audience: "yoodle-app",
  });

  const typedPayload = payload as TokenPayload;

  if (typedPayload.type !== "access") {
    throw new Error("Invalid token type: expected access token.");
  }

  if (!typedPayload.userId) {
    throw new Error("Invalid token payload: missing userId.");
  }

  return { userId: typedPayload.userId };
}

/**
 * Verify a refresh token and return the payload.
 * Throws if the token is invalid, expired, or not a refresh token.
 */
export async function verifyRefreshToken(
  token: string
): Promise<{ userId: string }> {
  const secret = getJwtSecret();

  const { payload } = await jwtVerify(token, secret, {
    issuer: "yoodle",
    audience: "yoodle-app",
  });

  const typedPayload = payload as TokenPayload;

  if (typedPayload.type !== "refresh") {
    throw new Error("Invalid token type: expected refresh token.");
  }

  if (!typedPayload.userId) {
    throw new Error("Invalid token payload: missing userId.");
  }

  return { userId: typedPayload.userId };
}

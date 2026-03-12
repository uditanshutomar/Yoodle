import { SignJWT, jwtVerify, type JWTPayload } from "jose";

type SessionTokenType = "realtime" | "terminal";

interface BaseServiceSessionPayload extends JWTPayload {
  userId: string;
  type: SessionTokenType;
}

interface RealtimeSessionPayload extends BaseServiceSessionPayload {
  type: "realtime";
}

interface TerminalSessionPayload extends BaseServiceSessionPayload {
  type: "terminal";
  workspaceId: string;
}

function getServiceJwtSecret(): Uint8Array {
  const secret = process.env.REALTIME_JWT_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "REALTIME_JWT_SECRET or JWT_SECRET must be configured for backend sessions.",
    );
  }
  return new TextEncoder().encode(secret);
}

async function signServiceToken(
  payload: BaseServiceSessionPayload,
  audience: string,
  expirationTime: string,
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("yoodle")
    .setAudience(audience)
    .setExpirationTime(expirationTime)
    .sign(getServiceJwtSecret());
}

async function verifyServiceToken<T extends BaseServiceSessionPayload>(
  token: string,
  audience: string,
  expectedType: SessionTokenType,
): Promise<T> {
  const { payload } = await jwtVerify(token, getServiceJwtSecret(), {
    issuer: "yoodle",
    audience,
  });

  const typedPayload = payload as T;

  if (typedPayload.type !== expectedType) {
    throw new Error(
      `Invalid backend session token type: expected ${expectedType}.`,
    );
  }

  if (!typedPayload.userId) {
    throw new Error("Invalid backend session token payload: missing userId.");
  }

  return typedPayload;
}

export async function signRealtimeSessionToken(userId: string): Promise<string> {
  return signServiceToken(
    { userId, type: "realtime" },
    "yoodle-realtime",
    "1h",
  );
}

export async function verifyRealtimeSessionToken(
  token: string,
): Promise<RealtimeSessionPayload> {
  return verifyServiceToken<RealtimeSessionPayload>(
    token,
    "yoodle-realtime",
    "realtime",
  );
}

export async function signTerminalSessionToken(
  userId: string,
  workspaceId: string,
): Promise<string> {
  return signServiceToken(
    { userId, workspaceId, type: "terminal" },
    "yoodle-terminal",
    "5m",
  );
}

export async function verifyTerminalSessionToken(
  token: string,
): Promise<TerminalSessionPayload> {
  const payload = await verifyServiceToken<TerminalSessionPayload>(
    token,
    "yoodle-terminal",
    "terminal",
  );

  if (!payload.workspaceId) {
    throw new Error(
      "Invalid backend terminal session token payload: missing workspaceId.",
    );
  }

  return payload;
}

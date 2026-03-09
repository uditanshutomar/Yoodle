import { NextRequest, NextResponse } from "next/server";
import { withHandler } from "@/lib/api/with-handler";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/auth/middleware";

/**
 * GET /api/turn-credentials
 *
 * Fetch TURN/STUN credentials for WebRTC NAT traversal.
 * Requires authentication to prevent credential abuse.
 * Tries Metered.ca first, falls back to static config with Google STUN.
 */
export const GET = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "general");
  await getUserIdFromRequest(req);

  const apiKey = process.env.NEXT_PUBLIC_METERED_API_KEY;
  const app = process.env.NEXT_PUBLIC_METERED_APP;

  if (apiKey && app) {
    const response = await fetch(
      `https://${app}/api/v1/turn/credentials?apiKey=${apiKey}`
    );

    if (response.ok) {
      const iceServers = await response.json();
      // Return raw ICE servers array for backward compatibility
      return NextResponse.json(iceServers);
    }
  }

  // Fallback: Google STUN + configured TURN server
  const fallbackServers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];

  // Use project's own TURN server (from env) or Metered fallback
  const turnUrl = process.env.TURN_SERVER_URL;
  const turnUser = process.env.TURN_USERNAME || process.env.METERED_TURN_USERNAME;
  const turnPass = process.env.TURN_CREDENTIAL || process.env.METERED_TURN_PASSWORD;

  if (turnUrl && !turnUrl.includes("localhost") && turnUser && turnPass) {
    fallbackServers.push({
      urls: turnUrl,
      username: turnUser,
      credential: turnPass,
    });
  } else if (turnUser && turnPass) {
    fallbackServers.push({
      urls: "turn:relay.metered.ca:443?transport=tcp",
      username: turnUser,
      credential: turnPass,
    });
  }

  return NextResponse.json(fallbackServers);
});

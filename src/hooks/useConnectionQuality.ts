"use client";

import { useEffect, useState } from "react";
import type { RoomTransport } from "@/lib/transport/types";

export type ConnectionQuality = "good" | "fair" | "poor" | "unknown";

interface ConnectionStats {
  quality: ConnectionQuality;
  rtt: number | null;
  packetLoss: number | null;
}

const UNKNOWN_STATS: ConnectionStats = {
  quality: "unknown",
  rtt: null,
  packetLoss: null,
};

/**
 * Derives connection quality from the LiveKit transport's connection state.
 *
 * Maps LiveKit connection states:
 * - "connected"    → good
 * - "reconnecting" → fair
 * - "connecting"   → unknown
 * - "disconnected" → poor
 */
export function useConnectionQuality(
  transport: RoomTransport | null,
): ConnectionStats {
  const [stats, setStats] = useState<ConnectionStats>(UNKNOWN_STATS);

  useEffect(() => {
    if (!transport) {
      setStats(UNKNOWN_STATS);
      return;
    }

    function mapState(): ConnectionStats {
      const state = transport!.connectionState;
      switch (state) {
        case "connected":
          return { quality: "good", rtt: null, packetLoss: null };
        case "reconnecting":
          return { quality: "fair", rtt: null, packetLoss: null };
        case "disconnected":
          return { quality: "poor", rtt: null, packetLoss: null };
        default:
          return UNKNOWN_STATS;
      }
    }

    setStats(mapState());

    transport.onConnectionStateChanged(() => {
      setStats(mapState());
    });
  }, [transport]);

  return stats;
}

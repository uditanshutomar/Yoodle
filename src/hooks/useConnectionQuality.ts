"use client";

import { useSyncExternalStore, useCallback } from "react";
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

function mapTransportState(transport: RoomTransport): ConnectionStats {
  switch (transport.connectionState) {
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
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!transport) return () => {};
      transport.onConnectionStateChanged(onStoreChange);
      // No unsubscribe available — return noop cleanup
      return () => {};
    },
    [transport],
  );

  const getSnapshot = useCallback(
    () => (transport ? mapTransportState(transport) : UNKNOWN_STATS),
    [transport],
  );

  const getServerSnapshot = useCallback(() => UNKNOWN_STATS, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

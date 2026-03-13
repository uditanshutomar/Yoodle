"use client";

import { useSyncExternalStore, useCallback, useRef } from "react";
import type { RoomTransport, ConnectionState } from "@/lib/transport/types";

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

const CONNECTED_STATS: ConnectionStats = {
  quality: "good",
  rtt: null,
  packetLoss: null,
};

const RECONNECTING_STATS: ConnectionStats = {
  quality: "fair",
  rtt: null,
  packetLoss: null,
};

const DISCONNECTED_STATS: ConnectionStats = {
  quality: "poor",
  rtt: null,
  packetLoss: null,
};

function statsForState(state: ConnectionState): ConnectionStats {
  switch (state) {
    case "connected":
      return CONNECTED_STATS;
    case "reconnecting":
      return RECONNECTING_STATS;
    case "disconnected":
      return DISCONNECTED_STATS;
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
 *
 * Snapshots are stable singleton objects so useSyncExternalStore
 * never sees a new reference unless the state actually changed.
 */
export function useConnectionQuality(
  transport: RoomTransport | null,
): ConnectionStats {
  // Cache the last snapshot so getSnapshot returns a stable reference
  const cachedRef = useRef<ConnectionStats>(UNKNOWN_STATS);
  const lastStateRef = useRef<ConnectionState | null>(null);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!transport) return () => {};
      transport.onConnectionStateChanged(onStoreChange);
      return () => {};
    },
    [transport],
  );

  const getSnapshot = useCallback(() => {
    if (!transport) return UNKNOWN_STATS;

    const state = transport.connectionState;
    if (state !== lastStateRef.current) {
      lastStateRef.current = state;
      cachedRef.current = statsForState(state);
    }
    return cachedRef.current;
  }, [transport]);

  const getServerSnapshot = useCallback(() => UNKNOWN_STATS, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

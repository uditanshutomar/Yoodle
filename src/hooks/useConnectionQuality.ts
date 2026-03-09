"use client";

import { useEffect, useRef, useState } from "react";

export type ConnectionQuality = "good" | "fair" | "poor" | "unknown";

interface ConnectionStats {
  quality: ConnectionQuality;
  rtt: number | null;
  packetLoss: number | null;
}

const POLL_INTERVAL_MS = 5_000;

const RTT_FAIR_THRESHOLD = 150;
const RTT_POOR_THRESHOLD = 400;
const PACKET_LOSS_FAIR_THRESHOLD = 2;
const PACKET_LOSS_POOR_THRESHOLD = 5;

const UNKNOWN_STATS: ConnectionStats = {
  quality: "unknown",
  rtt: null,
  packetLoss: null,
};

/**
 * Monitors WebRTC connection quality by polling RTCPeerConnection.getStats().
 * Updates every 5 seconds.
 *
 * Quality thresholds:
 * - good: RTT < 150ms, packet loss < 2%
 * - fair: RTT < 400ms, packet loss < 5%
 * - poor: everything else
 */
export function useConnectionQuality(
  peers: Map<string, { connection: RTCPeerConnection }>,
): ConnectionStats {
  const [stats, setStats] = useState<ConnectionStats>(UNKNOWN_STATS);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    async function pollStats(): Promise<void> {
      if (peers.size === 0) {
        setStats(UNKNOWN_STATS);
        return;
      }

      let totalRtt = 0;
      let totalPacketLoss = 0;
      let connectionCount = 0;

      for (const [, peer] of peers) {
        try {
          const report = await peer.connection.getStats();
          report.forEach((stat) => {
            if (
              stat.type === "candidate-pair" &&
              stat.state === "succeeded" &&
              typeof stat.currentRoundTripTime === "number"
            ) {
              totalRtt += stat.currentRoundTripTime * 1000;
              connectionCount++;
            }

            if (stat.type === "inbound-rtp" && stat.kind === "video") {
              const lost = stat.packetsLost || 0;
              const received = stat.packetsReceived || 0;
              const total = lost + received;
              if (total > 0) {
                totalPacketLoss += (lost / total) * 100;
              }
            }
          });
        } catch {
          // Stats not available for this peer
        }
      }

      if (connectionCount === 0) {
        setStats(UNKNOWN_STATS);
        return;
      }

      const avgRtt = totalRtt / connectionCount;
      const avgPacketLoss = totalPacketLoss / connectionCount;

      let quality: ConnectionQuality;
      if (
        avgRtt > RTT_POOR_THRESHOLD ||
        avgPacketLoss > PACKET_LOSS_POOR_THRESHOLD
      ) {
        quality = "poor";
      } else if (
        avgRtt > RTT_FAIR_THRESHOLD ||
        avgPacketLoss > PACKET_LOSS_FAIR_THRESHOLD
      ) {
        quality = "fair";
      } else {
        quality = "good";
      }

      setStats({
        quality,
        rtt: Math.round(avgRtt),
        packetLoss: Math.round(avgPacketLoss * 10) / 10,
      });
    }

    pollStats();
    intervalRef.current = setInterval(pollStats, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [peers]);

  return stats;
}

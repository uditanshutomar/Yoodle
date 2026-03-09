"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type {
  RoomTransport,
  TransportRoomUser,
  ConnectionState,
} from "@/lib/transport/types";
import type { TransportMode } from "@/lib/transport/transport-factory";

interface UseTransportOptions {
  meetingId: string;
  mode: TransportMode;
  localStream: MediaStream | null;
  user: TransportRoomUser;
  enabled: boolean;
}

interface UseTransportReturn {
  transport: RoomTransport | null;
  connectionState: ConnectionState;
  remoteStreams: Map<string, MediaStream>;
  remoteParticipants: TransportRoomUser[];
  participantCount: number;
  error: string | null;
}

/**
 * React hook that manages the LiveKit transport lifecycle.
 *
 * For "p2p" mode, returns null transport — the room page handles P2P
 * signaling directly via Socket.io.
 *
 * For "livekit" mode, fetches a token from `/api/livekit/token`,
 * creates a LiveKitTransport, joins the room, and manages remote
 * participants + streams.
 */
export function useTransport({
  meetingId,
  mode,
  localStream,
  user,
  enabled,
}: UseTransportOptions): UseTransportReturn {
  const [transport, setTransport] = useState<RoomTransport | null>(null);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("disconnected");
  const [remoteStreams, setRemoteStreams] = useState<
    Map<string, MediaStream>
  >(new Map());
  const [remoteParticipants, setRemoteParticipants] = useState<
    TransportRoomUser[]
  >([]);
  const [participantCount, setParticipantCount] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const transportRef = useRef<RoomTransport | null>(null);

  const updateRemoteState = useCallback((t: RoomTransport) => {
    setRemoteStreams(new Map(t.getRemoteStreams()));
    setParticipantCount(t.participantCount);
    setConnectionState(t.connectionState);
  }, []);

  useEffect(() => {
    if (mode !== "livekit" || !enabled || !localStream) return;

    let cancelled = false;

    async function init() {
      try {
        // 1. Fetch LiveKit token from our API
        const res = await fetch("/api/livekit/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            roomId: meetingId,
            identity: user.id,
            name: user.name,
          }),
        });

        if (!res.ok) {
          throw new Error("Failed to obtain LiveKit token");
        }

        const { data } = await res.json();
        const livekitUrl =
          process.env.NEXT_PUBLIC_LIVEKIT_URL ||
          "";

        if (!livekitUrl) {
          throw new Error("NEXT_PUBLIC_LIVEKIT_URL not configured");
        }

        if (cancelled) return;

        // 2. Create transport via dynamic import
        const { createLiveKitTransport } = await import(
          "@/lib/transport/transport-factory"
        );
        const t = await createLiveKitTransport(livekitUrl, data.token);

        if (cancelled) {
          t.leave();
          return;
        }

        // 3. Wire up callbacks
        t.onParticipantJoined((joined) => {
          setRemoteParticipants((prev) => [...prev, joined]);
          updateRemoteState(t);
        });

        t.onParticipantLeft((leftId) => {
          setRemoteParticipants((prev) =>
            prev.filter((p) => p.id !== leftId),
          );
          updateRemoteState(t);
        });

        t.onStreamUpdated(() => {
          updateRemoteState(t);
        });

        // 4. Join the room
        await t.join(meetingId, localStream!, user);

        if (cancelled) {
          t.leave();
          return;
        }

        transportRef.current = t;
        setTransport(t);
        updateRemoteState(t);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Transport error",
          );
        }
      }
    }

    void init();

    return () => {
      cancelled = true;
      if (transportRef.current) {
        transportRef.current.leave();
        transportRef.current = null;
        setTransport(null);
        setConnectionState("disconnected");
      }
    };
  }, [mode, enabled, localStream, meetingId, user.id, user.name, user.avatar, updateRemoteState]);

  // For P2P mode, return null transport — the room page handles it
  if (mode === "p2p") {
    return {
      transport: null,
      connectionState: "disconnected",
      remoteStreams: new Map(),
      remoteParticipants: [],
      participantCount: 1,
      error: null,
    };
  }

  return {
    transport,
    connectionState,
    remoteStreams,
    remoteParticipants,
    participantCount,
    error,
  };
}

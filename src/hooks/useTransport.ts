"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import type { Room } from "livekit-client";
import type {
  RoomTransport,
  TransportRoomUser,
  ConnectionState,
} from "@/lib/transport/types";

interface UseTransportOptions {
  meetingId: string;
  localStream: MediaStream | null;
  user: TransportRoomUser;
  enabled: boolean;
}

interface UseTransportReturn {
  transport: RoomTransport | null;
  room: Room | null;
  connectionState: ConnectionState;
  remoteStreams: Map<string, MediaStream>;
  remoteParticipants: TransportRoomUser[];
  participantCount: number;
  error: string | null;
}

/**
 * React hook that manages the LiveKit transport lifecycle.
 *
 * All calls route through LiveKit SFU. The hook separates
 * connection init from track replacement so toggling audio/video
 * does NOT teardown + reconnect.
 */
export function useTransport({
  meetingId,
  localStream,
  user,
  enabled,
}: UseTransportOptions): UseTransportReturn {
  const {
    id: userId,
    name: userName,
    avatar: userAvatar,
    isAudioEnabled: userAudioEnabled,
    isVideoEnabled: userVideoEnabled,
    isScreenSharing: userScreenSharing,
  } = user;
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

  // ── Effect 1: Init LiveKit connection (runs once per meeting) ────
  useEffect(() => {
    if (!enabled || !localStream) return;

    let cancelled = false;

    async function init() {
      try {
        const res = await fetch("/api/livekit/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            roomId: meetingId,
            identity: userId,
            name: userName,
          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            (body as { error?: string }).error || "Failed to obtain LiveKit token",
          );
        }

        const { data } = await res.json();
        const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL || "";

        if (!livekitUrl) {
          throw new Error("NEXT_PUBLIC_LIVEKIT_URL not configured");
        }

        if (cancelled) return;

        const { createLiveKitTransport } = await import(
          "@/lib/transport/transport-factory"
        );
        const t = await createLiveKitTransport(livekitUrl, data.token);

        if (cancelled) {
          t.leave();
          return;
        }

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

        t.onParticipantUpdated((updated) => {
          setRemoteParticipants((prev) =>
            prev.map((p) => (p.id === updated.id ? updated : p)),
          );
        });

        t.onConnectionStateChanged((state) => {
          setConnectionState(state);
        });

        await t.join(meetingId, localStream!, {
          id: userId,
          name: userName,
          avatar: userAvatar,
          isAudioEnabled: userAudioEnabled,
          isVideoEnabled: userVideoEnabled,
          isScreenSharing: userScreenSharing,
        });

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
    // NOTE: Only re-run on meetingId/userId/enabled/localStream identity.
    // Audio/video toggles are handled by Effect 2 via replaceTrack().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId, userId, enabled, localStream]);

  // ── Effect 2: Track replacement on audio/video toggle ────────────
  useEffect(() => {
    const t = transportRef.current;
    if (!t || !localStream) return;

    const audioTrack = localStream.getAudioTracks()[0];
    const videoTrack = localStream.getVideoTracks()[0];

    if (audioTrack) {
      t.replaceTrack("audio", audioTrack).catch((err) => {
        console.warn("Failed to replace audio track:", err);
      });
    }
    if (videoTrack) {
      t.replaceTrack("video", videoTrack).catch((err) => {
        console.warn("Failed to replace video track:", err);
      });
    }
  }, [localStream, userAudioEnabled, userVideoEnabled]);

  const room = useMemo(() => {
    if (!transport) return null;
    return transport.getRoom() as Room | null;
  }, [transport]);

  return {
    transport,
    room,
    connectionState,
    remoteStreams,
    remoteParticipants,
    participantCount,
    error,
  };
}

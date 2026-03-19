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
  screenShareStreams: Map<string, MediaStream>;
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
  const [screenShareStreams, setScreenShareStreams] = useState<
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
    setScreenShareStreams(new Map(t.getScreenShareStreams()));
    setParticipantCount(t.participantCount);
    setConnectionState(t.connectionState);
  }, []);

  // ── Effect 1: Init LiveKit connection (runs once per meeting) ────
  useEffect(() => {
    if (!enabled || !localStream) return;

    let cancelled = false;
    let lateTrackTimer: ReturnType<typeof setTimeout> | undefined;
    const abortController = new AbortController();

    async function init() {
      try {
        const res = await fetch("/api/livekit/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          signal: abortController.signal,
          body: JSON.stringify({
            roomId: meetingId,
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

        // Sync participants already in the room when we joined.
        // ParticipantConnected events may fire during connect(), but
        // we do an explicit sync here to guarantee we never miss anyone.
        setRemoteParticipants(t.getRemoteParticipants());
        updateRemoteState(t);

        // Track subscriptions can finalise after connect() resolves.
        // Do a second sync shortly after to pick up any late tracks.
        lateTrackTimer = setTimeout(() => {
          if (!cancelled) {
            setRemoteParticipants(t.getRemoteParticipants());
            updateRemoteState(t);
          }
        }, 1000);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
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
      abortController.abort();
      clearTimeout(lateTrackTimer);
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

  // ── Effect 2: Track replacement on stream change (device switch) ──
  useEffect(() => {
    const t = transportRef.current;
    if (!t || !localStream) return;

    const audioTrack = localStream.getAudioTracks()[0];
    const videoTrack = localStream.getVideoTracks()[0];

    if (audioTrack) {
      t.replaceTrack("audio", audioTrack).catch((err) => {
        console.error("[useTransport] Failed to replace audio track:", err);
        setError("Failed to switch audio device. Try selecting the device again.");
      });
    }
    if (videoTrack) {
      t.replaceTrack("video", videoTrack).catch((err) => {
        console.error("[useTransport] Failed to replace video track:", err);
        setError("Failed to switch video device. Try selecting the device again.");
      });
    }
  }, [localStream]);

  // ── Effect 3: Sync mute/unmute with LiveKit SFU ─────────────────
  // Uses publication-level mute/unmute instead of setCameraEnabled /
  // setMicrophoneEnabled which can stop & re-acquire tracks, conflicting
  // with our manually-managed localStream.
  useEffect(() => {
    const t = transportRef.current;
    if (!t) return;
    t.muteTrack("audio", !userAudioEnabled).catch((err) => {
      // PRIVACY: mute failures must be surfaced — if mute fails, the user
      // thinks they're muted but audio is still being sent to all participants.
      console.error("[useTransport] Failed to sync audio mute state:", err);
      setError(`Audio ${!userAudioEnabled ? "mute" : "unmute"} failed — your mic may still be ${userAudioEnabled ? "muted" : "live"}`);
    });
  }, [userAudioEnabled]);

  useEffect(() => {
    const t = transportRef.current;
    if (!t) return;
    t.muteTrack("video", !userVideoEnabled).catch((err) => {
      console.error("[useTransport] Failed to sync video mute state:", err);
      setError(`Video ${!userVideoEnabled ? "mute" : "unmute"} failed`);
    });
  }, [userVideoEnabled]);

  const room = useMemo(() => {
    if (!transport) return null;
    return transport.getRoom() as Room | null;
  }, [transport]);

  return {
    transport,
    room,
    connectionState,
    remoteStreams,
    screenShareStreams,
    remoteParticipants,
    participantCount,
    error,
  };
}

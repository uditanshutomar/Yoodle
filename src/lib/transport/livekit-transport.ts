"use client";

import {
  Room,
  RoomEvent,
  Track,
  ConnectionState as LKConnectionState,
  Participant,
  RemoteParticipant,
  RemoteTrackPublication,
  TrackPublication,
  LocalTrackPublication,
  type RemoteTrack,
} from "livekit-client";
import type {
  RoomTransport,
  TransportRoomUser,
  ConnectionState,
} from "./types";

// ── Helpers ─────────────────────────────────────────────────────────────

function mapConnectionState(lk: LKConnectionState): ConnectionState {
  switch (lk) {
    case LKConnectionState.Connected:
      return "connected";
    case LKConnectionState.Reconnecting:
      return "reconnecting";
    case LKConnectionState.Disconnected:
      return "disconnected";
    default:
      return "connecting";
  }
}

/**
 * Build a MediaStream containing only camera + microphone tracks
 * (excludes screen share tracks so they don't leak into participant bubbles).
 */
function buildStreamForParticipant(p: RemoteParticipant): MediaStream {
  const stream = new MediaStream();
  for (const pub of p.trackPublications.values()) {
    if (
      pub.track?.mediaStreamTrack &&
      pub.source !== Track.Source.ScreenShare &&
      pub.source !== Track.Source.ScreenShareAudio
    ) {
      stream.addTrack(pub.track.mediaStreamTrack);
    }
  }
  return stream;
}

/**
 * Build a MediaStream containing only screen share tracks for a participant.
 */
function buildScreenShareStream(p: RemoteParticipant): MediaStream | null {
  const stream = new MediaStream();
  for (const pub of p.trackPublications.values()) {
    if (
      pub.track?.mediaStreamTrack &&
      (pub.source === Track.Source.ScreenShare ||
        pub.source === Track.Source.ScreenShareAudio)
    ) {
      stream.addTrack(pub.track.mediaStreamTrack);
    }
  }
  return stream.getTracks().length > 0 ? stream : null;
}

function safeParseMetadata(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch (err) {
    console.warn("[livekit-transport] Failed to parse participant metadata:", err);
    return {};
  }
}

function participantToUser(p: RemoteParticipant): TransportRoomUser {
  const meta = safeParseMetadata(p.metadata);
  return {
    id: p.identity,
    name: (meta.name as string) || p.identity,
    avatar: (meta.avatar as string) || undefined,
    isAudioEnabled: p.isMicrophoneEnabled,
    isVideoEnabled: p.isCameraEnabled,
    isScreenSharing: p.isScreenShareEnabled,
  };
}

// ── LiveKit transport ───────────────────────────────────────────────────

export class LiveKitTransport implements RoomTransport {
  private room: Room;
  private livekitUrl: string;
  private token: string;

  private joinedCallbacks: ((user: TransportRoomUser) => void)[] = [];
  private leftCallbacks: ((userId: string) => void)[] = [];
  private streamCallbacks: ((userId: string, stream: MediaStream) => void)[] =
    [];
  private connectionStateCallbacks: ((state: ConnectionState) => void)[] = [];
  private participantUpdatedCallbacks: ((user: TransportRoomUser) => void)[] =
    [];

  participantCount = 1;
  connectionState: ConnectionState = "disconnected";

  private intentionalDisconnect = false;

  constructor(livekitUrl: string, token: string) {
    this.livekitUrl = livekitUrl;
    this.token = token;
    this.room = new Room({
      adaptiveStream: true,
      dynacast: true,
      reconnectPolicy: {
        nextRetryDelayInMs: (context) => {
          const MAX_ATTEMPTS = 5;
          // Exponential backoff: 1s, 2s, 4s, 8s, 16s (capped at 16s)
          if (context.retryCount >= MAX_ATTEMPTS) return null; // stop retrying
          return Math.min(1000 * Math.pow(2, context.retryCount), 16_000);
        },
      },
    });

    this.attachRoomListeners();
  }

  // ── RoomTransport interface ─────────────────────────────────────────

  async join(
    _roomId: string,
    localStream: MediaStream,
    user: TransportRoomUser,
  ): Promise<void> {
    this.intentionalDisconnect = false;
    this.connectionState = "connecting";

    try {
      await this.room.connect(this.livekitUrl, this.token, {
        autoSubscribe: true,
      });

      // Set metadata so other participants can read our display info
      await this.room.localParticipant.setMetadata(
        JSON.stringify({ name: user.name, avatar: user.avatar }),
      );

      // Publish local tracks from the provided MediaStream
      for (const track of localStream.getTracks()) {
        const isVideo = track.kind === "video";
        await this.room.localParticipant.publishTrack(track, {
          name: isVideo ? "camera" : "microphone",
          source: isVideo ? Track.Source.Camera : Track.Source.Microphone,
        });
      }

      this.connectionState = "connected";
      this.updateParticipantCount();
    } catch (err) {
      try { await this.room.disconnect(); } catch { /* best-effort cleanup */ }
      this.connectionState = "disconnected";
      throw err;
    }
  }

  leave(): void {
    this.intentionalDisconnect = true;
    // Full teardown: remove SDK listeners to allow GC, then disconnect.
    // This instance is never re-joined — callers create a new LiveKitTransport.
    this.room.removeAllListeners();
    this.room.disconnect();
    this.connectionState = "disconnected";
    this.participantCount = 0;
    // Clear our own callback arrays to release references
    this.joinedCallbacks = [];
    this.leftCallbacks = [];
    this.streamCallbacks = [];
    this.connectionStateCallbacks = [];
    this.participantUpdatedCallbacks = [];
  }

  getRemoteStreams(): Map<string, MediaStream> {
    const streams = new Map<string, MediaStream>();
    for (const p of this.room.remoteParticipants.values()) {
      streams.set(p.identity, buildStreamForParticipant(p));
    }
    return streams;
  }

  getScreenShareStreams(): Map<string, MediaStream> {
    const streams = new Map<string, MediaStream>();
    for (const p of this.room.remoteParticipants.values()) {
      const ss = buildScreenShareStream(p);
      if (ss) streams.set(p.identity, ss);
    }
    return streams;
  }

  getRemoteParticipants(): TransportRoomUser[] {
    return Array.from(this.room.remoteParticipants.values()).map(
      participantToUser,
    );
  }

  async replaceTrack(
    kind: "video" | "audio",
    track: MediaStreamTrack,
  ): Promise<void> {
    const local = this.room.localParticipant;
    const source =
      kind === "video" ? Track.Source.Camera : Track.Source.Microphone;

    // Find existing publication for this source
    let existingPub: LocalTrackPublication | undefined;
    for (const pub of local.trackPublications.values()) {
      if (pub.source === source) {
        existingPub = pub;
        break;
      }
    }

    if (existingPub?.track) {
      // Replace the underlying MediaStreamTrack
      await existingPub.track.replaceTrack(track);
    } else {
      // No existing publication — publish fresh
      await local.publishTrack(track, {
        name: kind === "video" ? "camera" : "microphone",
        source,
      });
    }
  }

  async muteTrack(
    kind: "video" | "audio",
    muted: boolean,
  ): Promise<void> {
    const source =
      kind === "video" ? Track.Source.Camera : Track.Source.Microphone;
    const pub = this.room.localParticipant.getTrackPublication(source);
    if (!pub) return;

    if (muted) {
      // For audio: mute the publication so the SFU stops forwarding audio.
      // For video: only toggle the MediaStreamTrack — LiveKit's video mute()
      // stops the camera hardware and re-acquires on unmute, which would
      // conflict with our manually-managed localStream track.
      if (kind === "audio") {
        await pub.mute();
      } else {
        if (pub.track?.mediaStreamTrack) {
          pub.track.mediaStreamTrack.enabled = false;
        }
      }
    } else {
      if (kind === "audio") {
        await pub.unmute();
      } else {
        if (pub.track?.mediaStreamTrack) {
          pub.track.mediaStreamTrack.enabled = true;
        }
      }
    }
  }

  async startScreenShare(stream: MediaStream): Promise<void> {
    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) {
      throw new Error("Cannot start screen share: provided MediaStream has no video track.");
    }
    await this.room.localParticipant.publishTrack(videoTrack, {
      name: "screen",
      source: Track.Source.ScreenShare,
    });
    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      await this.room.localParticipant.publishTrack(audioTrack, {
        name: "screen-audio",
        source: Track.Source.ScreenShareAudio,
      });
    }
  }

  async stopScreenShare(): Promise<void> {
    const local = this.room.localParticipant;
    // Collect pubs first to avoid mutating the map during iteration
    const screenPubs = Array.from(local.trackPublications.values()).filter(
      (pub) =>
        pub.source === Track.Source.ScreenShare ||
        pub.source === Track.Source.ScreenShareAudio,
    );
    for (const pub of screenPubs) {
      if (pub.track) {
        await local.unpublishTrack(pub.track);
      }
    }
  }

  onParticipantJoined = (cb: (user: TransportRoomUser) => void): (() => void) => {
    this.joinedCallbacks.push(cb);
    return () => {
      this.joinedCallbacks = this.joinedCallbacks.filter((c) => c !== cb);
    };
  };

  onParticipantLeft = (cb: (userId: string) => void): (() => void) => {
    this.leftCallbacks.push(cb);
    return () => {
      this.leftCallbacks = this.leftCallbacks.filter((c) => c !== cb);
    };
  };

  onStreamUpdated = (
    cb: (userId: string, stream: MediaStream) => void,
  ): (() => void) => {
    this.streamCallbacks.push(cb);
    return () => {
      this.streamCallbacks = this.streamCallbacks.filter((c) => c !== cb);
    };
  };

  onParticipantUpdated = (cb: (user: TransportRoomUser) => void): (() => void) => {
    this.participantUpdatedCallbacks.push(cb);
    return () => {
      this.participantUpdatedCallbacks = this.participantUpdatedCallbacks.filter((c) => c !== cb);
    };
  };

  onConnectionStateChanged = (cb: (state: ConnectionState) => void): (() => void) => {
    this.connectionStateCallbacks.push(cb);
    return () => {
      this.connectionStateCallbacks = this.connectionStateCallbacks.filter((c) => c !== cb);
    };
  };

  getRoom(): Room {
    return this.room;
  }

  // ── Internal ────────────────────────────────────────────────────────

  /** Invoke each callback in isolation so one failure doesn't break others. */
  private safeInvoke<T extends unknown[]>(
    callbacks: ((...args: T) => void)[],
    ...args: T
  ): void {
    for (const cb of callbacks) {
      try {
        cb(...args);
      } catch (err) {
        console.error("[livekit-transport] Error in event callback:", err);
      }
    }
  }

  private updateParticipantCount(): void {
    this.participantCount = this.room.remoteParticipants.size + 1;
  }

  private attachRoomListeners(): void {
    this.room
      .on(RoomEvent.ConnectionStateChanged, (state: LKConnectionState) => {
        const mapped = mapConnectionState(state);
        this.connectionState = mapped;

        if (state === LKConnectionState.Reconnecting) {
          console.log("[livekit-transport] Reconnecting…");
        } else if (
          state === LKConnectionState.Disconnected &&
          !this.intentionalDisconnect
        ) {
          console.warn("[livekit-transport] Unexpected disconnect");
        }

        this.safeInvoke(this.connectionStateCallbacks, this.connectionState);
      })
      .on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
        this.updateParticipantCount();
        const user = participantToUser(p);
        this.safeInvoke(this.joinedCallbacks, user);
      })
      .on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
        this.updateParticipantCount();
        this.safeInvoke(this.leftCallbacks, p.identity);
      })
      .on(
        RoomEvent.TrackSubscribed,
        (
          _track: RemoteTrack,
          _pub: RemoteTrackPublication,
          participant: RemoteParticipant,
        ) => {
          const stream = buildStreamForParticipant(participant);
          this.safeInvoke(this.streamCallbacks, participant.identity, stream);
          // Also update participant media state (camera/mic enabled flags)
          const user = participantToUser(participant);
          this.safeInvoke(this.participantUpdatedCallbacks, user);
        },
      )
      .on(
        RoomEvent.TrackUnsubscribed,
        (
          _track: RemoteTrack,
          _pub: RemoteTrackPublication,
          participant: RemoteParticipant,
        ) => {
          const stream = buildStreamForParticipant(participant);
          this.safeInvoke(this.streamCallbacks, participant.identity, stream);
          // Update participant media state (e.g. isScreenSharing → false)
          const user = participantToUser(participant);
          this.safeInvoke(this.participantUpdatedCallbacks, user);
        },
      )
      .on(
        RoomEvent.TrackMuted,
        (_pub: TrackPublication, participant: Participant) => {
          if (participant instanceof RemoteParticipant) {
            const user = participantToUser(participant);
            this.safeInvoke(this.participantUpdatedCallbacks, user);
          }
        },
      )
      .on(
        RoomEvent.TrackUnmuted,
        (_pub: TrackPublication, participant: Participant) => {
          if (participant instanceof RemoteParticipant) {
            const user = participantToUser(participant);
            this.safeInvoke(this.participantUpdatedCallbacks, user);
          }
        },
      )
      .on(RoomEvent.ConnectionQualityChanged, () => {
        // Fire connection state change so UI can react; no need to
        // rebuild every remote stream on quality change.
        this.safeInvoke(this.connectionStateCallbacks, this.connectionState);
      });
  }
}

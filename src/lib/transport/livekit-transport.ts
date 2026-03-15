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

function participantToUser(p: RemoteParticipant): TransportRoomUser {
  const meta = JSON.parse(p.metadata || "{}") as Record<string, unknown>;
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

  constructor(livekitUrl: string, token: string) {
    this.livekitUrl = livekitUrl;
    this.token = token;
    this.room = new Room({
      adaptiveStream: true,
      dynacast: true,
    });

    this.attachRoomListeners();
  }

  // ── RoomTransport interface ─────────────────────────────────────────

  async join(
    _roomId: string,
    localStream: MediaStream,
    user: TransportRoomUser,
  ): Promise<void> {
    this.connectionState = "connecting";

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
  }

  leave(): void {
    this.room.disconnect();
    this.connectionState = "disconnected";
    this.participantCount = 0;
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
    if (videoTrack) {
      await this.room.localParticipant.publishTrack(videoTrack, {
        name: "screen",
        source: Track.Source.ScreenShare,
      });
    }
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
        await local.unpublishTrack(pub.track.mediaStreamTrack);
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

  private updateParticipantCount(): void {
    this.participantCount = this.room.remoteParticipants.size + 1;
  }

  private attachRoomListeners(): void {
    this.room
      .on(RoomEvent.ConnectionStateChanged, (state: LKConnectionState) => {
        this.connectionState = mapConnectionState(state);
        this.connectionStateCallbacks.forEach((cb) => cb(this.connectionState));
      })
      .on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
        this.updateParticipantCount();
        const user = participantToUser(p);
        this.joinedCallbacks.forEach((cb) => cb(user));
      })
      .on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
        this.updateParticipantCount();
        this.leftCallbacks.forEach((cb) => cb(p.identity));
      })
      .on(
        RoomEvent.TrackSubscribed,
        (
          _track: RemoteTrack,
          _pub: RemoteTrackPublication,
          participant: RemoteParticipant,
        ) => {
          const stream = buildStreamForParticipant(participant);
          this.streamCallbacks.forEach((cb) =>
            cb(participant.identity, stream),
          );
          // Also update participant media state (camera/mic enabled flags)
          const user = participantToUser(participant);
          this.participantUpdatedCallbacks.forEach((cb) => cb(user));
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
          this.streamCallbacks.forEach((cb) =>
            cb(participant.identity, stream),
          );
          // Update participant media state (e.g. isScreenSharing → false)
          const user = participantToUser(participant);
          this.participantUpdatedCallbacks.forEach((cb) => cb(user));
        },
      )
      .on(
        RoomEvent.TrackMuted,
        (_pub: TrackPublication, participant: Participant) => {
          if (participant instanceof RemoteParticipant) {
            const user = participantToUser(participant);
            this.participantUpdatedCallbacks.forEach((cb) => cb(user));
          }
        },
      )
      .on(
        RoomEvent.TrackUnmuted,
        (_pub: TrackPublication, participant: Participant) => {
          if (participant instanceof RemoteParticipant) {
            const user = participantToUser(participant);
            this.participantUpdatedCallbacks.forEach((cb) => cb(user));
          }
        },
      )
      .on(RoomEvent.ConnectionQualityChanged, () => {
        // Fire connection state change so UI can react; no need to
        // rebuild every remote stream on quality change.
        this.connectionStateCallbacks.forEach((cb) => cb(this.connectionState));
      });
  }
}

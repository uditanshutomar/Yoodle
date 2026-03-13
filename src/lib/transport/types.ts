/**
 * Transport abstraction layer for Yoodle room connections.
 *
 * All calls route through LiveKit SFU via LiveKitTransport.
 */

export interface TransportRoomUser {
  id: string;
  name: string;
  avatar?: string;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isScreenSharing: boolean;
  isHandRaised?: boolean;
}

export type ConnectionState =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

export interface RoomTransport {
  /** Join a room with a local media stream and user metadata. */
  join(
    roomId: string,
    localStream: MediaStream,
    user: TransportRoomUser
  ): Promise<void>;

  /** Leave the room and tear down all connections. */
  leave(): void;

  /** Get a snapshot of every remote participant's MediaStream, keyed by userId. */
  getRemoteStreams(): Map<string, MediaStream>;

  /** Hot-swap a local track (e.g. when switching camera or starting screen share). */
  replaceTrack(
    kind: "video" | "audio",
    track: MediaStreamTrack
  ): Promise<void>;

  /** Begin sharing a screen stream with all peers. */
  startScreenShare(stream: MediaStream): Promise<void>;

  /** Stop sharing and revert to camera track. */
  stopScreenShare(): Promise<void>;

  /** Subscribe to a new participant joining the room. */
  onParticipantJoined: (cb: (user: TransportRoomUser) => void) => void;

  /** Subscribe to a participant leaving the room. */
  onParticipantLeft: (cb: (userId: string) => void) => void;

  /** Subscribe to a remote stream being added or updated. */
  onStreamUpdated: (
    cb: (userId: string, stream: MediaStream) => void
  ) => void;

  /** Subscribe to connection state changes. */
  onConnectionStateChanged: (cb: (state: ConnectionState) => void) => void;

  /** Current number of participants (including local). */
  participantCount: number;

  /** Observable connection state. */
  connectionState: ConnectionState;
}

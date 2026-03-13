export interface RoomJoinSession {
  roomId: string;
  hostUserId: string;
  transportMode: "livekit";
  joinDisposition: "joined" | "waiting";
  waitingRoomEnabled: boolean;
  media: {
    audioEnabled: boolean;
    videoEnabled: boolean;
    audioDeviceId?: string;
    videoDeviceId?: string;
  };
  permissions: {
    allowRecording: boolean;
    allowScreenShare: boolean;
  };
}

function getStorageKey(meetingId: string): string {
  return `yoodle-room-session:${meetingId}`;
}

export function saveRoomJoinSession(
  meetingId: string,
  session: RoomJoinSession,
): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(getStorageKey(meetingId), JSON.stringify(session));
}

export function loadRoomJoinSession(
  meetingId: string,
): RoomJoinSession | null {
  if (typeof window === "undefined") return null;

  const raw = sessionStorage.getItem(getStorageKey(meetingId));
  if (!raw) return null;

  try {
    return JSON.parse(raw) as RoomJoinSession;
  } catch {
    sessionStorage.removeItem(getStorageKey(meetingId));
    return null;
  }
}

export function clearRoomJoinSession(meetingId: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(getStorageKey(meetingId));
}

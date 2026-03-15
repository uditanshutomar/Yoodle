import type { Participant } from "./ParticipantBubble";

/**
 * Participant data from the room page, compatible with LiveKit transport users.
 */
export interface RoomParticipant {
  id: string;
  name: string;
  displayName: string;
  avatar?: string | null;
  isVideoEnabled: boolean;
  isAudioEnabled: boolean;
  isScreenSharing: boolean;
  isHandRaised?: boolean;
}

/**
 * Bridge between RoomParticipant and yoodle-I's Participant interface.
 * Maps field names and adds stream/speaking data.
 */
export function toParticipant(
    roomUser: RoomParticipant,
    opts: {
        isSpeaking: boolean;
        stream?: MediaStream | null;
    }
): Participant {
    return {
        id: roomUser.id,
        name: roomUser.displayName || roomUser.name,
        avatar: roomUser.avatar || "/yoodle-logo.png",
        isMuted: !roomUser.isAudioEnabled,
        isSpeaking: opts.isSpeaking,
        stream: opts.stream || null,
        isVideoOff: !roomUser.isVideoEnabled,
        isHandRaised: roomUser.isHandRaised ?? false,
    };
}

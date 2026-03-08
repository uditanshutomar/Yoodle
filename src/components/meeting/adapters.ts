import type { RoomUser } from "@/lib/realtime/socket-events";
import type { Participant } from "./ParticipantBubble";

/**
 * Bridge between main's RoomUser and yoodle-I's Participant interface.
 * Maps field names and adds stream/speaking data.
 */
export function toParticipant(
    roomUser: RoomUser,
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
    };
}

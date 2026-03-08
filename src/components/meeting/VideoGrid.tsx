"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";
import VideoTile from "./VideoTile";
import type { RoomUser } from "@/lib/realtime/socket-events";

export type ParticipantInfo = RoomUser;

interface VideoGridProps {
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  participants: ParticipantInfo[];
  speakingPeers: Set<string>;
  audioLevels: Map<string, number>;
  localUser: {
    id: string;
    name: string;
    displayName?: string;
    avatar?: string;
  };
  isLocalMuted: boolean;
  isLocalVideoOff: boolean;
}

/** Doodle squiggles for the grid background */
function GridDecorations() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Scattered doodle elements */}
      <svg
        className="absolute top-8 left-8 opacity-20"
        width="40"
        height="40"
        viewBox="0 0 40 40"
      >
        <circle cx="20" cy="20" r="3" fill="#FFE600" />
        <circle cx="10" cy="10" r="2" fill="#FF6B6B" />
        <circle cx="30" cy="30" r="2" fill="#06B6D4" />
      </svg>
      <svg
        className="absolute bottom-20 right-12 opacity-20"
        width="50"
        height="50"
        viewBox="0 0 50 50"
      >
        <path
          d="M10 25 Q20 10 30 25 Q40 40 50 25"
          fill="none"
          stroke="#8B5CF6"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      <svg
        className="absolute top-1/3 right-1/4 opacity-15"
        width="30"
        height="30"
        viewBox="0 0 30 30"
      >
        <line
          x1="5"
          y1="15"
          x2="25"
          y2="15"
          stroke="#FFE600"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <line
          x1="15"
          y1="5"
          x2="15"
          y2="25"
          stroke="#FFE600"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

export default function VideoGrid({
  localStream,
  remoteStreams,
  participants,
  speakingPeers,
  audioLevels,
  localUser,
  isLocalMuted,
  isLocalVideoOff,
}: VideoGridProps) {
  // Build list of all tiles: local user first, then remote participants
  const allParticipants = useMemo(() => {
    const remote = participants.filter((p) => p.id !== localUser.id);
    return [
      {
        id: localUser.id,
        name: localUser.name,
        displayName: localUser.displayName || localUser.name,
        avatar: localUser.avatar,
        isLocal: true,
        stream: localStream,
        isMuted: isLocalMuted,
        isVideoOff: isLocalVideoOff,
      },
      ...remote.map((p) => ({
        id: p.id,
        name: p.name,
        displayName: p.displayName,
        avatar: p.avatar || undefined,
        isLocal: false,
        stream: remoteStreams.get(p.id) || null,
        isMuted: !p.isAudioEnabled,
        isVideoOff: !p.isVideoEnabled,
      })),
    ];
  }, [
    participants,
    localUser,
    localStream,
    remoteStreams,
    isLocalMuted,
    isLocalVideoOff,
  ]);

  const count = allParticipants.length;

  // Find active speaker (highest audio level)
  const activeSpeakerId = useMemo(() => {
    let maxLevel = 0;
    let maxId = "";
    audioLevels.forEach((level, id) => {
      if (level > maxLevel && speakingPeers.has(id)) {
        maxLevel = level;
        maxId = id;
      }
    });
    return maxId;
  }, [audioLevels, speakingPeers]);

  // Determine tile size and layout positions based on participant count
  const layout = useMemo(() => {
    if (count === 1) {
      return {
        positions: [{ x: 0, y: 0, size: "lg" as const }],
        containerClass: "flex items-center justify-center",
      };
    }

    if (count === 2) {
      return {
        positions: [
          { x: -80, y: 0, size: "lg" as const },
          { x: 80, y: 0, size: "lg" as const },
        ],
        containerClass: "flex items-center justify-center gap-12",
      };
    }

    if (count === 3) {
      return {
        positions: [
          { x: 0, y: -50, size: "lg" as const },
          { x: -90, y: 60, size: "md" as const },
          { x: 90, y: 60, size: "md" as const },
        ],
        containerClass: "relative",
      };
    }

    if (count === 4) {
      return {
        positions: [
          { x: -80, y: -60, size: "md" as const },
          { x: 80, y: -60, size: "md" as const },
          { x: -80, y: 80, size: "md" as const },
          { x: 80, y: 80, size: "md" as const },
        ],
        containerClass: "relative",
      };
    }

    // 5+ participants: speaker in center, others orbit around
    const positions: { x: number; y: number; size: "sm" | "md" | "lg" }[] = [];

    // Find speaker index
    const speakerIdx = allParticipants.findIndex(
      (p) => p.id === activeSpeakerId
    );
    const actualSpeakerIdx = speakerIdx >= 0 ? speakerIdx : 0;

    // Center position for speaker
    positions.push({ x: 0, y: 0, size: "lg" });

    // Orbit positions for others
    const orbitCount = count - 1;
    const orbitRadius = 180;
    let orbitIdx = 0;

    for (let i = 0; i < count; i++) {
      if (i === actualSpeakerIdx) continue;
      const angle =
        (orbitIdx / orbitCount) * 2 * Math.PI - Math.PI / 2;
      positions.push({
        x: Math.cos(angle) * orbitRadius,
        y: Math.sin(angle) * orbitRadius,
        size: "sm",
      });
      orbitIdx++;
    }

    return { positions, containerClass: "relative" };
  }, [count, activeSpeakerId, allParticipants]);

  // Reorder participants so the active speaker is first for 5+ layout
  const orderedParticipants = useMemo(() => {
    if (count <= 4) return allParticipants;

    const speakerIdx = allParticipants.findIndex(
      (p) => p.id === activeSpeakerId
    );
    if (speakerIdx <= 0) return allParticipants;

    const reordered = [...allParticipants];
    const [speaker] = reordered.splice(speakerIdx, 1);
    reordered.unshift(speaker);
    return reordered;
  }, [allParticipants, activeSpeakerId, count]);

  // Simple flex layout for 1-2 participants
  if (count <= 2) {
    return (
      <div className="relative flex h-full w-full items-center justify-center">
        <GridDecorations />
        <div className={layout.containerClass}>
          {orderedParticipants.map((p, i) => (
            <motion.div
              key={p.id}
              layout
              animate={{
                y: [0, -6, 0],
              }}
              transition={{
                y: {
                  duration: 3 + i * 0.5,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: i * 0.7,
                },
                layout: { type: "spring", stiffness: 200, damping: 25 },
              }}
            >
              <VideoTile
                stream={p.stream}
                name={p.name}
                displayName={p.displayName}
                isLocal={p.isLocal}
                isMuted={p.isMuted}
                isVideoOff={p.isVideoOff}
                isSpeaking={speakingPeers.has(p.id)}
                audioLevel={audioLevels.get(p.id) || 0}
                size={layout.positions[i]?.size || "md"}
                avatarUrl={p.avatar}
              />
            </motion.div>
          ))}
        </div>
      </div>
    );
  }

  // Positioned layout for 3+ participants
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <GridDecorations />
      <div className="relative" style={{ width: 500, height: 400 }}>
        {orderedParticipants.map((p, i) => {
          const pos = layout.positions[i];
          if (!pos) return null;

          return (
            <motion.div
              key={p.id}
              className="absolute"
              style={{
                left: "50%",
                top: "50%",
              }}
              layout
              animate={{
                x: pos.x - (pos.size === "lg" ? 90 : pos.size === "md" ? 60 : 40),
                y:
                  pos.y -
                  (pos.size === "lg" ? 90 : pos.size === "md" ? 60 : 40) +
                  // subtle bobbing
                  0,
              }}
              transition={{
                layout: { type: "spring", stiffness: 200, damping: 25 },
                default: { type: "spring", stiffness: 200, damping: 25 },
              }}
            >
              <motion.div
                animate={{ y: [0, -5, 0] }}
                transition={{
                  duration: 3 + i * 0.4,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: i * 0.5,
                }}
              >
                <VideoTile
                  stream={p.stream}
                  name={p.name}
                  displayName={p.displayName}
                  isLocal={p.isLocal}
                  isMuted={p.isMuted}
                  isVideoOff={p.isVideoOff}
                  isSpeaking={speakingPeers.has(p.id)}
                  audioLevel={audioLevels.get(p.id) || 0}
                  size={pos.size}
                  avatarUrl={p.avatar}
                />
              </motion.div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

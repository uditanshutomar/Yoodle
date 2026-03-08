"use client";

import { motion } from "framer-motion";
import { MicOff } from "lucide-react";
import { useRef, useEffect } from "react";

interface VideoTileProps {
  stream: MediaStream | null;
  name: string;
  displayName?: string;
  isLocal?: boolean;
  isMuted?: boolean;
  isVideoOff?: boolean;
  isSpeaking?: boolean;
  audioLevel?: number; // 0-1
  size?: "sm" | "md" | "lg";
  avatarUrl?: string;
}

const sizeMap = {
  sm: 80,
  md: 120,
  lg: 180,
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getAvatarColor(name: string): string {
  const colors = [
    "#FFE600",
    "#FF6B6B",
    "#7C3AED",
    "#06B6D4",
    "#22C55E",
    "#F97316",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

/** Decorative doodle dots placed around the circle edge */
function DoodleDecorations({ size }: { size: number }) {
  const r = size / 2;
  // Place small decorative elements at various angles around the circle
  const decorations = [
    { angle: 30, type: "dot" },
    { angle: 75, type: "squiggle" },
    { angle: 150, type: "dot" },
    { angle: 210, type: "star" },
    { angle: 285, type: "dot" },
    { angle: 330, type: "squiggle" },
  ];

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      width={size + 24}
      height={size + 24}
      viewBox={`0 0 ${size + 24} ${size + 24}`}
      style={{ left: -12, top: -12 }}
    >
      {decorations.map((dec, i) => {
        const rad = (dec.angle * Math.PI) / 180;
        const cx = (size + 24) / 2 + (r + 6) * Math.cos(rad);
        const cy = (size + 24) / 2 + (r + 6) * Math.sin(rad);

        if (dec.type === "dot") {
          return (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={size > 100 ? 2.5 : 1.5}
              fill="#FFE600"
              opacity={0.7}
            />
          );
        }

        if (dec.type === "star") {
          const s = size > 100 ? 5 : 3;
          return (
            <g key={i} transform={`translate(${cx}, ${cy})`}>
              <line
                x1={-s}
                y1={0}
                x2={s}
                y2={0}
                stroke="#FF6B6B"
                strokeWidth={1.5}
                strokeLinecap="round"
              />
              <line
                x1={0}
                y1={-s}
                x2={0}
                y2={s}
                stroke="#FF6B6B"
                strokeWidth={1.5}
                strokeLinecap="round"
              />
            </g>
          );
        }

        // squiggle
        const s = size > 100 ? 5 : 3;
        return (
          <path
            key={i}
            d={`M ${cx - s} ${cy} Q ${cx - s / 2} ${cy - s}, ${cx} ${cy} Q ${cx + s / 2} ${cy + s}, ${cx + s} ${cy}`}
            fill="none"
            stroke="#06B6D4"
            strokeWidth={1.5}
            strokeLinecap="round"
            opacity={0.6}
          />
        );
      })}
    </svg>
  );
}

export default function VideoTile({
  stream,
  name,
  displayName,
  isLocal = false,
  isMuted = false,
  isVideoOff = false,
  isSpeaking = false,
  audioLevel = 0,
  size = "md",
  avatarUrl,
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const px = sizeMap[size];

  // Attach MediaStream to video element and clean up on stream change
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    if (stream) {
      videoEl.srcObject = stream;
    } else {
      videoEl.srcObject = null;
    }

    return () => {
      // Clear srcObject on cleanup to release the stream reference
      if (videoEl) {
        videoEl.srcObject = null;
      }
    };
  }, [stream]);

  // Scale based on audio level when speaking (range 1.0 to 1.2)
  const speakingScale = isSpeaking ? 1.0 + Math.min(audioLevel, 1) * 0.2 : 1.0;

  const bgColor = getAvatarColor(name);
  const initials = getInitials(name);
  const label = displayName || name;

  return (
    <div className="flex flex-col items-center gap-2 relative">
      {/* Decorative doodles around circle */}
      <div className="relative" style={{ width: px, height: px }}>
        <DoodleDecorations size={px} />

        {/* Speaking glow ring */}
        {isSpeaking && (
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{
              boxShadow: `0 0 0 4px #FFE600, 0 0 20px rgba(255, 230, 0, 0.4)`,
            }}
            animate={{
              boxShadow: [
                `0 0 0 4px #FFE600, 0 0 20px rgba(255, 230, 0, 0.4)`,
                `0 0 0 6px #FFE600, 0 0 30px rgba(255, 230, 0, 0.6)`,
                `0 0 0 4px #FFE600, 0 0 20px rgba(255, 230, 0, 0.4)`,
              ],
            }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
          />
        )}

        {/* Main circle container */}
        <motion.div
          className="rounded-full overflow-hidden aspect-square relative"
          style={{
            width: px,
            height: px,
            border: "3px solid #0A0A0A",
          }}
          animate={{ scale: speakingScale }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
        >
          {/* Video or Avatar fallback */}
          {!isVideoOff && stream ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted={isLocal}
              className="h-full w-full object-cover"
              style={{
                transform: isLocal ? "scaleX(-1)" : "none",
              }}
            />
          ) : (
            <div
              className="h-full w-full flex items-center justify-center"
              style={{ backgroundColor: bgColor }}
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt={name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span
                  className="text-[#0A0A0A] font-black select-none"
                  style={{
                    fontFamily: "var(--font-heading)",
                    fontSize: px * 0.3,
                  }}
                >
                  {initials}
                </span>
              )}
            </div>
          )}

          {/* Muted badge */}
          {isMuted && (
            <div className="absolute bottom-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-[#FF6B6B] border-2 border-[#0A0A0A]">
              <MicOff size={12} className="text-white" />
            </div>
          )}
        </motion.div>
      </div>

      {/* Name pill */}
      <motion.div
        className="rounded-full bg-[#0A0A0A] text-white px-3 py-0.5 text-xs font-bold max-w-[120px] truncate"
        style={{ fontFamily: "var(--font-heading)" }}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        {isLocal ? "You" : label}
      </motion.div>
    </div>
  );
}

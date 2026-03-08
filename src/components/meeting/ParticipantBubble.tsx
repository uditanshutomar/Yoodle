"use client";

import { useRef, useEffect } from "react";
import { motion } from "framer-motion";
import Image from "next/image";

export interface Participant {
    id: string;
    name: string;
    avatar: string;
    isMuted: boolean;
    isSpeaking: boolean;
    stream?: MediaStream | null;
    isVideoOff?: boolean;
}

interface ParticipantBubbleProps {
    participant: Participant;
    size: number;
    x: number;
    y: number;
    isSelf?: boolean;
}

export default function ParticipantBubble({
    participant,
    size,
    x,
    y,
    isSelf = false,
}: ParticipantBubbleProps) {
    const { name, avatar, isMuted, isSpeaking, stream, isVideoOff } = participant;
    const videoRef = useRef<HTMLVideoElement>(null);

    // Attach MediaStream to video element
    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
        }
    }, [stream]);

    const showVideo = !!stream && !isVideoOff;

    return (
        <motion.div
            layout
            layoutId={participant.id}
            className="absolute flex flex-col items-center"
            animate={{
                x: x - size / 2,
                y: y - size / 2,
                width: size,
                height: size + 36,
            }}
            transition={{
                type: "spring",
                stiffness: 120,
                damping: 20,
                mass: 0.8,
            }}
            style={{ zIndex: isSpeaking ? 10 : 1 }}
        >
            {/* Bubble circle — scribbly border style */}
            <motion.div
                className={`relative rounded-full overflow-hidden ${isSpeaking ? "speaker-ring" : "bubble-idle"
                    }`}
                animate={{ width: size, height: size }}
                transition={{
                    type: "spring",
                    stiffness: 120,
                    damping: 20,
                    mass: 0.8,
                }}
                style={{
                    border: isSpeaking
                        ? "3px solid #FFE600"
                        : "2.5px solid #0A0A0A",
                    background: "white",
                }}
            >
                {showVideo ? (
                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted={isSelf}
                        className="absolute inset-0 h-full w-full object-cover"
                        style={{ transform: isSelf ? "scaleX(-1)" : undefined }}
                    />
                ) : (
                    <Image
                        src={avatar}
                        alt={name}
                        fill
                        className="object-cover"
                        sizes={`${size}px`}
                    />
                )}

                {/* Muted indicator — coral dot */}
                {isMuted && (
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute bottom-1 right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#0A0A0A] bg-[#FF6B6B]"
                    >
                        <svg
                            width="11"
                            height="11"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="white"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <line x1="1" y1="1" x2="23" y2="23" />
                            <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                            <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .38-.03.75-.08 1.12" />
                            <line x1="12" y1="19" x2="12" y2="23" />
                            <line x1="8" y1="23" x2="16" y2="23" />
                        </svg>
                    </motion.div>
                )}

                {/* Speaking wave bars */}
                {isSpeaking && (
                    <motion.div
                        className="absolute bottom-1.5 left-1.5 flex items-end gap-[2px] rounded-full border-2 border-[#0A0A0A] bg-[#FFE600] px-1.5 py-1"
                        initial={{ opacity: 0, scale: 0 }}
                        animate={{ opacity: 1, scale: 1 }}
                    >
                        {[0, 1, 2].map((i) => (
                            <motion.div
                                key={i}
                                className="w-[3px] rounded-full bg-[#0A0A0A]"
                                animate={{ height: [3, 10, 3] }}
                                transition={{
                                    repeat: Infinity,
                                    duration: 0.6,
                                    delay: i * 0.15,
                                    ease: "easeInOut",
                                }}
                            />
                        ))}
                    </motion.div>
                )}
            </motion.div>

            {/* Name badge — scribbly card style */}
            <motion.div
                className="name-badge mt-2 rounded-full px-3 py-1 text-center"
                layout
                animate={{ scale: isSpeaking ? 1 : 0.9 }}
                transition={{ type: "spring", stiffness: 200, damping: 25 }}
            >
                <span
                    className="text-xs font-bold tracking-wide whitespace-nowrap"
                    style={{
                        fontFamily: "var(--font-heading)",
                        fontSize: isSpeaking ? "0.75rem" : "0.65rem",
                        color: "#0A0A0A",
                        textShadow: isSpeaking ? "1px 1px 0 #FFE600" : "none",
                    }}
                >
                    {isSelf ? `${name} (You)` : name.toUpperCase()}
                </span>
            </motion.div>
        </motion.div>
    );
}

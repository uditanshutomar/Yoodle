"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { Participant } from "./ParticipantBubble";
import { DoodleStar, DoodleSparkles } from "@/components/Doodles";

interface ScreenShareViewProps {
    presenter: Participant;
    participants: Participant[];
    selfId: string;
    onStopSharing: () => void;
    screenStream: MediaStream | null;
}

export default function ScreenShareView({
    presenter,
    participants,
    selfId,
    onStopSharing,
    screenStream,
}: ScreenShareViewProps) {
    const [showParticipants, setShowParticipants] = useState(false);
    const constraintsRef = useRef<HTMLDivElement>(null);
    const screenVideoRef = useRef<HTMLVideoElement>(null);
    const presenterVideoRef = useRef<HTMLVideoElement>(null);
    const otherParticipants = participants.filter((p) => p.id !== presenter.id);

    // Attach screen stream to video element
    useEffect(() => {
        const el = screenVideoRef.current;
        if (el && screenStream) {
            el.srcObject = screenStream;
            el.play().catch(() => {
                // Autoplay blocked — user will see a still frame until interaction
            });
        }
    }, [screenStream]);

    // Attach presenter camera stream to PiP video
    // Must depend on isVideoOff so srcObject is re-assigned when <video> remounts
    useEffect(() => {
        const el = presenterVideoRef.current;
        if (el && presenter.stream) {
            el.srcObject = presenter.stream;
            el.play().catch(() => {
                // Autoplay blocked — user will see a still frame until interaction
            });
        }
    }, [presenter.stream, presenter.isVideoOff]);

    return (
        <motion.div
            ref={constraintsRef}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="absolute inset-0 z-20 flex flex-col"
        >
            {/* Shared screen content — takes most of the space */}
            <div className="relative flex-1 mx-4 mt-4 mb-20 rounded-2xl overflow-hidden border-2 border-[var(--border-strong)] shadow-[6px_6px_0_var(--border-strong)] bg-[var(--surface)]">
                {/* "Sharing" indicator banner */}
                <motion.div
                    initial={{ y: -40, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.3, type: "spring", stiffness: 200, damping: 25 }}
                    className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-full border-2 border-[var(--border-strong)] bg-[#FFE600] px-4 py-1.5 shadow-[3px_3px_0_var(--border-strong)]"
                >
                    <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#FF6B6B] opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-[#FF6B6B]" />
                    </span>
                    <span
                        className="text-xs font-bold text-[#0A0A0A]"
                        style={{ fontFamily: "var(--font-heading)" }}
                    >
                        {presenter.id === selfId ? "You are presenting" : `${presenter.name} is presenting`}
                    </span>
                    {presenter.id === selfId && (
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={onStopSharing}
                            className="ml-1 rounded-full border-2 border-[var(--border-strong)] bg-[#FF6B6B] px-3 py-0.5 text-[11px] font-bold text-white shadow-[2px_2px_0_var(--border-strong)] hover:shadow-[1px_1px_0_var(--border-strong)] hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
                            style={{ fontFamily: "var(--font-heading)" }}
                        >
                            Stop
                        </motion.button>
                    )}
                </motion.div>

                {/* Screen share content */}
                {screenStream ? (
                    <video
                        ref={screenVideoRef}
                        autoPlay
                        playsInline
                        className="absolute inset-0 h-full w-full object-contain bg-black"
                    />
                ) : (
                    <Image
                        src="/mock-screen-share.png"
                        alt="Shared screen"
                        fill
                        className="object-cover"
                        sizes="100vw"
                        priority
                    />
                )}
            </div>

            {/* Draggable presenter PiP bubble — Loom-style */}
            <motion.div
                drag
                dragConstraints={constraintsRef}
                dragElastic={0.05}
                dragMomentum={false}
                whileDrag={{ scale: 1.08, zIndex: 100 }}
                initial={{ x: 24, y: -200, opacity: 0, scale: 0.5 }}
                animate={{ x: 24, y: -200, opacity: 1, scale: 1 }}
                transition={{ delay: 0.5, type: "spring", stiffness: 200, damping: 22 }}
                className="absolute bottom-0 left-0 z-40 cursor-grab active:cursor-grabbing"
                style={{ touchAction: "none" }}
            >
                <div className="group relative">
                    {/* Bubble */}
                    <div
                        className={`relative h-28 w-28 overflow-hidden rounded-full border-[3px] bg-[var(--surface)] ${presenter.isSpeaking
                            ? "border-[#FFE600] speaker-ring"
                            : "border-[var(--border-strong)] shadow-[4px_4px_0_var(--border-strong)]"
                            }`}
                    >
                        {presenter.stream && !presenter.isVideoOff ? (
                            <video
                                ref={presenterVideoRef}
                                autoPlay
                                playsInline
                                muted={presenter.id === selfId}
                                className="absolute inset-0 h-full w-full object-cover"
                                style={{ transform: presenter.id === selfId ? "scaleX(-1)" : undefined }}
                            />
                        ) : (
                            <Image
                                src={presenter.avatar}
                                alt={presenter.name}
                                fill
                                className="object-cover"
                                sizes="112px"
                            />
                        )}
                    </div>

                    {/* Name tag */}
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.8 }}
                        className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border-2 border-[var(--border-strong)] bg-[#FFE600] px-2.5 py-0.5 shadow-[2px_2px_0_var(--border-strong)]"
                    >
                        <span
                            className="text-[10px] font-bold text-[#0A0A0A]"
                            style={{ fontFamily: "var(--font-heading)" }}
                        >
                            {presenter.id === selfId ? "You" : presenter.name}
                        </span>
                    </motion.div>

                    {/* Drag hint — shows on hover */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[2px_2px_0_var(--border-strong)] opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#0A0A0A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 9l-3 3 3 3" />
                            <path d="M9 5l3-3 3 3" />
                            <path d="M15 19l-3 3-3-3" />
                            <path d="M19 9l3 3-3 3" />
                            <line x1="2" y1="12" x2="22" y2="12" />
                            <line x1="12" y1="2" x2="12" y2="22" />
                        </svg>
                    </motion.div>

                    {/* Speaking indicator on PiP */}
                    {presenter.isSpeaking && (
                        <motion.div
                            className="absolute bottom-4 left-0 flex items-end gap-[2px] rounded-full border-2 border-[var(--border-strong)] bg-[#FFE600] px-1.5 py-1"
                            initial={{ opacity: 0, scale: 0 }}
                            animate={{ opacity: 1, scale: 1 }}
                        >
                            {[0, 1, 2].map((i) => (
                                <motion.div
                                    key={i}
                                    className="w-[3px] rounded-full bg-[#0A0A0A]"
                                    animate={{ height: [3, 8, 3] }}
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
                </div>
            </motion.div>

            {/* Toggle participants button — bottom right */}
            <motion.button
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.6, type: "spring" }}
                whileHover={{ scale: 1.08, y: -2 }}
                whileTap={{ scale: 0.93 }}
                onClick={() => setShowParticipants(!showParticipants)}
                className={`absolute bottom-28 right-6 z-40 flex h-11 items-center gap-2 rounded-full px-4 ${showParticipants ? "yellow-btn" : "control-btn"
                    }`}
                style={{ fontFamily: "var(--font-heading)" }}
                title={showParticipants ? "Hide participants" : "Show participants"}
            >
                {showParticipants ? (
                    <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                        <span className="text-xs font-bold">Hide</span>
                    </>
                ) : (
                    <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                            <circle cx="9" cy="7" r="4" />
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                        </svg>
                        <span className="text-xs font-bold">{otherParticipants.length}</span>
                    </>
                )}
            </motion.button>

            {/* Expandable participants strip — right side vertical */}
            <AnimatePresence>
                {showParticipants && (
                    <motion.div
                        initial={{ x: 80, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: 80, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 250, damping: 25 }}
                        className="absolute right-5 top-8 bottom-28 z-30 flex items-center"
                    >
                        <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-[var(--border-strong)] bg-white/90 px-2.5 py-3 shadow-[4px_4px_0_var(--border-strong)] backdrop-blur-sm max-h-full overflow-y-auto">
                            <DoodleStar color="#FFE600" size={16} className="flex-shrink-0" />

                            {otherParticipants.map((p, i) => (
                                <motion.div
                                    key={p.id}
                                    initial={{ scale: 0, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 0, opacity: 0 }}
                                    transition={{ delay: i * 0.05, type: "spring", stiffness: 300, damping: 25 }}
                                    className="group relative flex flex-col items-center"
                                >
                                    <div
                                        className={`relative h-12 w-12 overflow-hidden rounded-full border-2 flex-shrink-0 ${p.isSpeaking ? "border-[#FFE600]" : "border-[var(--border-strong)]"
                                            }`}
                                        style={{
                                            boxShadow: p.isSpeaking
                                                ? "0 0 0 2px #FFE600, 0 0 12px rgba(255,230,0,0.4)"
                                                : "2px 2px 0 #0A0A0A",
                                        }}
                                    >
                                        <Image
                                            src={p.avatar}
                                            alt={p.name}
                                            fill
                                            className="object-cover"
                                            sizes="48px"
                                        />
                                        {p.isMuted && (
                                            <div className="absolute inset-0 flex items-end justify-end">
                                                <div className="flex h-4 w-4 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[#FF6B6B] mr-0.5 mb-0.5">
                                                    <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round">
                                                        <line x1="1" y1="1" x2="23" y2="23" />
                                                    </svg>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="absolute left-0 -translate-x-full pl-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                        <span
                                            className="whitespace-nowrap rounded-full border-2 border-[var(--border-strong)] bg-[var(--surface)] px-2 py-0.5 text-[10px] font-bold shadow-[2px_2px_0_var(--border-strong)]"
                                            style={{ fontFamily: "var(--font-heading)" }}
                                        >
                                            {p.name}
                                        </span>
                                    </div>
                                </motion.div>
                            ))}

                            <DoodleSparkles className="flex-shrink-0 h-4 w-4" />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

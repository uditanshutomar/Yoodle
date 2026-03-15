"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, Mic, MicOff, Video, VideoOff, Crown, Monitor, Hand, UserX, ShieldCheck } from "lucide-react";
import Avatar from "@/components/ui/Avatar";

interface ParticipantInfo {
  id: string;
  name: string;
  displayName: string;
  avatar?: string | null;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isScreenSharing: boolean;
  isHost?: boolean;
  isHandRaised?: boolean;
}

interface ParticipantListProps {
  isOpen: boolean;
  onClose: () => void;
  participants: ParticipantInfo[];
  speakingPeers: Set<string>;
  localUserId: string;
  /** Whether the local user is the host (enables mute/kick/transfer controls) */
  isLocalHost?: boolean;
  onMuteParticipant?: (userId: string) => void;
  onKickParticipant?: (userId: string) => void;
  onTransferHost?: (userId: string) => void;
}

export default function ParticipantList({
  isOpen,
  onClose,
  participants,
  speakingPeers,
  localUserId,
  isLocalHost = false,
  onMuteParticipant,
  onKickParticipant,
  onTransferHost,
}: ParticipantListProps) {
  // Sort: host first, then hand raised, then rest
  const sortedParticipants = [...participants].sort((a, b) => {
    if (a.isHost && !b.isHost) return -1;
    if (!a.isHost && b.isHost) return 1;
    if (a.isHandRaised && !b.isHandRaised) return -1;
    if (!a.isHandRaised && b.isHandRaised) return 1;
    return 0;
  });

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="w-80 h-full flex flex-col bg-white/95 backdrop-blur-sm border-l-2 border-[#0A0A0A]"
          initial={{ x: 320, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 320, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b-2 border-[#0A0A0A]/10">
            <div className="flex items-center gap-2">
              <h3
                className="text-base font-bold text-[#0A0A0A]"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                Participants
              </h3>
              <span
                className="inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-[#0A0A0A] text-white text-[10px] font-bold px-1.5"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                {participants.length}
              </span>
            </div>
            <motion.button
              className="rounded-lg p-1.5 text-[#0A0A0A]/60 hover:text-[#0A0A0A] hover:bg-[#0A0A0A]/5 transition-colors cursor-pointer"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={onClose}
            >
              <X size={16} />
            </motion.button>
          </div>

          {/* Participant list */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
            {sortedParticipants.map((p, i) => {
              const isSpeaking = speakingPeers.has(p.id);
              const isLocal = p.id === localUserId;

              return (
                <motion.div
                  key={p.id}
                  className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
                    isSpeaking
                      ? "bg-[#FFE600]/15"
                      : "hover:bg-[#0A0A0A]/3"
                  }`}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  {/* Avatar with speaking indicator */}
                  <div className="relative">
                    <Avatar
                      src={p.avatar}
                      name={p.name}
                      size="sm"
                    />
                    {isSpeaking && (
                      <motion.span
                        className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-400 border-2 border-white"
                        animate={{ scale: [1, 1.3, 1] }}
                        transition={{
                          duration: 0.8,
                          repeat: Infinity,
                        }}
                      />
                    )}
                  </div>

                  {/* Name and badges */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="text-sm font-bold text-[#0A0A0A] truncate"
                        style={{ fontFamily: "var(--font-heading)" }}
                      >
                        {p.name}
                        {isLocal && (
                          <span className="text-[#0A0A0A]/40 font-normal">
                            {" "}
                            (you)
                          </span>
                        )}
                      </span>
                      {p.isHost && (
                        <Crown
                          size={12}
                          className="text-[#FFE600] fill-[#FFE600] shrink-0"
                        />
                      )}
                      {p.isHandRaised && (
                        <motion.span
                          initial={{ y: 0 }}
                          animate={{ y: [-2, 0, -2] }}
                          transition={{ duration: 1, repeat: Infinity }}
                        >
                          <Hand size={12} className="text-[#FFE600] fill-[#FFE600] shrink-0" />
                        </motion.span>
                      )}
                    </div>
                    <span
                      className="text-xs text-[#0A0A0A]/40"
                      style={{ fontFamily: "var(--font-body)" }}
                    >
                      @{p.displayName}
                    </span>
                  </div>

                  {/* Status icons + host actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {p.isScreenSharing && (
                      <Monitor size={14} className="text-[#06B6D4]" />
                    )}
                    {p.isAudioEnabled ? (
                      <Mic size={14} className="text-[#0A0A0A]/40" />
                    ) : (
                      <MicOff size={14} className="text-[#FF6B6B]" />
                    )}
                    {p.isVideoEnabled ? (
                      <Video size={14} className="text-[#0A0A0A]/40" />
                    ) : (
                      <VideoOff size={14} className="text-[#FF6B6B]" />
                    )}

                    {/* Host controls — only show for non-local participants when local is host */}
                    {isLocalHost && !isLocal && (
                      <div className="hidden group-hover:flex items-center gap-1 ml-1">
                        {onTransferHost && (
                          <motion.button
                            className="h-6 w-6 rounded-md border border-[#0A0A0A]/20 bg-[#0A0A0A]/5 flex items-center justify-center cursor-pointer"
                            whileHover={{ scale: 1.15, backgroundColor: "#FFE60030" }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => onTransferHost(p.id)}
                            title="Make host"
                          >
                            <ShieldCheck size={10} className="text-[#FFB800]" />
                          </motion.button>
                        )}
                        {p.isAudioEnabled && onMuteParticipant && (
                          <motion.button
                            className="h-6 w-6 rounded-md border border-[#0A0A0A]/20 bg-[#0A0A0A]/5 flex items-center justify-center cursor-pointer"
                            whileHover={{ scale: 1.15, backgroundColor: "#FF6B6B20" }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => onMuteParticipant(p.id)}
                            title="Mute participant"
                          >
                            <MicOff size={10} className="text-[#FF6B6B]" />
                          </motion.button>
                        )}
                        {onKickParticipant && (
                          <motion.button
                            className="h-6 w-6 rounded-md border border-[#0A0A0A]/20 bg-[#0A0A0A]/5 flex items-center justify-center cursor-pointer"
                            whileHover={{ scale: 1.15, backgroundColor: "#FF6B6B20" }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => onKickParticipant(p.id)}
                            title="Remove participant"
                          >
                            <UserX size={10} className="text-[#FF6B6B]" />
                          </motion.button>
                        )}
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

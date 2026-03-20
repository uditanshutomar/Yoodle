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
          className="w-80 h-full flex flex-col bg-[var(--surface)]/95 backdrop-blur-sm border-l-2 border-[var(--border-strong)]"
          role="complementary"
          aria-label="Participant list"
          initial={{ x: 320, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 320, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b-2 border-[var(--border-strong)]/10">
            <div className="flex items-center gap-2">
              <h3
                className="text-base font-bold text-[var(--text-primary)] font-heading"
              >
                Participants
              </h3>
              <span
                className="inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-[var(--text-primary)] text-[var(--background)] text-[10px] font-bold px-1.5 font-heading"
              >
                {participants.length}
              </span>
            </div>
            <motion.button
              className="rounded-lg p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={onClose}
              aria-label="Close participants panel"
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
                      : "hover:bg-[var(--surface-hover)]"
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
                        className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-400 border-2 border-[var(--surface)]"
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
                        className="text-sm font-bold text-[var(--text-primary)] truncate font-heading"
                      >
                        {p.name}
                        {isLocal && (
                          <span className="text-[var(--text-muted)] font-normal">
                            {" "}
                            (you)
                          </span>
                        )}
                      </span>
                      {p.isHost && (
                        <>
                          <Crown
                            size={12}
                            className="text-[#FFE600] fill-[#FFE600] shrink-0"
                            aria-hidden="true"
                          />
                          <span className="sr-only">Host</span>
                        </>
                      )}
                      {p.isHandRaised && (
                        <motion.span
                          initial={{ y: 0 }}
                          animate={{ y: [-2, 0, -2] }}
                          transition={{ duration: 1, repeat: Infinity }}
                        >
                          <Hand size={12} className="text-[#FFE600] fill-[#FFE600] shrink-0" aria-hidden="true" />
                          <span className="sr-only">Hand raised</span>
                        </motion.span>
                      )}
                    </div>
                    <span
                      className="text-xs text-[var(--text-muted)] font-body"
                    >
                      @{p.displayName}
                    </span>
                  </div>

                  {/* Status icons + host actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {p.isScreenSharing && (
                      <>
                        <Monitor size={14} className="text-[#06B6D4]" aria-hidden="true" />
                        <span className="sr-only">{p.name} is sharing screen</span>
                      </>
                    )}
                    {p.isAudioEnabled ? (
                      <>
                        <Mic size={14} className="text-[var(--text-muted)]" aria-hidden="true" />
                        <span className="sr-only">{p.name} microphone on</span>
                      </>
                    ) : (
                      <>
                        <MicOff size={14} className="text-[#FF6B6B]" aria-hidden="true" />
                        <span className="sr-only">{p.name} microphone off</span>
                      </>
                    )}
                    {p.isVideoEnabled ? (
                      <>
                        <Video size={14} className="text-[var(--text-muted)]" aria-hidden="true" />
                        <span className="sr-only">{p.name} camera on</span>
                      </>
                    ) : (
                      <>
                        <VideoOff size={14} className="text-[#FF6B6B]" aria-hidden="true" />
                        <span className="sr-only">{p.name} camera off</span>
                      </>
                    )}

                    {/* Host controls — only show for non-local participants when local is host */}
                    {isLocalHost && !isLocal && (
                      <div className="hidden group-hover:flex group-focus-within:flex items-center gap-1 ml-1">
                        {onTransferHost && (
                          <motion.button
                            className="h-6 w-6 rounded-md border border-[var(--border-strong)]/20 bg-[var(--surface-hover)] flex items-center justify-center cursor-pointer focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none"
                            whileHover={{ scale: 1.15, backgroundColor: "#FFE60030" }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => onTransferHost(p.id)}
                            title="Make host"
                            aria-label={`Make ${p.name} host`}
                          >
                            <ShieldCheck size={10} className="text-[#FFB800]" />
                          </motion.button>
                        )}
                        {p.isAudioEnabled && onMuteParticipant && (
                          <motion.button
                            className="h-6 w-6 rounded-md border border-[var(--border-strong)]/20 bg-[var(--surface-hover)] flex items-center justify-center cursor-pointer focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none"
                            whileHover={{ scale: 1.15, backgroundColor: "#FF6B6B20" }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => onMuteParticipant(p.id)}
                            title="Mute participant"
                            aria-label={`Mute ${p.name}`}
                          >
                            <MicOff size={10} className="text-[#FF6B6B]" />
                          </motion.button>
                        )}
                        {onKickParticipant && (
                          <motion.button
                            className="h-6 w-6 rounded-md border border-[var(--border-strong)]/20 bg-[var(--surface-hover)] flex items-center justify-center cursor-pointer focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none"
                            whileHover={{ scale: 1.15, backgroundColor: "#FF6B6B20" }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => onKickParticipant(p.id)}
                            title="Remove participant"
                            aria-label={`Remove ${p.name} from meeting`}
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

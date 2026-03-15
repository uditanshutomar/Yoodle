"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  MonitorOff,
  SmilePlus,
  MessageCircle,
  Users,
  Circle,
  LogOut,
  X,
  Hand,
  LayoutGrid,
} from "lucide-react";
import { useState } from "react";

interface MeetingControlsProps {
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isScreenSharing: boolean;
  isRecording: boolean;
  isChatOpen: boolean;
  isParticipantsOpen: boolean;
  isHandRaised?: boolean;
  layout?: "bubbles" | "grid";
  unreadChatCount?: number;
  canScreenShare?: boolean;
  canRecord?: boolean;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onToggleScreenShare: () => void;
  onToggleChat: () => void;
  onToggleParticipants: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onReaction: (emoji: string) => void;
  onLeave: () => void;
  onToggleHandRaise?: () => void;
  onToggleLayout?: () => void;
}

const REACTIONS = ["👏", "🔥", "❤️", "😂", "🎉", "👍", "💯", "🤯"];

function ControlButton({
  onClick,
  active,
  danger,
  children,
  label,
  badge,
  pressed,
  disabled,
}: {
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  children: React.ReactNode;
  label: string;
  badge?: boolean;
  pressed?: boolean;
  disabled?: boolean;
}) {
  return (
    <motion.button
      className={`relative h-11 w-11 sm:h-12 sm:w-12 rounded-full border-2 border-[#0A0A0A] flex items-center justify-center transition-colors ${
        disabled
          ? "cursor-not-allowed opacity-40"
          : "cursor-pointer"
      } ${
        danger
          ? "bg-[#FF6B6B] text-white hover:bg-[#ff5252]"
          : active
            ? "bg-white text-[#0A0A0A] hover:bg-gray-50"
            : "bg-[#0A0A0A]/80 text-white hover:bg-[#0A0A0A]"
      }`}
      whileHover={disabled ? undefined : { scale: 1.1, y: -2 }}
      whileTap={disabled ? undefined : { scale: 0.9 }}
      onClick={disabled ? undefined : onClick}
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
    >
      {children}
      {badge && (
        <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-[#FF6B6B] border-2 border-[#0A0A0A]" />
      )}
    </motion.button>
  );
}

export default function MeetingControls({
  isAudioEnabled,
  isVideoEnabled,
  isScreenSharing,
  isRecording,
  isChatOpen,
  isParticipantsOpen,
  isHandRaised = false,
  layout = "bubbles",
  unreadChatCount = 0,
  canScreenShare = true,
  canRecord = true,
  onToggleAudio,
  onToggleVideo,
  onToggleScreenShare,
  onToggleChat,
  onToggleParticipants,
  onStartRecording,
  onStopRecording,
  onReaction,
  onLeave,
  onToggleHandRaise,
  onToggleLayout,
}: MeetingControlsProps) {
  const [showReactions, setShowReactions] = useState(false);

  return (
    <div className="relative z-20 flex justify-center px-2 pb-2 sm:px-4 sm:pb-4">
      {/* Emoji picker popup */}
      <AnimatePresence>
        {showReactions && (
          <motion.div
            className="absolute bottom-full mb-3 z-50 flex gap-2 rounded-2xl bg-white border-2 border-[#0A0A0A] shadow-[4px_4px_0_#0A0A0A] px-3 py-2"
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
          >
            {REACTIONS.map((emoji) => (
              <motion.button
                key={emoji}
                className="text-xl cursor-pointer hover:scale-125 transition-transform p-1"
                whileHover={{ scale: 1.3 }}
                whileTap={{ scale: 0.8 }}
                onClick={() => {
                  onReaction(emoji);
                  setShowReactions(false);
                }}
              >
                {emoji}
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Control bar */}
      <motion.div
        className="flex items-center gap-1.5 sm:gap-3 rounded-2xl bg-white/95 backdrop-blur-sm border-2 border-[#0A0A0A] shadow-[3px_3px_0_#0A0A0A] sm:shadow-[4px_4px_0_#0A0A0A] px-3 py-2 sm:px-5 sm:py-3"
        role="toolbar"
        aria-label="Meeting controls"
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 25, delay: 0.3 }}
      >
        {/* Mic toggle */}
        <ControlButton
          onClick={onToggleAudio}
          active={isAudioEnabled}
          label={isAudioEnabled ? "Mute microphone (D)" : "Unmute microphone (D)"}
          pressed={isAudioEnabled}
        >
          {isAudioEnabled ? (
            <Mic size={18} />
          ) : (
            <MicOff size={18} className="text-[#FF6B6B]" />
          )}
          {/* Colored dot indicator */}
          <span
            className={`absolute -bottom-0.5 left-1/2 -translate-x-1/2 h-2 w-2 rounded-full border border-[#0A0A0A] ${
              isAudioEnabled ? "bg-green-400" : "bg-[#FF6B6B]"
            }`}
          />
        </ControlButton>

        {/* Camera toggle */}
        <ControlButton
          onClick={onToggleVideo}
          active={isVideoEnabled}
          label={isVideoEnabled ? "Turn off camera (E)" : "Turn on camera (E)"}
          pressed={isVideoEnabled}
        >
          {isVideoEnabled ? (
            <Video size={18} />
          ) : (
            <VideoOff size={18} className="text-[#FF6B6B]" />
          )}
        </ControlButton>

        {/* Divider */}
        <div className="hidden sm:block h-8 w-px bg-[#0A0A0A]/15 mx-1" />

        {/* Screen share */}
        <ControlButton
          onClick={onToggleScreenShare}
          active={isScreenSharing}
          label={
            canScreenShare
              ? isScreenSharing
                ? "Stop sharing"
                : "Share screen"
              : "Screen sharing disabled"
          }
          pressed={isScreenSharing}
          disabled={!canScreenShare}
        >
          {isScreenSharing ? (
            <MonitorOff size={18} className="text-[#06B6D4]" />
          ) : (
            <Monitor size={18} />
          )}
        </ControlButton>

        {/* Hand raise */}
        {onToggleHandRaise && (
          <ControlButton
            onClick={onToggleHandRaise}
            active={isHandRaised}
            label={isHandRaised ? "Lower hand (H)" : "Raise hand (H)"}
          >
            <Hand
              size={18}
              className={isHandRaised ? "text-[#FFE600] fill-[#FFE600]" : ""}
            />
          </ControlButton>
        )}

        {/* Reactions */}
        <ControlButton
          onClick={() => setShowReactions(!showReactions)}
          active={showReactions}
          label="Reactions"
        >
          {showReactions ? <X size={18} /> : <SmilePlus size={18} />}
        </ControlButton>

        {/* Chat toggle */}
        <ControlButton
          onClick={onToggleChat}
          active={isChatOpen}
          label="Chat (A)"
          badge={unreadChatCount > 0}
        >
          <MessageCircle
            size={18}
            className={isChatOpen ? "text-[#FFE600]" : ""}
          />
        </ControlButton>

        {/* Participants toggle */}
        <ControlButton
          onClick={onToggleParticipants}
          active={isParticipantsOpen}
          label="Participants (P)"
        >
          <Users
            size={18}
            className={isParticipantsOpen ? "text-[#06B6D4]" : ""}
          />
        </ControlButton>

        {/* Layout toggle */}
        {onToggleLayout && (
          <ControlButton
            onClick={onToggleLayout}
            active={layout === "bubbles"}
            label={layout === "bubbles" ? "Grid view (L)" : "Bubble view (L)"}
          >
            <LayoutGrid
              size={18}
              className={layout === "grid" ? "text-[#A855F7]" : ""}
            />
          </ControlButton>
        )}

        {/* Record */}
        <ControlButton
          onClick={isRecording ? onStopRecording : onStartRecording}
          active={isRecording}
          label={
            canRecord
              ? isRecording
                ? "Stop recording (R)"
                : "Start recording (R)"
              : "Recording disabled"
          }
          pressed={isRecording}
          disabled={!canRecord}
        >
          <Circle
            size={18}
            className={isRecording ? "text-[#FF6B6B] fill-[#FF6B6B]" : ""}
          />
          {isRecording && (
            <motion.span
              className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-[#FF6B6B]"
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
            />
          )}
        </ControlButton>

        {/* Divider */}
        <div className="hidden sm:block h-8 w-px bg-[#0A0A0A]/15 mx-1" />

        {/* Leave call */}
        <ControlButton onClick={onLeave} danger label="Leave call">
          <LogOut size={18} />
        </ControlButton>
      </motion.div>
    </div>
  );
}

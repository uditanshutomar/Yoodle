"use client";

import { useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { Mic } from "lucide-react";
import { useSpeechToText } from "@/hooks/useSpeechToText";

interface VoiceInputButtonProps {
  /** Called with final transcript text when user releases the button */
  onTranscript: (text: string) => void;
  /** Called with interim text while user is holding — for live preview */
  onInterim?: (text: string) => void;
  /** Called when recording starts */
  onRecordingStart?: () => void;
  /** Called when recording stops */
  onRecordingEnd?: () => void;
  className?: string;
}

export default function VoiceInputButton({
  onTranscript,
  onInterim,
  onRecordingStart,
  onRecordingEnd,
  className = "",
}: VoiceInputButtonProps) {
  const { interimText, isRecording, startRecording, stopRecording } =
    useSpeechToText();
  // Push interim updates to parent via effect (refs can't be accessed during render)
  useEffect(() => {
    onInterim?.(interimText);
  }, [interimText, onInterim]);

  const handlePointerDown = useCallback(
    async (e: React.PointerEvent) => {
      e.preventDefault(); // Prevent text selection on mobile
      onRecordingStart?.();
      await startRecording();
    },
    [startRecording, onRecordingStart]
  );

  const handlePointerUp = useCallback(() => {
    if (!isRecording) return;
    const text = stopRecording();
    onRecordingEnd?.();
    if (text) {
      onTranscript(text);
    }
  }, [isRecording, stopRecording, onTranscript, onRecordingEnd]);

  return (
    <motion.button
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp} // Handle finger sliding off
      onContextMenu={(e) => e.preventDefault()} // Prevent long-press menu on mobile
      animate={
        isRecording
          ? { scale: [1, 1.1, 1], backgroundColor: "#EF4444" }
          : { scale: 1, backgroundColor: "var(--border)" }
      }
      transition={
        isRecording
          ? { scale: { duration: 0.8, repeat: Infinity }, backgroundColor: { duration: 0.15 } }
          : { duration: 0.15 }
      }
      className={`shrink-0 p-2 rounded-lg transition-colors select-none touch-none ${
        isRecording
          ? "text-white"
          : "text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"
      } ${className}`}
      title="Hold to speak"
      aria-label={isRecording ? "Recording — release to stop" : "Hold to speak"}
    >
      <Mic className="h-5 w-5" />
    </motion.button>
  );
}

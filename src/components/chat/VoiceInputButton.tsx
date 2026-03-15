"use client";

import { useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { Mic, MicOff } from "lucide-react";
import { useSpeechToText } from "@/hooks/useSpeechToText";

interface VoiceInputButtonProps {
  /** Called with final transcript text when user stops recording */
  onTranscript: (text: string) => void;
  /** Called with interim text while recording — for live preview */
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

  // Push interim updates to parent via effect
  useEffect(() => {
    onInterim?.(interimText);
  }, [interimText, onInterim]);

  const handleClick = useCallback(async () => {
    if (isRecording) {
      // Stop recording and get final text
      const text = stopRecording();
      onRecordingEnd?.();
      if (text) {
        onTranscript(text);
      }
    } else {
      // Start recording
      onRecordingStart?.();
      await startRecording();
    }
  }, [isRecording, startRecording, stopRecording, onTranscript, onRecordingStart, onRecordingEnd]);

  return (
    <motion.button
      onClick={handleClick}
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
      className={`shrink-0 p-2 rounded-lg transition-colors select-none ${
        isRecording
          ? "text-white"
          : "text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"
      } ${className}`}
      title={isRecording ? "Tap to stop" : "Tap to speak"}
      aria-label={isRecording ? "Recording — tap to stop" : "Tap to speak"}
    >
      {isRecording ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
    </motion.button>
  );
}

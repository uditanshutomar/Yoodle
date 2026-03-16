"use client";

import { useState, useCallback, useRef, useEffect } from "react";

export interface UseTranscriptionReturn {
  transcriptText: string;
  isTranscribing: boolean;
  startTranscription: () => void;
  stopTranscription: () => void;
}

/**
 * VAD-driven background transcription hook.
 *
 * Instead of recording fixed 3-second chunks (wasteful + cuts mid-word),
 * this listens to the voice activity detection signal (`isSpeaking`) and
 * records only while the user is actually talking. When they stop speaking,
 * the recorded segment is POSTed to /api/transcription.
 *
 * Benefits:
 * - No wasted API calls during silence
 * - Natural sentence boundaries → better transcription quality
 * - Speaker attribution is accurate (we know exactly who was speaking)
 *
 * A safety cap of 30 seconds per segment prevents runaway recordings
 * (e.g. background noise keeping VAD active). If the cap is hit the
 * chunk is sent and a new recording starts immediately.
 */
export function useTranscription(
  localStream: MediaStream | null,
  meetingId: string,
  userId: string,
  userName: string,
  isAudioEnabled: boolean,
  isLivekitConnected: boolean,
  isSpeaking: boolean,
  enabled: boolean = true,
): UseTranscriptionReturn {
  const [transcriptText, setTranscriptText] = useState("");
  const [isTranscribing, setIsTranscribing] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const localStreamRef = useRef<MediaStream | null>(null);
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isEnabledRef = useRef(false);
  const isMountedRef = useRef(true);

  /** Max duration per segment (prevents runaway recording). */
  const MAX_SEGMENT_MS = 30_000;

  // Keep stream ref in sync
  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  // ── Send a recorded audio blob to the transcription API ───────────

  const sendChunk = useCallback(
    async (blob: Blob) => {
      // Skip near-silent chunks (< 1 KB is essentially silence)
      if (blob.size < 1000) return;

      const formData = new FormData();
      formData.append("audio", blob, "chunk.webm");
      formData.append("meetingId", meetingId);
      formData.append("speakerName", userName);
      formData.append("speakerId", userId);
      formData.append("timestamp", String(Date.now()));

      try {
        const res = await fetch("/api/transcription", {
          method: "POST",
          credentials: "include",
          body: formData,
        });

        if (res.ok && isMountedRef.current) {
          const data = await res.json();
          const text = data.data?.text;
          if (text) {
            setTranscriptText((prev) => {
              const next = prev ? `${prev} ${text}` : text;
              // Cap at 100KB to prevent unbounded growth in long meetings
              return next.length > 100_000
                ? next.slice(-100_000)
                : next;
            });
          }
        }
      } catch {
        // Transcription is best-effort — silent fail
      }
    },
    [meetingId, userId, userName],
  );

  // ── Stop and flush the current recorder ───────────────────────────

  const stopAndFlush = useCallback(() => {
    if (safetyTimerRef.current) {
      clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }

    const recorder = recorderRef.current;
    if (recorder && recorder.state === "recording") {
      recorder.stop(); // triggers onstop → sendChunk
    }
    recorderRef.current = null;
  }, []);

  // ── Start recording a new segment ─────────────────────────────────
  // Use a ref so the safety timer can call startSegment without a
  // circular useCallback dependency (startSegment → startSegment).
  const startSegmentRef = useRef<() => void>(() => {});

  const startSegment = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const track = stream.getAudioTracks()[0];
    if (!track || !track.enabled) return;

    const audioStream = new MediaStream([track]);
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";

    const recorder = new MediaRecorder(audioStream, { mimeType });
    chunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      if (chunksRef.current.length === 0) return;
      const blob = new Blob(chunksRef.current, { type: mimeType });
      chunksRef.current = [];
      void sendChunk(blob);
    };

    recorder.start();
    recorderRef.current = recorder;

    // Safety cap — if someone talks for 30+ seconds non-stop, flush
    // the current segment and start a new one immediately.
    safetyTimerRef.current = setTimeout(() => {
      stopAndFlush();
      // If still speaking, start a new segment right away
      if (isEnabledRef.current) {
        startSegmentRef.current();
      }
    }, MAX_SEGMENT_MS);
  }, [sendChunk, stopAndFlush]);

  // Keep ref in sync
  useEffect(() => {
    startSegmentRef.current = startSegment;
  }, [startSegment]);

  // ── React to VAD isSpeaking changes ───────────────────────────────

  useEffect(() => {
    if (!enabled || !isLivekitConnected || !isAudioEnabled || !localStream || !userId) {
      isEnabledRef.current = false;
      stopAndFlush();
      queueMicrotask(() => {
        if (!isEnabledRef.current) setIsTranscribing(false);
      });
      return;
    }

    isEnabledRef.current = true;

    // Use a microtask to avoid synchronous setState in effect body
    queueMicrotask(() => {
      if (isEnabledRef.current) setIsTranscribing(true);
    });

    if (isSpeaking) {
      // User started speaking — begin recording if not already
      if (!recorderRef.current || recorderRef.current.state !== "recording") {
        startSegment();
      }
    } else {
      // User stopped speaking — flush the segment
      stopAndFlush();
    }

    return () => {
      // Don't cleanup here — we only want to stop when the whole
      // effect deps change (audio disabled, disconnected, etc.)
    };
  }, [
    enabled,
    isSpeaking,
    isAudioEnabled,
    isLivekitConnected,
    localStream,
    userId,
    startSegment,
    stopAndFlush,
  ]);

  // ── Cleanup on unmount ────────────────────────────────────────────

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (safetyTimerRef.current) {
        clearTimeout(safetyTimerRef.current);
        safetyTimerRef.current = null;
      }
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
      }
      recorderRef.current = null;
    };
  }, []);

  // ── Manual start/stop (for future UI toggle) ──────────────────────

  const startTranscription = useCallback(() => {
    setIsTranscribing(true);
  }, []);

  const stopTranscription = useCallback(() => {
    stopAndFlush();
    setIsTranscribing(false);
  }, [stopAndFlush]);

  return {
    transcriptText,
    isTranscribing,
    startTranscription,
    stopTranscription,
  };
}

"use client";

import { useState, useCallback, useRef, useEffect } from "react";

export interface UseTranscriptionReturn {
  transcriptText: string;
  isTranscribing: boolean;
  startTranscription: () => void;
  stopTranscription: () => void;
}

/**
 * Background transcription hook.
 *
 * Captures the local microphone in 3-second chunks and POSTs each chunk
 * to /api/transcription so every participant contributes to the same
 * meeting transcript. No captions UI -- just silent background capture.
 */
export function useTranscription(
  localStream: MediaStream | null,
  meetingId: string,
  userId: string,
  userName: string,
  isAudioEnabled: boolean,
  isConnected: boolean
): UseTranscriptionReturn {
  const [transcriptText, setTranscriptText] = useState("");
  const [isTranscribing, setIsTranscribing] = useState(false);

  const transcriptionRecorderRef = useRef<MediaRecorder | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keep stream ref in sync
  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  // ── Automatic background transcription ─────────────────────────────
  //
  // Each participant captures their OWN mic in 3-second chunks and
  // POSTs to /api/transcription with their name/ID. The API stores
  // every segment under the same meetingId so everyone shares one
  // transcript afterwards.

  useEffect(() => {
    if (!isConnected || !isAudioEnabled || !localStream || !userId) return;

    const audioTrack = localStream.getAudioTracks()[0];
    if (!audioTrack) return;

    // Use a microtask to avoid synchronous setState in effect body
    let active = true;
    queueMicrotask(() => {
      if (active) setIsTranscribing(true);
    });

    const captureAndSend = () => {
      const stream = localStreamRef.current;
      if (!stream) return;
      const track = stream.getAudioTracks()[0];
      if (!track || !track.enabled) return;

      const audioStream = new MediaStream([track]);
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(audioStream, { mimeType });
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        if (chunks.length === 0) return;
        const blob = new Blob(chunks, { type: mimeType });

        // Skip silent chunks (< 1 KB is essentially silence)
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

          if (res.ok) {
            const data = await res.json();
            if (data.text) {
              setTranscriptText((prev) =>
                prev ? `${prev} ${data.text}` : data.text
              );
            }
          }
        } catch {
          // Transcription is best-effort -- silent fail
        }
      };

      recorder.start();
      transcriptionRecorderRef.current = recorder;

      setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
      }, 3000);
    };

    // Start immediately, then every 3.5s (3s record + 0.5s gap)
    captureAndSend();
    intervalRef.current = setInterval(captureAndSend, 3500);

    return () => {
      active = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (transcriptionRecorderRef.current?.state === "recording") {
        transcriptionRecorderRef.current.stop();
      }
      setIsTranscribing(false);
    };
  }, [isAudioEnabled, isConnected, localStream, userId, userName, meetingId]);

  // ── Manual start/stop (for future UI toggle) ──────────────────────

  const startTranscription = useCallback(() => {
    // Currently handled automatically by the effect above.
    // This is a placeholder for explicit start control.
    setIsTranscribing(true);
  }, []);

  const stopTranscription = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (transcriptionRecorderRef.current?.state === "recording") {
      transcriptionRecorderRef.current.stop();
    }
    setIsTranscribing(false);
  }, []);

  return {
    transcriptText,
    isTranscribing,
    startTranscription,
    stopTranscription,
  };
}

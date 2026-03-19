"use client";

import { useEffect, useRef, useState } from "react";

const WARNING_COOLDOWN_MS = 30_000;
const WARNING_DISPLAY_MS = 4_000;
const SPEAKING_THRESHOLD = 0.15;
const SPEAKING_DURATION_MS = 1_000;

/**
 * Detects when a user is trying to speak while muted.
 * Uses the Web Audio API to monitor audio levels even when the mic track is "muted"
 * (track.enabled = false). If audio activity is detected while muted for >1s,
 * shows a warning. Rate-limited to once per 30s.
 */
export function useMutedWarning(
  localStream: MediaStream | null,
  isAudioEnabled: boolean,
): boolean {
  const [showWarning, setShowWarning] = useState(false);
  const lastWarningRef = useRef(0);
  const speakingStartRef = useRef<number | null>(null);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isAudioEnabled || !localStream) {
      speakingStartRef.current = null;
      return;
    }

    const audioTrack = localStream.getAudioTracks()[0];
    if (!audioTrack) return;

    // Create a separate stream that's always enabled for monitoring
    const monitorStream = new MediaStream([audioTrack.clone()]);
    const monitorTrack = monitorStream.getAudioTracks()[0];
    monitorTrack.enabled = true;

    let audioContext: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let animationId: number | null = null;

    try {
      audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(monitorStream);
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      function checkAudio(): void {
        if (!analyser) return;
        analyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        const normalizedLevel = average / 255;

        if (normalizedLevel > SPEAKING_THRESHOLD) {
          if (!speakingStartRef.current) {
            speakingStartRef.current = Date.now();
          } else if (
            Date.now() - speakingStartRef.current >
            SPEAKING_DURATION_MS
          ) {
            const now = Date.now();
            if (now - lastWarningRef.current > WARNING_COOLDOWN_MS) {
              lastWarningRef.current = now;
              setShowWarning(true);
              if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
              warningTimerRef.current = setTimeout(() => {
                warningTimerRef.current = null;
                setShowWarning(false);
              }, WARNING_DISPLAY_MS);
            }
            speakingStartRef.current = null;
          }
        } else {
          speakingStartRef.current = null;
        }

        animationId = requestAnimationFrame(checkAudio);
      }

      checkAudio();
    } catch {
      // AudioContext not available — stop the cloned track to avoid
      // leaking a live mic stream that would never be cleaned up.
      monitorTrack.stop();
      return;
    }

    return () => {
      if (animationId !== null) cancelAnimationFrame(animationId);
      if (warningTimerRef.current) {
        clearTimeout(warningTimerRef.current);
        warningTimerRef.current = null;
      }
      monitorTrack.stop();
      if (audioContext && audioContext.state !== "closed") {
        audioContext.close().catch(() => {});
      }
    };
  }, [isAudioEnabled, localStream]);

  // Automatically hide warning when audio is re-enabled (avoids setState in effect body)
  return showWarning && !isAudioEnabled;
}

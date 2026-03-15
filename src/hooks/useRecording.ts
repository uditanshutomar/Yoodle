"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { Room } from "livekit-client";
import { useDataChannel } from "./useDataChannel";
import {
  DataMessageType,
  type RecordingStatusData,
  type DataMessage,
} from "@/lib/livekit/data-messages";
import { type SpeechSegment } from "@/hooks/useVoiceActivity";

export interface UseRecordingReturn {
  isRecording: boolean;
  startRecording: () => void;
  stopRecording: () => void;
  recordingDuration: number;
  error: string | null;
  clearError: () => void;
}

/**
 * Manages meeting recording via browser tab capture (getDisplayMedia).
 *
 * When the user clicks "Record", the browser prompts them to share their
 * tab. The recording then captures exactly what they see on screen —
 * all participants, screen shares, chat, etc. — plus mixed audio from
 * every participant via Web Audio API.
 *
 * Uses LiveKit data channels to broadcast recording status to all
 * participants so everyone sees the recording indicator.
 */
export function useRecording(
  localStream: MediaStream | null,
  remoteStreams: Map<string, MediaStream>,
  meetingId: string,
  room: Room | null,
  speechSegmentsRef: React.RefObject<SpeechSegment[]>,
): UseRecordingReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const { sendReliable, onMessage } = useDataChannel(room);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mixedDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const audioSourcesRef = useRef<MediaStreamAudioSourceNode[]>([]);
  const clonedTracksRef = useRef<MediaStreamTrack[]>([]);
  const displayStreamRef = useRef<MediaStream | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(remoteStreams);

  // Keep refs in sync
  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);
  useEffect(() => {
    remoteStreamsRef.current = remoteStreams;
  }, [remoteStreams]);

  // Listen for recording status from other participants
  useEffect(() => {
    const unsub = onMessage(
      DataMessageType.RECORDING_STATUS,
      (msg: DataMessage) => {
        if (msg.type !== DataMessageType.RECORDING_STATUS) return;
        const data = msg as RecordingStatusData;
        setIsRecording(data.isRecording);
      },
    );
    return unsub;
  }, [onMessage]);

  // ── Internal stop (also called when user clicks browser "Stop sharing") ─

  const stopRecordingInternal = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setIsRecording(false);
    setRecordingDuration(0);
  }, []);

  // ── Start recording ────────────────────────────────────────────────

  const startRecording = useCallback(async () => {
    try {
      // ── Step 1: Capture the browser tab via getDisplayMedia ───────
      // This prompts the user to pick their tab. The resulting stream
      // contains the tab's video (everything they see) and optionally
      // system audio from that tab.
      let displayStream: MediaStream;
      try {
        displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            // Prefer current tab capture for best experience
            displaySurface: "browser",
          } as MediaTrackConstraints,
          audio: true, // capture tab audio if available
          // Chrome-specific: prefer current tab
          preferCurrentTab: true,
        } as DisplayMediaStreamOptions);
      } catch {
        // User cancelled the picker or browser doesn't support it
        setError(
          "Recording requires screen sharing permission. Please select your browser tab when prompted.",
        );
        return;
      }

      displayStreamRef.current = displayStream;

      // If the user stops sharing via the browser's native "Stop sharing"
      // button, cleanly stop the recording.
      const displayVideoTrack = displayStream.getVideoTracks()[0];
      if (displayVideoTrack) {
        displayVideoTrack.onended = () => {
          stopRecordingInternal();
        };
      }

      // ── Step 2: Mix all participant audio via Web Audio API ───────
      const audioCtx = new AudioContext();
      audioContextRef.current = audioCtx;

      if (audioCtx.state === "suspended") {
        void audioCtx.resume();
      }

      const dest = audioCtx.createMediaStreamDestination();
      mixedDestRef.current = dest;
      const sources: MediaStreamAudioSourceNode[] = [];
      const clonedTracks: MediaStreamTrack[] = [];

      // Add local mic audio (cloned so mute/unmute doesn't affect recording).
      // The local user's <video> is muted={isSelf}, so tab audio does NOT
      // include it — we always need to mix it in explicitly.
      if (localStreamRef.current) {
        const localAudioTracks = localStreamRef.current.getAudioTracks();
        if (localAudioTracks.length > 0) {
          const clonedTrack = localAudioTracks[0].clone();
          clonedTrack.enabled = true;
          clonedTracks.push(clonedTrack);
          const localSource = audioCtx.createMediaStreamSource(
            new MediaStream([clonedTrack]),
          );
          localSource.connect(dest);
          sources.push(localSource);
        }
      }

      // Tab audio from getDisplayMedia already contains all remote
      // participant audio (LiveKit plays remote tracks through <video>
      // elements in the tab, and getDisplayMedia captures the tab's
      // audio output).  Adding remote tracks again would double-mix
      // and cause reverb/echo.  Only fall back to individual remote
      // stream mixing when the tab provides no audio track.
      const displayAudioTracks = displayStream.getAudioTracks();
      const hasTabAudio = displayAudioTracks.length > 0;

      if (hasTabAudio) {
        // Use tab audio for all remote participant audio
        for (const displayAudio of displayAudioTracks) {
          const displaySource = audioCtx.createMediaStreamSource(
            new MediaStream([displayAudio]),
          );
          displaySource.connect(dest);
          sources.push(displaySource);
        }
      } else {
        // No tab audio — mix remote streams individually as fallback
        remoteStreamsRef.current.forEach((stream) => {
          const audioTracks = stream.getAudioTracks();
          if (audioTracks.length > 0) {
            const remoteSource = audioCtx.createMediaStreamSource(
              new MediaStream(audioTracks),
            );
            remoteSource.connect(dest);
            sources.push(remoteSource);
          }
        });
      }

      audioSourcesRef.current = sources;
      clonedTracksRef.current = clonedTracks;

      // ── Step 3: Combine tab video + mixed audio into one stream ──
      const combinedStream = new MediaStream([
        // Tab video (shows the full meeting UI)
        ...displayStream.getVideoTracks(),
        // Mixed audio from all participants + tab audio
        ...dest.stream.getTracks(),
      ]);

      const mimeType = MediaRecorder.isTypeSupported(
        "video/webm;codecs=vp9,opus",
      )
        ? "video/webm;codecs=vp9,opus"
        : MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
          ? "video/webm;codecs=vp8,opus"
          : "video/webm";

      const recorder = new MediaRecorder(combinedStream, { mimeType });
      recordedChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(recordedChunksRef.current, { type: mimeType });

        const segments = (speechSegmentsRef.current ?? []).map((seg) => ({
          speakerId: seg.peerId,
          speakerName: seg.speakerName,
          startTime: seg.startTime,
          endTime: seg.endTime,
        }));

        try {
          const formData = new FormData();
          formData.append(
            "file",
            blob,
            `recording.${mimeType.includes("webm") ? "webm" : "mp4"}`,
          );
          formData.append("meetingId", meetingId);
          if (segments.length > 0) {
            formData.append("speechSegments", JSON.stringify(segments));
          }

          const uploadRes = await fetch("/api/recordings/upload", {
            method: "POST",
            credentials: "include",
            body: formData,
          });

          if (!uploadRes.ok) {
            setError(
              "Cloud upload failed. Recording saved locally instead.",
            );
            downloadRecording(blob);
          }
        } catch {
          setError("Cloud upload failed. Recording saved locally instead.");
          downloadRecording(blob);
        }

        // Cleanup audio sources
        for (const source of audioSourcesRef.current) {
          try {
            source.disconnect();
          } catch {
            /* already disconnected */
          }
        }
        audioSourcesRef.current = [];

        // Stop cloned tracks to release hardware resources
        for (const t of clonedTracksRef.current) {
          t.stop();
        }
        clonedTracksRef.current = [];

        // Stop display capture tracks
        displayStreamRef.current
          ?.getTracks()
          .forEach((t) => t.stop());
        displayStreamRef.current = null;

        audioContextRef.current?.close();
        audioContextRef.current = null;
        mixedDestRef.current = null;
      };

      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);

      setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);

      // Broadcast recording status via data channel
      void sendReliable({
        type: DataMessageType.RECORDING_STATUS,
        isRecording: true,
        startedAt: Date.now(),
      });
    } catch {
      setError(
        "Failed to start recording. Please check your permissions.",
      );
    }
  }, [meetingId, sendReliable, speechSegmentsRef, stopRecordingInternal]);

  // ── Stop recording (user-facing — also broadcasts status) ─────────

  const stopRecording = useCallback(() => {
    stopRecordingInternal();

    void sendReliable({
      type: DataMessageType.RECORDING_STATUS,
      isRecording: false,
    });
  }, [sendReliable, stopRecordingInternal]);

  // ── Cleanup on unmount ─────────────────────────────────────────────

  useEffect(() => {
    return () => {
      for (const source of audioSourcesRef.current) {
        try {
          source.disconnect();
        } catch {
          /* already disconnected */
        }
      }
      audioSourcesRef.current = [];
      for (const t of clonedTracksRef.current) {
        t.stop();
      }
      clonedTracksRef.current = [];
      displayStreamRef.current?.getTracks().forEach((t) => t.stop());
      displayStreamRef.current = null;
      audioContextRef.current?.close();
      audioContextRef.current = null;
      mixedDestRef.current = null;
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  return {
    isRecording,
    startRecording,
    stopRecording,
    recordingDuration,
    error,
    clearError,
  };
}

// ── Helper: download recording blob locally ──────────────────────────

function downloadRecording(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `yoodle-recording-${Date.now()}.webm`;
  a.click();
  URL.revokeObjectURL(url);
}

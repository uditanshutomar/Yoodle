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
 * Manages meeting recording with mixed audio via Web Audio API.
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
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  // Keep localStreamRef in sync
  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

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

  // ── Start recording ────────────────────────────────────────────────

  const startRecording = useCallback(() => {
    try {
      const audioCtx = new AudioContext();
      audioContextRef.current = audioCtx;

      // Modern browsers start AudioContext in a suspended state.
      // We must resume it for the mixing destination to produce data.
      if (audioCtx.state === "suspended") {
        void audioCtx.resume();
      }

      const dest = audioCtx.createMediaStreamDestination();
      mixedDestRef.current = dest;
      const sources: MediaStreamAudioSourceNode[] = [];

      // Add local audio — use a *clone* of the track so that
      // toggling track.enabled on the original (mute/unmute) does
      // not cut audio to the recording destination.
      if (localStreamRef.current) {
        const localAudioTracks = localStreamRef.current.getAudioTracks();
        if (localAudioTracks.length > 0) {
          const clonedTrack = localAudioTracks[0].clone();
          // Ensure the cloned track is always enabled for recording
          clonedTrack.enabled = true;
          const localSource = audioCtx.createMediaStreamSource(
            new MediaStream([clonedTrack]),
          );
          localSource.connect(dest);
          sources.push(localSource);
        }
      }

      // Add all remote audio
      remoteStreams.forEach((stream) => {
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length > 0) {
          const remoteSource = audioCtx.createMediaStreamSource(
            new MediaStream(audioTracks),
          );
          remoteSource.connect(dest);
          sources.push(remoteSource);
        }
      });

      audioSourcesRef.current = sources;

      // Combine mixed audio + local video
      const videoTrack = localStreamRef.current?.getVideoTracks()[0];
      const combinedStream = new MediaStream([
        ...dest.stream.getTracks(),
        ...(videoTrack ? [videoTrack] : []),
      ]);

      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
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
          formData.append("file", blob, `recording.${mimeType.includes("webm") ? "webm" : "mp4"}`);
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
            setError("Cloud upload failed. Recording saved locally instead.");
            downloadRecording(blob);
          }
        } catch {
          setError("Cloud upload failed. Recording saved locally instead.");
          downloadRecording(blob);
        }

        for (const source of audioSourcesRef.current) {
          try {
            source.disconnect();
          } catch {
            /* already disconnected */
          }
        }
        audioSourcesRef.current = [];
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
      setError("Failed to start recording. Please check your microphone/camera permissions.");
    }
  }, [meetingId, remoteStreams, sendReliable, speechSegmentsRef]);

  // ── Stop recording ─────────────────────────────────────────────────

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setIsRecording(false);
    setRecordingDuration(0);

    void sendReliable({
      type: DataMessageType.RECORDING_STATUS,
      isRecording: false,
    });
  }, [sendReliable]);

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

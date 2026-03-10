"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Socket } from "socket.io-client";
import { SOCKET_EVENTS, type RecordingStatusPayload } from "@/lib/realtime/socket-events";
import { type SpeechSegment } from "@/hooks/useVoiceActivity";

export interface UseRecordingReturn {
  isRecording: boolean;
  startRecording: () => void;
  stopRecording: () => void;
  recordingDuration: number;
}

/**
 * Manages meeting recording with mixed audio via Web Audio API.
 *
 * Captures local video + mixed (local + all remote) audio into a single
 * MediaRecorder, then uploads the resulting blob via a pre-signed URL or
 * falls back to a local download.
 *
 * Bug #5 fix: emits RECORDING_START socket event after recorder.start()
 * so all participants see the recording indicator.
 */
export function useRecording(
  localStream: MediaStream | null,
  remoteStreams: Map<string, MediaStream>,
  meetingId: string,
  socket: Socket | null,
  speechSegmentsRef: React.RefObject<SpeechSegment[]>
): UseRecordingReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);

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

  // Listen for recording status broadcasts from other participants
  useEffect(() => {
    if (!socket) return;

    const handleRecordingStatus = (payload: RecordingStatusPayload) => {
      setIsRecording(payload.isRecording);
    };

    socket.on(SOCKET_EVENTS.RECORDING_STATUS, handleRecordingStatus);

    return () => {
      socket.off(SOCKET_EVENTS.RECORDING_STATUS, handleRecordingStatus);
    };
  }, [socket]);

  // ── Start recording ────────────────────────────────────────────────

  const startRecording = useCallback(() => {
    try {
      const audioCtx = new AudioContext();
      const dest = audioCtx.createMediaStreamDestination();
      audioContextRef.current = audioCtx;
      mixedDestRef.current = dest;
      const sources: MediaStreamAudioSourceNode[] = [];

      // Add local audio
      if (localStreamRef.current) {
        const localAudioTracks = localStreamRef.current.getAudioTracks();
        if (localAudioTracks.length > 0) {
          const localSource = audioCtx.createMediaStreamSource(
            new MediaStream(localAudioTracks)
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
            new MediaStream(audioTracks)
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

        // Capture speech segments for speaker-attributed transcript
        const segments = (speechSegmentsRef.current ?? []).map((seg) => ({
          speakerId: seg.peerId,
          speakerName: seg.speakerName,
          startTime: seg.startTime,
          endTime: seg.endTime,
        }));

        // Upload to Google Drive via our API
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
            // Google Drive upload failed — fall back to local download
            downloadRecording(blob);
          }
        } catch {
          downloadRecording(blob);
        }

        // Clean up audio context and sources
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

      // Start duration timer
      setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);

      // Bug #5 fix: broadcast recording status AFTER recorder.start()
      if (socket) {
        socket.emit(SOCKET_EVENTS.RECORDING_START, {
          roomId: meetingId,
          isRecording: true,
        });
      }
    } catch (err) {
      console.error("[Recording] Failed to start:", err);
    }
  }, [meetingId, remoteStreams, socket, speechSegmentsRef]);

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

    // Broadcast stop to other participants
    if (socket) {
      socket.emit(SOCKET_EVENTS.RECORDING_STOP, {
        roomId: meetingId,
        isRecording: false,
      });
    }
  }, [socket, meetingId]);

  // ── Cleanup on unmount ─────────────────────────────────────────────

  useEffect(() => {
    return () => {
      // Read refs at cleanup time (not at mount time) to get current values
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

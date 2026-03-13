"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { Room } from "livekit-client";
import { RoomEvent, type Participant } from "livekit-client";
import { useDataChannel } from "./useDataChannel";
import {
  DataMessageType,
  type SpeakingStartData,
  type SpeakingStopData,
  type DataMessage,
} from "@/lib/livekit/data-messages";

export interface SpeechSegment {
  peerId: string;
  speakerName: string;
  startTime: number;
  endTime: number;
}

export interface UseVoiceActivityReturn {
  isSpeaking: boolean;
  audioLevel: number;
  speechSegments: SpeechSegment[];
  remoteSpeakingPeers: Set<string>;
  startMonitoring: (stream: MediaStream) => void;
  stopMonitoring: () => void;
}

interface UseVoiceActivityOptions {
  room: Room | null;
  userId: string;
  userName: string;
  /** Volume threshold to consider speaking (0-1). Default: 0.15 */
  speakingThreshold?: number;
  /** Minimum duration in ms to consider speech has started. Default: 200 */
  speakingStartDelay?: number;
  /** Duration of silence in ms before considering speech has stopped. Default: 500 */
  silenceTimeout?: number;
  /** How often to sample audio in ms. Default: 100 */
  sampleInterval?: number;
}

export function useVoiceActivity({
  room,
  userId,
  userName,
  speakingThreshold = 0.15,
  speakingStartDelay = 200,
  silenceTimeout = 500,
  sampleInterval = 100,
}: UseVoiceActivityOptions): UseVoiceActivityReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [speechSegments, setSpeechSegments] = useState<SpeechSegment[]>([]);
  const [remoteSpeakingPeers, setRemoteSpeakingPeers] = useState<Set<string>>(
    new Set(),
  );

  const { sendLossy, onMessage } = useDataChannel(room);

  // Refs for audio analysis
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Refs for speaking detection state
  const isSpeakingRef = useRef(false);
  const speakingStartTimeRef = useRef<number | null>(null);
  const aboveThresholdSinceRef = useRef<number | null>(null);
  const lastAboveThresholdRef = useRef<number>(0);

  // ── LiveKit native: remote speaker detection ──────────────────────

  useEffect(() => {
    if (!room) return;

    const handleActiveSpeakers = (speakers: Participant[]) => {
      const ids = new Set(
        speakers
          .filter((p) => p.identity !== userId)
          .map((p) => p.identity),
      );
      setRemoteSpeakingPeers(ids);
    };

    room.on(RoomEvent.ActiveSpeakersChanged, handleActiveSpeakers);
    return () => {
      room.off(RoomEvent.ActiveSpeakersChanged, handleActiveSpeakers);
    };
  }, [room, userId]);

  // ── Listen for remote speech segments (for transcript attribution) ─

  useEffect(() => {
    const unsub = onMessage(
      DataMessageType.SPEAKING_STOP,
      (msg: DataMessage) => {
        if (msg.type !== DataMessageType.SPEAKING_STOP) return;
        // We receive SPEAKING_STOP with the segment's start time from a data message
        // but we need to pair it with the corresponding SPEAKING_START
        // For simplicity, we'll store segments when we get stop messages
      },
    );
    return unsub;
  }, [onMessage]);

  // ── Speech segment tracking from remote data messages ──────────────

  const remoteSpeakingStartRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const unsubStart = onMessage(
      DataMessageType.SPEAKING_START,
      (msg: DataMessage, senderId: string) => {
        if (msg.type !== DataMessageType.SPEAKING_START) return;
        const data = msg as SpeakingStartData;
        if (data.userId === userId) return;
        remoteSpeakingStartRef.current.set(senderId, data.timestamp);
      },
    );

    const unsubStop = onMessage(
      DataMessageType.SPEAKING_STOP,
      (msg: DataMessage, senderId: string) => {
        if (msg.type !== DataMessageType.SPEAKING_STOP) return;
        const data = msg as SpeakingStopData;
        if (data.userId === userId) return;

        const startTime = remoteSpeakingStartRef.current.get(senderId);
        remoteSpeakingStartRef.current.delete(senderId);

        if (startTime) {
          const segment: SpeechSegment = {
            peerId: data.userId,
            speakerName: senderId, // best-effort
            startTime,
            endTime: data.timestamp,
          };
          setSpeechSegments((prev) => {
            const next = [...prev, segment];
            return next.length > 500 ? next.slice(-500) : next;
          });
        }
      },
    );

    return () => {
      unsubStart();
      unsubStop();
    };
  }, [onMessage, userId]);

  // ── Local speech start/stop ─────────────────────────────────────────

  const onSpeakingStart = useCallback(() => {
    const now = Date.now();
    isSpeakingRef.current = true;
    speakingStartTimeRef.current = now;
    setIsSpeaking(true);

    void sendLossy({
      type: DataMessageType.SPEAKING_START,
      userId,
      timestamp: now,
    });
  }, [sendLossy, userId]);

  const onSpeakingStop = useCallback(() => {
    const now = Date.now();
    const startTime = speakingStartTimeRef.current;

    isSpeakingRef.current = false;
    speakingStartTimeRef.current = null;
    aboveThresholdSinceRef.current = null;
    setIsSpeaking(false);

    if (startTime) {
      const segment: SpeechSegment = {
        peerId: userId,
        speakerName: userName,
        startTime,
        endTime: now,
      };
      setSpeechSegments((prev) => {
        const next = [...prev, segment];
        return next.length > 500 ? next.slice(-500) : next;
      });

      void sendLossy({
        type: DataMessageType.SPEAKING_STOP,
        userId,
        timestamp: now,
      });
    }
  }, [sendLossy, userId, userName]);

  // ── Audio analysis ──────────────────────────────────────────────────

  const analyzeAudio = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      sum += dataArray[i];
    }
    const average = sum / bufferLength;
    const normalizedLevel = Math.min(average / 255, 1);

    setAudioLevel(normalizedLevel);

    const now = Date.now();
    const isAboveThreshold = normalizedLevel > speakingThreshold;

    if (isAboveThreshold) {
      lastAboveThresholdRef.current = now;

      if (!isSpeakingRef.current) {
        if (aboveThresholdSinceRef.current === null) {
          aboveThresholdSinceRef.current = now;
        }
        if (now - aboveThresholdSinceRef.current >= speakingStartDelay) {
          onSpeakingStart();
        }
      }
    } else {
      if (!isSpeakingRef.current) {
        aboveThresholdSinceRef.current = null;
      } else {
        if (now - lastAboveThresholdRef.current >= silenceTimeout) {
          onSpeakingStop();
        }
      }
    }
  }, [
    speakingThreshold,
    speakingStartDelay,
    silenceTimeout,
    onSpeakingStart,
    onSpeakingStop,
  ]);

  // ── Internal stop ───────────────────────────────────────────────────

  const stopMonitoringInternal = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    analyserRef.current = null;
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (isSpeakingRef.current) {
      onSpeakingStop();
    }
    setAudioLevel(0);
  }, [onSpeakingStop]);

  // ── Start monitoring ────────────────────────────────────────────────

  const startMonitoring = useCallback(
    (stream: MediaStream) => {
      stopMonitoringInternal();
      try {
        const audioContext = new AudioContext();
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.5;
        analyser.minDecibels = -90;
        analyser.maxDecibels = -10;

        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);

        audioContextRef.current = audioContext;
        analyserRef.current = analyser;
        sourceRef.current = source;

        intervalRef.current = setInterval(analyzeAudio, sampleInterval);
      } catch {
        // Non-critical — silently ignored
      }
    },
    [analyzeAudio, sampleInterval, stopMonitoringInternal],
  );

  const stopMonitoring = useCallback(() => {
    stopMonitoringInternal();
  }, [stopMonitoringInternal]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopMonitoringInternal();
    };
  }, [stopMonitoringInternal]);

  return {
    isSpeaking,
    audioLevel,
    speechSegments,
    remoteSpeakingPeers,
    startMonitoring,
    stopMonitoring,
  };
}

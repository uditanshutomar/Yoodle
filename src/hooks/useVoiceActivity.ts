"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Socket } from "socket.io-client";
import { SOCKET_EVENTS } from "@/lib/realtime/socket-events";

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
  socket: Socket | null;
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
  socket,
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
    new Set()
  );

  // Refs for audio analysis
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Refs for speaking detection state
  const isSpeakingRef = useRef(false);
  const prevIsSpeakingRef = useRef(false);
  const speakingStartTimeRef = useRef<number | null>(null);
  const aboveThresholdSinceRef = useRef<number | null>(null);
  const lastAboveThresholdRef = useRef<number>(0);

  /** Broadcast voice activity to other peers */
  const broadcastActivity = useCallback(
    (speaking: boolean, level: number) => {
      if (!socket || !userId) return;

      socket.emit(SOCKET_EVENTS.VOICE_ACTIVITY, {
        userId,
        isSpeaking: speaking,
        audioLevel: level,
      });
    },
    [socket, userId]
  );

  /** Mark the start of a new speech segment */
  const onSpeakingStart = useCallback(() => {
    const now = Date.now();
    isSpeakingRef.current = true;
    speakingStartTimeRef.current = now;
    setIsSpeaking(true);

    if (socket) {
      socket.emit(SOCKET_EVENTS.SPEAKING_START, {
        userId,
        speakerName: userName,
        startTime: now,
      });
    }
  }, [socket, userId, userName]);

  /** Mark the end of a speech segment and save metadata */
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

      if (socket) {
        socket.emit(SOCKET_EVENTS.SPEAKING_STOP, {
          userId,
          speakerName: userName,
          startTime,
          endTime: now,
        });
      }
    }
  }, [socket, userId, userName]);

  /** Analyze audio data from the AnalyserNode */
  const analyzeAudio = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    // Average all frequency data and normalize to 0-1
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
        // Track when we first go above threshold
        if (aboveThresholdSinceRef.current === null) {
          aboveThresholdSinceRef.current = now;
        }

        // If above threshold long enough, start speaking
        if (now - aboveThresholdSinceRef.current >= speakingStartDelay) {
          onSpeakingStart();
        }
      }
    } else {
      // Below threshold
      if (!isSpeakingRef.current) {
        // Reset the "above threshold since" tracker if not speaking yet
        aboveThresholdSinceRef.current = null;
      } else {
        // Currently speaking, check if silence has been long enough
        if (now - lastAboveThresholdRef.current >= silenceTimeout) {
          onSpeakingStop();
        }
      }
    }

    // Only broadcast on speaking state change (not every analysis loop)
    if (isSpeakingRef.current !== prevIsSpeakingRef.current) {
      broadcastActivity(isSpeakingRef.current, normalizedLevel);
      prevIsSpeakingRef.current = isSpeakingRef.current;
    }
  }, [
    speakingThreshold,
    speakingStartDelay,
    silenceTimeout,
    onSpeakingStart,
    onSpeakingStop,
    broadcastActivity,
  ]);

  /** Internal stop function — defined before startMonitoring to avoid forward reference */
  const stopMonitoringInternal = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }

    if (analyserRef.current) {
      analyserRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {
        // Ignore errors when closing
      });
      audioContextRef.current = null;
    }

    // End any active speech segment
    if (isSpeakingRef.current) {
      onSpeakingStop();
    }

    setAudioLevel(0);
  }, [onSpeakingStop]);

  /** Start monitoring an audio stream for voice activity */
  const startMonitoring = useCallback(
    (stream: MediaStream) => {
      // Stop any existing monitoring
      stopMonitoringInternal();

      try {
        const audioContext = new AudioContext();
        const analyser = audioContext.createAnalyser();

        // Configure the analyser for voice detection
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
        // Error starting voice monitoring — silently ignored (non-critical)
      }
    },
    [analyzeAudio, sampleInterval, stopMonitoringInternal]
  );

  /** Public stop function */
  const stopMonitoring = useCallback(() => {
    stopMonitoringInternal();
  }, [stopMonitoringInternal]);

  /** Listen for remote voice activity events */
  useEffect(() => {
    if (!socket) return;

    const handleRemoteVoiceActivity = (payload: {
      userId: string;
      isSpeaking: boolean;
      audioLevel: number;
    }) => {
      if (payload.userId === userId) return;

      setRemoteSpeakingPeers((prev) => {
        const next = new Set(prev);
        if (payload.isSpeaking) {
          next.add(payload.userId);
        } else {
          next.delete(payload.userId);
        }
        return next;
      });
    };

    const handleRemoteSpeakingStart = (payload: {
      userId: string;
      speakerName: string;
      startTime: number;
    }) => {
      if (payload.userId === userId) return;

      setRemoteSpeakingPeers((prev) => {
        const next = new Set(prev);
        next.add(payload.userId);
        return next;
      });
    };

    const handleRemoteSpeakingStop = (payload: {
      userId: string;
      speakerName: string;
      startTime: number;
      endTime: number;
    }) => {
      if (payload.userId === userId) return;

      setRemoteSpeakingPeers((prev) => {
        const next = new Set(prev);
        next.delete(payload.userId);
        return next;
      });

      // Store remote speech segments for transcript attribution
      const segment: SpeechSegment = {
        peerId: payload.userId,
        speakerName: payload.speakerName,
        startTime: payload.startTime,
        endTime: payload.endTime,
      };

      setSpeechSegments((prev) => {
        const next = [...prev, segment];
        return next.length > 500 ? next.slice(-500) : next;
      });
    };

    socket.on(SOCKET_EVENTS.VOICE_ACTIVITY, handleRemoteVoiceActivity);
    socket.on(SOCKET_EVENTS.SPEAKING_START, handleRemoteSpeakingStart);
    socket.on(SOCKET_EVENTS.SPEAKING_STOP, handleRemoteSpeakingStop);

    return () => {
      socket.off(SOCKET_EVENTS.VOICE_ACTIVITY, handleRemoteVoiceActivity);
      socket.off(SOCKET_EVENTS.SPEAKING_START, handleRemoteSpeakingStart);
      socket.off(SOCKET_EVENTS.SPEAKING_STOP, handleRemoteSpeakingStop);
    };
  }, [socket, userId]);

  /** Clean up on unmount */
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

"use client";

import { useState, useCallback, useRef } from "react";
import { toast } from "sonner";

export interface UseSpeechToTextReturn {
  /** Partial text while still recording — updates in real-time */
  interimText: string;
  /** Whether recording is active */
  isRecording: boolean;
  /** Start mic capture and open Deepgram stream */
  startRecording: () => Promise<void>;
  /** Stop mic, close stream, return final accumulated text */
  stopRecording: () => string;
}

/**
 * Hold-to-talk speech-to-text hook.
 *
 * Opens a direct WebSocket to Deepgram's streaming API using a
 * temporary API key from /api/stt/token. Audio chunks are sent
 * in real-time; interim results update `interimText` live.
 *
 * On stop, returns the accumulated final transcript text.
 */
export function useSpeechToText(): UseSpeechToTextReturn {
  const [interimText, setInterimText] = useState("");
  const [isRecording, setIsRecording] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const finalTextRef = useRef("");
  const isRecordingRef = useRef(false);

  const cleanup = useCallback(() => {
    // Stop media recorder
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;

    // Close WebSocket
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      // Send close message to Deepgram
      socketRef.current.send(JSON.stringify({ type: "CloseStream" }));
      socketRef.current.close();
    }
    socketRef.current = null;

    // Stop mic tracks
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    isRecordingRef.current = false;
    setIsRecording(false);
  }, []);

  const startRecording = useCallback(async () => {
    if (isRecordingRef.current) return;

    // Reset state
    finalTextRef.current = "";
    setInterimText("");

    // 1. Get mic stream
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast.error("Microphone access required");
      return;
    }
    streamRef.current = stream;

    // 2. Get temporary Deepgram key
    let apiKey: string;
    try {
      const res = await fetch("/api/stt/token", {
        method: "POST",
        credentials: "include",
      });
      const json = await res.json();
      apiKey = json.data?.key;
      if (!apiKey) throw new Error("No key returned");
    } catch {
      toast.error("Could not connect to speech service");
      cleanup();
      return;
    }

    // 3. Open Deepgram streaming WebSocket
    const params = new URLSearchParams({
      model: "nova-2",
      language: "en",
      smart_format: "true",
      punctuate: "true",
      interim_results: "true",
      endpointing: "300",
      encoding: "opus",
      sample_rate: "48000",
    });

    const ws = new WebSocket(
      `wss://api.deepgram.com/v1/listen?${params}`,
      ["token", apiKey]
    );
    socketRef.current = ws;

    ws.onopen = () => {
      isRecordingRef.current = true;
      setIsRecording(true);

      // 4. Start MediaRecorder and pipe chunks to WS
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
          ws.send(e.data);
        }
      };

      // Send chunks every 250ms for low latency
      recorder.start(250);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const transcript = data.channel?.alternatives?.[0]?.transcript;
        if (!transcript) return;

        if (data.is_final) {
          // Accumulate final text
          finalTextRef.current = finalTextRef.current
            ? `${finalTextRef.current} ${transcript}`
            : transcript;
          // Update interim to show accumulated final + nothing pending
          setInterimText(finalTextRef.current);
        } else {
          // Show accumulated final + current interim
          const combined = finalTextRef.current
            ? `${finalTextRef.current} ${transcript}`
            : transcript;
          setInterimText(combined);
        }
      } catch {
        // Ignore parse errors
      }
    };

    ws.onerror = () => {
      toast.error("Speech recognition error");
      cleanup();
    };

    ws.onclose = () => {
      // Normal close or error — cleanup handled by stopRecording
    };
  }, [cleanup]);

  const stopRecording = useCallback((): string => {
    const text = finalTextRef.current.trim();
    cleanup();
    setInterimText("");
    return text;
  }, [cleanup]);

  return {
    interimText,
    isRecording,
    startRecording,
    stopRecording,
  };
}

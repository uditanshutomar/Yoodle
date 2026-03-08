"use client";

import { useState, useRef, useCallback } from "react";

export function useRecording() {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = useCallback(async (stream?: MediaStream) => {
    try {
      const audioStream =
        stream ||
        (await navigator.mediaDevices.getUserMedia({ audio: true }));

      streamRef.current = audioStream;
      chunksRef.current = [];
      setAudioBlob(null);
      setDuration(0);

      const recorder = new MediaRecorder(audioStream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
      };

      recorder.start(1000); // Collect in 1s chunks
      mediaRecorderRef.current = recorder;
      setIsRecording(true);

      // Duration timer
      const start = Date.now();
      timerRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - start) / 1000));
      }, 1000);
    } catch (err) {
      console.error("Failed to start recording:", err);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    // Stop all tracks if we created the stream ourselves
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setIsRecording(false);
  }, []);

  const formatDuration = useCallback((secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }, []);

  return {
    isRecording,
    duration,
    formattedDuration: formatDuration(duration),
    audioBlob,
    startRecording,
    stopRecording,
  };
}

"use client";

import { useState, useCallback, useRef, useEffect } from "react";

export interface UseMediaDevicesReturn {
  stream: MediaStream | null;
  videoDevices: MediaDeviceInfo[];
  audioDevices: MediaDeviceInfo[];
  selectedVideoDevice: string;
  selectedAudioDevice: string;
  isVideoEnabled: boolean;
  isAudioEnabled: boolean;
  setSelectedVideoDevice: (id: string) => void;
  setSelectedAudioDevice: (id: string) => void;
  toggleVideo: () => void;
  toggleAudio: () => void;
  startMedia: (video?: boolean, audio?: boolean) => Promise<void>;
  stopMedia: () => void;
  error: string | null;
}

export function useMediaDevices(): UseMediaDevicesReturn {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedVideoDevice, setSelectedVideoDeviceState] = useState<string>("");
  const [selectedAudioDevice, setSelectedAudioDeviceState] = useState<string>("");
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [isAudioEnabled, setIsAudioEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);

  /** Enumerate available media devices */
  const enumerateDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();

      const video = devices.filter((d) => d.kind === "videoinput");
      const audio = devices.filter((d) => d.kind === "audioinput");

      setVideoDevices(video);
      setAudioDevices(audio);

      // Set defaults if none selected
      if (video.length > 0 && !selectedVideoDevice) {
        setSelectedVideoDeviceState(video[0].deviceId);
      }
      if (audio.length > 0 && !selectedAudioDevice) {
        setSelectedAudioDeviceState(audio[0].deviceId);
      }
    } catch (err) {
      console.error("[MediaDevices] Error enumerating devices:", err);
    }
  }, [selectedVideoDevice, selectedAudioDevice]);

  /** Listen for device changes (plug/unplug) */
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) return;

    const handleDeviceChange = () => {
      enumerateDevices();
    };

    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);
    return () => {
      navigator.mediaDevices.removeEventListener(
        "devicechange",
        handleDeviceChange
      );
    };
  }, [enumerateDevices]);

  /** Start media capture with specified constraints */
  const startMedia = useCallback(
    async (video: boolean = true, audio: boolean = true) => {
      try {
        setError(null);

        // Stop existing stream first
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
        }

        const constraints: MediaStreamConstraints = {
          video: video
            ? {
                deviceId: selectedVideoDevice
                  ? { exact: selectedVideoDevice }
                  : undefined,
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 },
              }
            : false,
          audio: audio
            ? {
                deviceId: selectedAudioDevice
                  ? { exact: selectedAudioDevice }
                  : undefined,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              }
            : false,
        };

        const mediaStream =
          await navigator.mediaDevices.getUserMedia(constraints);

        streamRef.current = mediaStream;
        setStream(mediaStream);
        setIsVideoEnabled(video);
        setIsAudioEnabled(audio);

        // After getting a stream, enumerate devices again to get labels
        await enumerateDevices();

        // Update selected device IDs from actual tracks
        const videoTrack = mediaStream.getVideoTracks()[0];
        if (videoTrack) {
          const settings = videoTrack.getSettings();
          if (settings.deviceId) {
            setSelectedVideoDeviceState(settings.deviceId);
          }
        }

        const audioTrack = mediaStream.getAudioTracks()[0];
        if (audioTrack) {
          const settings = audioTrack.getSettings();
          if (settings.deviceId) {
            setSelectedAudioDeviceState(settings.deviceId);
          }
        }
      } catch (err) {
        const message = getMediaErrorMessage(err);
        setError(message);
        console.error("[MediaDevices] Error starting media:", message);
      }
    },
    [selectedVideoDevice, selectedAudioDevice, enumerateDevices]
  );

  /** Stop all media tracks and clean up */
  const stopMedia = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setStream(null);
    setIsVideoEnabled(false);
    setIsAudioEnabled(false);
    setError(null);
  }, []);

  /** Toggle video track on/off */
  const toggleVideo = useCallback(() => {
    if (!streamRef.current) return;

    const videoTracks = streamRef.current.getVideoTracks();
    if (videoTracks.length === 0) return;

    const enabled = !videoTracks[0].enabled;
    videoTracks.forEach((track) => {
      track.enabled = enabled;
    });
    setIsVideoEnabled(enabled);
  }, []);

  /** Toggle audio track on/off */
  const toggleAudio = useCallback(() => {
    if (!streamRef.current) return;

    const audioTracks = streamRef.current.getAudioTracks();
    if (audioTracks.length === 0) return;

    const enabled = !audioTracks[0].enabled;
    audioTracks.forEach((track) => {
      track.enabled = enabled;
    });
    setIsAudioEnabled(enabled);
  }, []);

  /** Switch video device mid-call */
  const setSelectedVideoDevice = useCallback(
    async (deviceId: string) => {
      setSelectedVideoDeviceState(deviceId);

      // Use ref to access current stream (avoids stale closure)
      const currentStream = streamRef.current;
      if (!currentStream) return;

      try {
        // Get a new video stream from the selected device
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: { exact: deviceId },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 },
          },
        });

        const newVideoTrack = newStream.getVideoTracks()[0];
        if (!newVideoTrack) return;

        // Stop the old video track
        const oldVideoTrack = currentStream.getVideoTracks()[0];
        if (oldVideoTrack) {
          currentStream.removeTrack(oldVideoTrack);
          oldVideoTrack.stop();
        }

        // Add the new track to the existing stream
        currentStream.addTrack(newVideoTrack);
        setStream(new MediaStream(currentStream.getTracks()));
        setIsVideoEnabled(true);
        setError(null);
      } catch (err) {
        const message = getMediaErrorMessage(err);
        setError(message);
        console.error("[MediaDevices] Error switching video device:", message);
      }
    },
    [] // streamRef is stable — no stale closure issue
  );

  /** Switch audio device mid-call */
  const setSelectedAudioDevice = useCallback(
    async (deviceId: string) => {
      setSelectedAudioDeviceState(deviceId);

      // Use ref to access current stream (avoids stale closure)
      const currentStream = streamRef.current;
      if (!currentStream) return;

      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: { exact: deviceId },
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

        const newAudioTrack = newStream.getAudioTracks()[0];
        if (!newAudioTrack) return;

        // Stop the old audio track
        const oldAudioTrack = currentStream.getAudioTracks()[0];
        if (oldAudioTrack) {
          currentStream.removeTrack(oldAudioTrack);
          oldAudioTrack.stop();
        }

        // Add the new track to the existing stream
        currentStream.addTrack(newAudioTrack);
        setStream(new MediaStream(currentStream.getTracks()));
        setIsAudioEnabled(true);
        setError(null);
      } catch (err) {
        const message = getMediaErrorMessage(err);
        setError(message);
        console.error("[MediaDevices] Error switching audio device:", message);
      }
    },
    [] // streamRef is stable — no stale closure issue
  );

  /** Clean up on unmount */
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  return {
    stream,
    videoDevices,
    audioDevices,
    selectedVideoDevice,
    selectedAudioDevice,
    isVideoEnabled,
    isAudioEnabled,
    setSelectedVideoDevice,
    setSelectedAudioDevice,
    toggleVideo,
    toggleAudio,
    startMedia,
    stopMedia,
    error,
  };
}

/**
 * Convert a media error to a user-friendly message.
 */
function getMediaErrorMessage(err: unknown): string {
  if (err instanceof DOMException) {
    switch (err.name) {
      case "NotAllowedError":
        return "Camera or microphone permission was denied. Please allow access in your browser settings.";
      case "NotFoundError":
        return "No camera or microphone was found. Please connect a device and try again.";
      case "NotReadableError":
        return "Your camera or microphone is already in use by another application.";
      case "OverconstrainedError":
        return "The selected device does not support the requested settings. Try a different device.";
      case "AbortError":
        return "Media access was interrupted. Please try again.";
      default:
        return `Media error: ${err.message}`;
    }
  }
  if (err instanceof Error) {
    return err.message;
  }
  return "An unknown error occurred while accessing media devices.";
}

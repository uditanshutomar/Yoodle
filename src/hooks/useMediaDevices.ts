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
  startMedia: (
    video?: boolean,
    audio?: boolean,
    deviceOverrides?: { videoDeviceId?: string; audioDeviceId?: string },
  ) => Promise<void>;
  stopMedia: () => void;
  error: string | null;
}

interface UseMediaDevicesOptions {
  onTrackChanged?: (kind: 'video' | 'audio', track: MediaStreamTrack) => void;
  /** Initial video enabled state (before startMedia resolves). Prevents UI flash. */
  initialVideoEnabled?: boolean;
  /** Initial audio enabled state (before startMedia resolves). Prevents UI flash. */
  initialAudioEnabled?: boolean;
}

export function useMediaDevices(options?: UseMediaDevicesOptions): UseMediaDevicesReturn {
  const onTrackChangedRef = useRef(options?.onTrackChanged);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedVideoDevice, setSelectedVideoDeviceState] = useState<string>("");
  const [selectedAudioDevice, setSelectedAudioDeviceState] = useState<string>("");
  const [isVideoEnabled, setIsVideoEnabled] = useState(options?.initialVideoEnabled ?? false);
  const [isAudioEnabled, setIsAudioEnabled] = useState(options?.initialAudioEnabled ?? false);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);

  // Keep the callback ref in sync
  useEffect(() => {
    onTrackChangedRef.current = options?.onTrackChanged;
  }, [options?.onTrackChanged]);

  /** Enumerate available media devices */
  const enumerateDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();

      const video = devices.filter((d) => d.kind === "videoinput");
      const audio = devices.filter((d) => d.kind === "audioinput");

      setVideoDevices(video);
      setAudioDevices(audio);

      // Set defaults only if none selected — use updater form to avoid
      // depending on selectedVideoDevice/selectedAudioDevice state which
      // would cause this callback to be recreated on every selection change,
      // cascading into the devicechange listener and startMedia deps.
      setSelectedVideoDeviceState((prev) =>
        prev || (video.length > 0 ? video[0].deviceId : ""),
      );
      setSelectedAudioDeviceState((prev) =>
        prev || (audio.length > 0 ? audio[0].deviceId : ""),
      );
    } catch {
      // Device enumeration failed — UI will show empty device lists
    }
  }, []);

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

  /** Start media capture with specified constraints.
   *
   * Audio is ALWAYS requested from getUserMedia so that toggleAudio can
   * enable/disable the mic at any time.  When the `audio` param is false
   * (e.g. muteOnJoin) the track is acquired but starts with
   * `track.enabled = false` so no audio data flows until the user unmutes.
   */
  const startMedia = useCallback(
    async (
      video: boolean = true,
      audio: boolean = true,
      deviceOverrides?: { videoDeviceId?: string; audioDeviceId?: string },
    ) => {
      try {
        setError(null);

        // Stop existing stream first
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
        }

        // Resolve device IDs — prefer explicit override, then previously selected
        const videoDeviceId = deviceOverrides?.videoDeviceId || selectedVideoDevice;
        const audioDeviceId = deviceOverrides?.audioDeviceId || selectedAudioDevice;

        const constraints: MediaStreamConstraints = {
          video: video
            ? {
                deviceId: videoDeviceId ? { exact: videoDeviceId } : undefined,
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 },
              }
            : false,
          // Always request audio so toggleAudio has a track to flip.
          // If `audio` is false the track starts disabled (muted).
          audio: {
            deviceId: audioDeviceId ? { exact: audioDeviceId } : undefined,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        };

        const mediaStream =
          await navigator.mediaDevices.getUserMedia(constraints);

        // If caller wants audio muted, disable the track (but keep it alive
        // so toggleAudio can re-enable it later).
        if (!audio) {
          mediaStream.getAudioTracks().forEach((t) => {
            t.enabled = false;
          });
        }

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

        // Notify caller so they can update peer connections
        onTrackChangedRef.current?.('video', newVideoTrack);
      } catch (err) {
        const message = getMediaErrorMessage(err);
        setError(message);
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

        // Notify caller so they can update peer connections
        onTrackChangedRef.current?.('audio', newAudioTrack);
      } catch (err) {
        const message = getMediaErrorMessage(err);
        setError(message);
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

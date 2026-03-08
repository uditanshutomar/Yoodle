"use client";

import { useState, useCallback, useRef, useEffect } from "react";

export interface UseScreenShareReturn {
  isSharing: boolean;
  screenStream: MediaStream | null;
  startScreenShare: () => Promise<void>;
  stopScreenShare: () => void;
}

interface UseScreenShareOptions {
  onTrackReplace?: (oldTrack: MediaStreamTrack, newTrack: MediaStreamTrack) => void;
  onStart?: () => void;
  onStop?: () => void;
  cameraStream?: MediaStream | null;
}

export function useScreenShare(options: UseScreenShareOptions = {}): UseScreenShareReturn {
  const { onTrackReplace, onStart, onStop, cameraStream } = options;
  const [isSharing, setIsSharing] = useState(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);

  const screenStreamRef = useRef<MediaStream | null>(null);
  const cameraVideoTrackRef = useRef<MediaStreamTrack | null>(null);

  /** Internal stop function — defined BEFORE startScreenShare to avoid forward reference */
  const stopScreenShareInternal = useCallback(() => {
    const currentScreenStream = screenStreamRef.current;
    const screenTrack = currentScreenStream?.getVideoTracks()[0];

    // Stop all screen share tracks
    if (currentScreenStream) {
      currentScreenStream.getTracks().forEach((track) => {
        track.onended = null;
        track.stop();
      });
      screenStreamRef.current = null;
    }

    // Restore camera video track in peer connections
    if (cameraVideoTrackRef.current && onTrackReplace) {
      if (cameraStream) {
        const freshCameraTrack = cameraStream.getVideoTracks()[0];
        if (freshCameraTrack) {
          onTrackReplace(
            screenTrack || cameraVideoTrackRef.current,
            freshCameraTrack
          );
        }
      }
    }

    cameraVideoTrackRef.current = null;
    setScreenStream(null);
    setIsSharing(false);

    onStop?.();
  }, [cameraStream, onTrackReplace, onStop]);

  /** Start screen sharing via getDisplayMedia */
  const startScreenShare = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: "always",
          displaySurface: "monitor",
        } as MediaTrackConstraints,
        audio: false,
      });

      screenStreamRef.current = stream;
      setScreenStream(stream);
      setIsSharing(true);

      // Save the current camera video track for restoration
      if (cameraStream) {
        const cameraTrack = cameraStream.getVideoTracks()[0];
        if (cameraTrack) {
          cameraVideoTrackRef.current = cameraTrack;
        }
      }

      // Replace video track in peer connections with screen share track
      const screenTrack = stream.getVideoTracks()[0];
      if (screenTrack && cameraVideoTrackRef.current && onTrackReplace) {
        onTrackReplace(cameraVideoTrackRef.current, screenTrack);
      }

      // Handle the browser's native "Stop sharing" button
      screenTrack.onended = () => {
        stopScreenShareInternal();
      };

      onStart?.();
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        console.log("[ScreenShare] User cancelled screen sharing");
      } else {
        console.error("[ScreenShare] Error starting screen share:", err);
      }
    }
  }, [cameraStream, onTrackReplace, onStart, stopScreenShareInternal]);

  /** Public stop function */
  const stopScreenShare = useCallback(() => {
    stopScreenShareInternal();
  }, [stopScreenShareInternal]);

  /** Clean up on unmount */
  useEffect(() => {
    return () => {
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((track) => {
          track.onended = null;
          track.stop();
        });
        screenStreamRef.current = null;
      }
    };
  }, []);

  return {
    isSharing,
    screenStream,
    startScreenShare,
    stopScreenShare,
  };
}

"use client";

import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Video, VideoOff, Mic, MicOff, Monitor, Users, Copy, Check } from "lucide-react";
import Button from "@/components/ui/Button";
import { useMediaDevices } from "@/hooks/useMediaDevices";

interface PreJoinLobbyProps {
  meetingId: string;
  meetingTitle: string;
  meetingCode: string;
  participantCount: number;
  onJoin: (settings: {
    video: boolean;
    audio: boolean;
    videoDeviceId?: string;
    audioDeviceId?: string;
  }) => void;
}

export default function PreJoinLobby({
  meetingTitle,
  meetingCode,
  participantCount,
  onJoin,
}: PreJoinLobbyProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const {
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
  } = useMediaDevices();

  const [joining, setJoining] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const copyTimerRef = useRef<NodeJS.Timeout>(undefined);

  useEffect(() => {
    return () => clearTimeout(copyTimerRef.current);
  }, []);

  const handleCopyCode = async () => {
    const link = `${window.location.origin}/meetings/join?code=${meetingCode}`;
    try {
      await navigator.clipboard.writeText(link);
      setCodeCopied(true);
      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    startMedia(true, true);
    // Stop media tracks on unmount to release camera/mic
    return () => {
      stopMedia();
    };
  }, [startMedia, stopMedia]);

  // Must depend on isVideoEnabled so srcObject is re-assigned when <video> remounts
  // after being conditionally removed (toggle off → icon → toggle on → new <video>)
  useEffect(() => {
    const el = videoRef.current;
    if (el && stream) {
      el.srcObject = stream;
      el.play().catch(() => {
        // Autoplay blocked — user will see a still frame until interaction
      });
    }
  }, [stream, isVideoEnabled]);

  const handleJoin = () => {
    setJoining(true);
    onJoin({
      video: isVideoEnabled,
      audio: isAudioEnabled,
      videoDeviceId: selectedVideoDevice || undefined,
      audioDeviceId: selectedAudioDevice || undefined,
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center gap-8 max-w-2xl mx-auto py-8"
    >
      {/* Meeting info */}
      <div className="text-center">
        <h1
          className="text-3xl font-black text-[#0A0A0A] mb-2"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          {meetingTitle}
        </h1>
        <button
          onClick={handleCopyCode}
          className="inline-flex items-center gap-2 mt-1 px-3 py-1 rounded-lg bg-[#0A0A0A]/5 hover:bg-[#0A0A0A]/10 transition-all cursor-pointer border border-[#0A0A0A]/10"
          title="Click to copy meeting link"
        >
          <span
            className="text-sm text-[#0A0A0A]/60 font-mono tracking-wider"
            style={{ fontFamily: "var(--font-body)" }}
          >
            {meetingCode}
          </span>
          {codeCopied ? (
            <Check size={14} className="text-[#10B981]" />
          ) : (
            <Copy size={14} className="text-[#0A0A0A]/40" />
          )}
        </button>
        {codeCopied && (
          <p className="text-xs text-[#10B981] mt-1" style={{ fontFamily: "var(--font-body)" }}>
            Link copied! Share it with others
          </p>
        )}
        <div className="flex items-center justify-center gap-2 mt-2 text-sm text-[#0A0A0A]/60">
          <Users size={14} />
          <span style={{ fontFamily: "var(--font-body)" }}>
            {participantCount} participant{participantCount !== 1 ? "s" : ""} waiting
          </span>
        </div>
      </div>

      {/* Video preview circle */}
      <motion.div
        className="relative w-64 h-64 rounded-full overflow-hidden border-4 border-[#0A0A0A] shadow-[6px_6px_0_#0A0A0A] bg-[#0A0A0A]"
        animate={isVideoEnabled ? { scale: [1, 1.02, 1] } : {}}
        transition={{ duration: 2, repeat: Infinity }}
      >
        {stream && isVideoEnabled ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover scale-x-[-1]"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-[#1a1a2e]">
            <VideoOff size={48} className="text-white/40" />
          </div>
        )}

        {/* Audio indicator */}
        {isAudioEnabled && (
          <motion.div
            className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-[#0A0A0A]/70 rounded-full px-3 py-1"
            animate={{ opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            <Mic size={12} className="text-green-400" />
            <span className="text-xs text-white">Mic on</span>
          </motion.div>
        )}
      </motion.div>

      {error && (
        <p className="text-sm text-[#FF6B6B] text-center" style={{ fontFamily: "var(--font-body)" }}>
          {error}
        </p>
      )}

      {/* Controls */}
      <div className="flex items-center gap-4">
        <button
          onClick={toggleVideo}
          className={`flex items-center justify-center w-14 h-14 rounded-full border-2 border-[#0A0A0A] shadow-[3px_3px_0_#0A0A0A] transition-all cursor-pointer ${
            isVideoEnabled ? "bg-white" : "bg-[#FF6B6B] text-white"
          }`}
        >
          {isVideoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
        </button>

        <button
          onClick={toggleAudio}
          className={`flex items-center justify-center w-14 h-14 rounded-full border-2 border-[#0A0A0A] shadow-[3px_3px_0_#0A0A0A] transition-all cursor-pointer ${
            isAudioEnabled ? "bg-white" : "bg-[#FF6B6B] text-white"
          }`}
        >
          {isAudioEnabled ? <Mic size={20} /> : <MicOff size={20} />}
        </button>
      </div>

      {/* Device selectors */}
      <div className="w-full max-w-sm space-y-3">
        {videoDevices.length > 0 && (
          <div>
            <label className="text-xs font-bold text-[#0A0A0A]/60 mb-1 block" style={{ fontFamily: "var(--font-heading)" }}>
              Camera
            </label>
            <select
              value={selectedVideoDevice}
              onChange={(e) => setSelectedVideoDevice(e.target.value)}
              className="w-full rounded-xl border-2 border-[#0A0A0A]/15 bg-white py-2 px-3 text-sm focus:border-[#0A0A0A] focus:outline-none"
              style={{ fontFamily: "var(--font-body)" }}
            >
              {videoDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Camera ${d.deviceId.slice(0, 8)}`}
                </option>
              ))}
            </select>
          </div>
        )}

        {audioDevices.length > 0 && (
          <div>
            <label className="text-xs font-bold text-[#0A0A0A]/60 mb-1 block" style={{ fontFamily: "var(--font-heading)" }}>
              Microphone
            </label>
            <select
              value={selectedAudioDevice}
              onChange={(e) => setSelectedAudioDevice(e.target.value)}
              className="w-full rounded-xl border-2 border-[#0A0A0A]/15 bg-white py-2 px-3 text-sm focus:border-[#0A0A0A] focus:outline-none"
              style={{ fontFamily: "var(--font-body)" }}
            >
              {audioDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Mic ${d.deviceId.slice(0, 8)}`}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Join button */}
      <Button
        variant="primary"
        size="lg"
        icon={Monitor}
        loading={joining}
        onClick={handleJoin}
        className="w-full max-w-sm"
      >
        {joining ? "Joining..." : "Join Meeting"}
      </Button>
    </motion.div>
  );
}

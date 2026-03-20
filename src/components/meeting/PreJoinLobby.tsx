"use client";

import { useState, useRef, useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Video, VideoOff, Mic, MicOff, Monitor, Users, Copy, Check, Circle, MonitorUp, ShieldCheck, VolumeX, Calendar } from "lucide-react";
import Button from "@/components/ui/Button";
import { useMediaDevices } from "@/hooks/useMediaDevices";

interface MeetingSettings {
  allowRecording?: boolean;
  allowScreenShare?: boolean;
  waitingRoom?: boolean;
  muteOnJoin?: boolean;
  maxParticipants?: number;
}

interface PreJoinLobbyProps {
  meetingId: string;
  meetingTitle: string;
  meetingCode: string;
  participantCount: number;
  settings?: MeetingSettings;
  scheduledAt?: string;
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
  settings,
  scheduledAt,
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

  const shouldReduceMotion = useReducedMotion();
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
      // Clipboard API unavailable (permissions denied, insecure context) —
      // still show "Copied" as the link was selected, or prompt the user.
      console.warn("[PreJoinLobby] Clipboard API unavailable");
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
      el.play().catch((err) => {
        if (err.name !== "NotAllowedError") {
          console.warn("[PreJoinLobby] Video play failed:", err.name, err.message);
        }
      });
    }
    return () => {
      if (el) el.srcObject = null;
    };
  }, [stream, isVideoEnabled]);

  const handleJoin = async () => {
    setJoining(true);
    try {
      await onJoin({
        video: isVideoEnabled,
        audio: isAudioEnabled,
        videoDeviceId: selectedVideoDevice || undefined,
        audioDeviceId: selectedAudioDevice || undefined,
      });
    } catch (err) {
      console.error("[PreJoinLobby] Failed to join meeting:", err);
      setJoining(false);
    }
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
          className="text-3xl font-black text-[var(--text-primary)] mb-2 font-heading"
        >
          {meetingTitle}
        </h1>
        <button
          onClick={handleCopyCode}
          className="inline-flex items-center gap-2 mt-1 px-3 py-1 rounded-lg bg-[var(--surface-hover)] hover:bg-[var(--border)] transition-all cursor-pointer border border-[var(--border-strong)]/10 focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none"
          title="Click to copy meeting link"
          aria-label={codeCopied ? "Meeting link copied" : "Copy meeting link"}
        >
          <span
            className="text-sm text-[var(--text-muted)] font-mono tracking-wider font-body"
          >
            {meetingCode}
          </span>
          {codeCopied ? (
            <Check size={14} className="text-[#10B981]" />
          ) : (
            <Copy size={14} className="text-[var(--text-muted)]" />
          )}
        </button>
        {codeCopied && (
          <p className="text-xs text-[#10B981] mt-1 font-body" role="status" aria-live="polite">
            Link copied! Share it with others
          </p>
        )}
        <div className="flex items-center justify-center gap-2 mt-2 text-sm text-[var(--text-muted)]">
          <Users size={14} />
          <span className="font-body">
            {participantCount} participant{participantCount !== 1 ? "s" : ""} waiting
          </span>
        </div>

        {/* Meeting settings badges */}
        {settings && (
          <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
            {scheduledAt && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[11px] text-[var(--text-muted)] font-body">
                <Calendar size={11} />
                {new Date(scheduledAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </span>
            )}
            {settings.allowRecording && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[11px] text-[var(--text-muted)] font-body">
                <Circle size={11} className="text-[#FF6B6B]" />
                Recording
              </span>
            )}
            {settings.allowScreenShare && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[11px] text-[var(--text-muted)] font-body">
                <MonitorUp size={11} />
                Screen share
              </span>
            )}
            {settings.waitingRoom && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[11px] text-[var(--text-muted)] font-body">
                <ShieldCheck size={11} className="text-[#3B82F6]" />
                Waiting room
              </span>
            )}
            {settings.muteOnJoin && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[11px] text-[var(--text-muted)] font-body">
                <VolumeX size={11} />
                Muted on join
              </span>
            )}
            {settings.maxParticipants && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[11px] text-[var(--text-muted)] font-body">
                <Users size={11} />
                Max {settings.maxParticipants}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Video preview circle */}
      <motion.div
        className="relative w-64 h-64 rounded-full overflow-hidden border-4 border-[var(--border-strong)] shadow-[6px_6px_0_var(--border-strong)] bg-[#0A0A0A]"
        animate={isVideoEnabled && !shouldReduceMotion ? { scale: [1, 1.02, 1] } : {}}
        transition={!shouldReduceMotion ? { duration: 2, repeat: Infinity } : {}}
      >
        {stream && isVideoEnabled ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            aria-label="Camera preview"
            className="w-full h-full object-cover scale-x-[-1]"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-[var(--surface)]">
            <VideoOff size={48} className="text-[var(--text-muted)]" />
          </div>
        )}

        {/* Audio indicator */}
        {isAudioEnabled && (
          <motion.div
            className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-[#0A0A0A]/70 rounded-full px-3 py-1"
            animate={!shouldReduceMotion ? { opacity: [0.7, 1, 0.7] } : {}}
            transition={!shouldReduceMotion ? { duration: 1.5, repeat: Infinity } : {}}
          >
            <Mic size={12} className="text-green-400" />
            <span className="text-xs text-white">Mic on</span>
          </motion.div>
        )}
      </motion.div>

      {error && (
        <p className="text-sm text-[#FF6B6B] text-center font-body">
          {error}
        </p>
      )}

      {/* Controls */}
      <div className="flex items-center gap-4">
        <button
          onClick={toggleVideo}
          aria-label={isVideoEnabled ? "Turn off camera" : "Turn on camera"}
          aria-pressed={isVideoEnabled}
          className={`flex items-center justify-center w-14 h-14 rounded-full border-2 border-[var(--border-strong)] shadow-[3px_3px_0_var(--border-strong)] transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none ${
            isVideoEnabled ? "bg-[var(--surface)]" : "bg-[#FF6B6B] text-white"
          }`}
        >
          {isVideoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
        </button>

        <button
          onClick={toggleAudio}
          aria-label={isAudioEnabled ? "Mute microphone" : "Unmute microphone"}
          aria-pressed={isAudioEnabled}
          className={`flex items-center justify-center w-14 h-14 rounded-full border-2 border-[var(--border-strong)] shadow-[3px_3px_0_var(--border-strong)] transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none ${
            isAudioEnabled ? "bg-[var(--surface)]" : "bg-[#FF6B6B] text-white"
          }`}
        >
          {isAudioEnabled ? <Mic size={20} /> : <MicOff size={20} />}
        </button>
      </div>

      {/* Device selectors */}
      <div className="w-full max-w-sm space-y-3">
        {videoDevices.length > 0 && (
          <div>
            <label htmlFor="camera-select" className="text-xs font-bold text-[var(--text-muted)] mb-1 block font-heading">
              Camera
            </label>
            <select
              id="camera-select"
              value={selectedVideoDevice}
              onChange={(e) => setSelectedVideoDevice(e.target.value)}
              className="w-full rounded-xl border-2 border-[var(--border-strong)]/15 bg-[var(--surface)] py-2 px-3 text-sm focus:border-[var(--border-strong)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFE600] font-body"
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
            <label htmlFor="mic-select" className="text-xs font-bold text-[var(--text-muted)] mb-1 block font-heading">
              Microphone
            </label>
            <select
              id="mic-select"
              value={selectedAudioDevice}
              onChange={(e) => setSelectedAudioDevice(e.target.value)}
              className="w-full rounded-xl border-2 border-[var(--border-strong)]/15 bg-[var(--surface)] py-2 px-3 text-sm focus:border-[var(--border-strong)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFE600] font-body"
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

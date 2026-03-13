"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { WifiOff, AlertTriangle } from "lucide-react";
import dynamic from "next/dynamic";
import BubbleLayout from "@/components/meeting/BubbleLayout";
import GridLayout from "@/components/meeting/GridLayout";
import MeetingControls from "@/components/meeting/MeetingControls";
import ConnectionIndicator from "@/components/meeting/ConnectionIndicator";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import type { WaitingUser } from "@/components/meeting/WaitingRoomPanel";

const ChatPanel = dynamic(() => import("@/components/meeting/ChatPanel"), { ssr: false });
const ScreenShareView = dynamic(() => import("@/components/meeting/ScreenShareView"), { ssr: false });
const ParticipantList = dynamic(() => import("@/components/meeting/ParticipantList"), { ssr: false });
const ReactionOverlay = dynamic(() => import("@/components/meeting/ReactionOverlay"), { ssr: false });
const ReconnectionOverlay = dynamic(() => import("@/components/meeting/ReconnectionOverlay"), { ssr: false });
const WaitingRoomPanel = dynamic(() => import("@/components/meeting/WaitingRoomPanel"), { ssr: false });
import { toParticipant } from "@/components/meeting/adapters";
import { DoodleStar, DoodleSparkles } from "@/components/Doodles";
import "./meeting.css";
import { useMediaDevices } from "@/hooks/useMediaDevices";
import { useVoiceActivity, type SpeechSegment } from "@/hooks/useVoiceActivity";
import { useAuth } from "@/hooks/useAuth";
import { useSocket } from "@/hooks/useSocket";
import { useChat } from "@/hooks/useChat";
import { useRecording } from "@/hooks/useRecording";
import { useTranscription } from "@/hooks/useTranscription";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useMutedWarning } from "@/hooks/useMutedWarning";
import { useConnectionQuality } from "@/hooks/useConnectionQuality";
import { useTransport } from "@/hooks/useTransport";
import {
  SOCKET_EVENTS,
  type RoomUser,
  type MediaStatePayload,
  type ReactionPayload,
  type ScreenSharePayload,
  type HostMutePayload,
  type HostKickPayload,
  type WaitingRoomUser,
  type WaitingRoomActionPayload,
  type HandRaisePayload,
} from "@/lib/realtime/socket-events";
import {
  clearRoomJoinSession,
  loadRoomJoinSession,
  type RoomJoinSession,
} from "@/lib/meetings/room-session";

// ── Component ──────────────────────────────────────────────────────────

export default function MeetingRoomPage() {
  const params = useParams();
  const router = useRouter();
  const meetingId = params.meetingId as string;
  const { user } = useAuth();
  const { socket, isConnected } = useSocket();
  const [roomSession, setRoomSession] = useState<RoomJoinSession | null>(null);

  // ── Bug #6 fix: media error state ──────────────────────────────────
  const [mediaError, setMediaError] = useState<string | null>(null);

  const {
    stream: localStream,
    isVideoEnabled,
    isAudioEnabled,
    toggleVideo,
    toggleAudio,
    startMedia,
    stopMedia,
    error: mediaDeviceError,
  } = useMediaDevices();

  // Sync media device errors to local state for UI display
  useEffect(() => {
    if (mediaDeviceError) setMediaError(mediaDeviceError);
  }, [mediaDeviceError]);

  // ── Voice activity (speaker detection for transcripts) ──────────────
  const {
    isSpeaking: isLocalSpeaking,
    speechSegments,
    remoteSpeakingPeers: remoteSpeakingFromVAD,
    startMonitoring: startVoiceMonitoring,
    stopMonitoring: stopVoiceMonitoring,
  } = useVoiceActivity({
    socket,
    userId: user?.id || "local",
    userName: user?.displayName || user?.name || "You",
  });

  // ── Room session bootstrap ────────────────────────────────────────
  useEffect(() => {
    const session = loadRoomJoinSession(meetingId);
    if (!session) {
      router.push(`/meetings/${meetingId}`);
      return;
    }

    setRoomSession(session);
  }, [meetingId, router]);

  // ── UI state ─────────────────────────────────────────────────────────
  const [showChat, setShowChat] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [layout, setLayout] = useState<"bubbles" | "grid">("bubbles");
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [showWaitingRoom, setShowWaitingRoom] = useState(false);
  const [waitingUsers, setWaitingUsers] = useState<WaitingUser[]>([]);
  const [isLocalHost, setIsLocalHost] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const MAX_RECONNECT_ATTEMPTS = 5;
  const reactionRef = useRef<((emoji: string, userName: string) => void) | null>(null);
  const [handRaisedUsers, setHandRaisedUsers] = useState<Set<string>>(new Set());

  // ── Bubble layout container measurement ─────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const joinTimeRef = useRef(Date.now());
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setContainerSize({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - joinTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // ── Local user identity ────────────────────────────────────────────
  const localUser = user
    ? {
        id: user.id,
        name: user.name,
        displayName: user.displayName || user.name,
        avatar: user.avatar || undefined,
      }
    : { id: "local", name: "You", displayName: "You", avatar: undefined };
  const canRecord = roomSession?.permissions.allowRecording ?? false;
  const canScreenShare = roomSession?.permissions.allowScreenShare ?? true;

  useEffect(() => {
    if (!roomSession || !user) return;
    setIsLocalHost(user.id === roomSession.hostUserId);
  }, [roomSession, user]);

  // ── LiveKit transport ──────────────────────────────────────────────
  const {
    transport,
    remoteStreams: livekitRemoteStreams,
    remoteParticipants: livekitRemoteParticipants,
    error: livekitError,
  } = useTransport({
    meetingId,
    localStream,
    user: {
      id: localUser.id,
      name: localUser.name,
      avatar: localUser.avatar || undefined,
      isAudioEnabled,
      isVideoEnabled,
      isScreenSharing,
    },
    enabled: !!localStream,
  });

  // ── Chat hook ──────────────────────────────────────────────────────
  const {
    messages: chatMessages,
    sendMessage: handleSendMessage,
    unreadCount: chatUnreadCount,
    markRead: markChatRead,
  } = useChat(socket, meetingId, localUser.id, localUser.displayName);

  // Mark chat as read when the panel is opened
  useEffect(() => {
    if (showChat) markChatRead();
  }, [showChat, markChatRead]);

  // ── Remote participants (from LiveKit transport) ────────────────────
  const effectiveRemoteStreams = livekitRemoteStreams;

  const effectiveRemoteParticipants: RoomUser[] = livekitRemoteParticipants.map((p) => ({
    id: p.id,
    socketId: "",
    name: p.name,
    displayName: p.name,
    avatar: p.avatar || null,
    isVideoEnabled: p.isVideoEnabled ?? true,
    isAudioEnabled: p.isAudioEnabled ?? true,
    isScreenSharing: p.isScreenSharing ?? false,
    isHandRaised: handRaisedUsers.has(p.id),
  }));

  // Speaker detection: combine local + remote
  const speakingPeers = new Set([
    ...(isLocalSpeaking ? [user?.id || "local"] : []),
    ...remoteSpeakingFromVAD,
  ]);
  const localStreamRef = useRef<MediaStream | null>(null);
  const joinedRef = useRef(false);
  const mediaStartedRef = useRef(false);
  const screenStreamRef = useRef<MediaStream | null>(null);

  // Track speech segments for recording (ref to avoid re-renders)
  const speechSegmentsRef = useRef<SpeechSegment[]>([]);
  useEffect(() => {
    speechSegmentsRef.current = speechSegments;
  }, [speechSegments]);

  // ── Recording hook ─────────────────────────────────────────────────
  const {
    isRecording,
    startRecording: handleStartRecording,
    stopRecording: handleStopRecording,
  } = useRecording(localStream, effectiveRemoteStreams, meetingId, socket, speechSegmentsRef);

  // Keep a ref so socket handlers always see the latest recording state
  const isRecordingRef = useRef(isRecording);
  const handleStopRecordingRef = useRef(handleStopRecording);
  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);
  useEffect(() => { handleStopRecordingRef.current = handleStopRecording; }, [handleStopRecording]);

  // ── Transcription hook ──────────────────────────────────────────────
  useTranscription(
    localStream,
    meetingId,
    user?.id || "local",
    user?.displayName || user?.name || "You",
    isAudioEnabled,
    isConnected
  );

  // ── Build full participants list ─────────────────────────────────────
  const participants: RoomUser[] = [
    {
      id: localUser.id,
      socketId: socket?.id || "",
      name: localUser.name,
      displayName: localUser.displayName,
      avatar: localUser.avatar || null,
      isVideoEnabled,
      isAudioEnabled,
      isScreenSharing,
      isHandRaised,
    },
    ...effectiveRemoteParticipants,
  ];

  // Bug #3 fix: derive activeScreenShare from ANY participant, not just local
  const activeScreenShare = participants.some((p) => p.isScreenSharing);

  // ── Muted warning (detects speaking while muted) ──────────────────
  const showMutedWarning = useMutedWarning(localStream, isAudioEnabled);

  // ── Connection quality monitoring ─────────────────────────────────
  // TODO: Replace with LiveKit connection quality metrics
  const { quality: connectionQuality, rtt, packetLoss } = useConnectionQuality(new Map());

  // Keep localStreamRef in sync and start voice monitoring
  useEffect(() => {
    localStreamRef.current = localStream;
    if (localStream) {
      startVoiceMonitoring(localStream);
    }
    return () => {
      stopVoiceMonitoring();
    };
  }, [localStream, startVoiceMonitoring, stopVoiceMonitoring]);

  // ── Start media immediately on mount ────────────────────────────────
  // Bug #6 fix: wrap in try/catch and surface error to UI

  useEffect(() => {
    if (mediaStartedRef.current) return;
    if (!roomSession) return;
    mediaStartedRef.current = true;

    startMedia(
      roomSession.media.videoEnabled,
      roomSession.media.audioEnabled,
      {
        videoDeviceId: roomSession.media.videoDeviceId,
        audioDeviceId: roomSession.media.audioDeviceId,
      },
    ).catch((err) => {
      setMediaError(
        err instanceof Error
          ? err.message
          : "Failed to access camera or microphone. Please check your permissions."
      );
    });
  }, [roomSession, startMedia]);

  // ── Socket event setup (handles initial join AND reconnection) ──────

  useEffect(() => {
    if (!socket || !isConnected || !user || !roomSession) return;

    const roomUser = {
      id: user.id,
      name: user.name,
      displayName: user.displayName,
      avatar: user.avatar,
    };

    if (!joinedRef.current) {
      socket.emit(SOCKET_EVENTS.JOIN_ROOM, {
        roomId: roomSession.roomId,
        user: roomUser,
      });
      joinedRef.current = true;
    } else {
      // Reconnection — re-join the room
      socket.emit(SOCKET_EVENTS.JOIN_ROOM, {
        roomId: roomSession.roomId,
        user: roomUser,
      });
    }

    // ── Event handlers ──────────────────────────────────────────────
    // Note: participant join/leave for media streams is handled by
    // LiveKit transport. Socket events here handle metadata only
    // (media state, reactions, screen share status, hand raise, etc.)

    const handleReaction = (payload: ReactionPayload) => {
      reactionRef.current?.(payload.emoji, payload.userName);
    };

    // Screen share start/stop handled natively by LiveKit transport.
    // Socket events still broadcast for waiting room / UI sync.
    const handleScreenShareStart = (_payload: ScreenSharePayload) => {};
    const handleScreenShareStop = (_payload: ScreenSharePayload) => {};

    // ── Hand raise events (tracked locally, not part of LiveKit) ────
    const handleHandRaised = (payload: HandRaisePayload) => {
      setHandRaisedUsers((prev) => new Set(prev).add(payload.userId));
    };

    const handleHandLowered = (payload: HandRaisePayload) => {
      setHandRaisedUsers((prev) => {
        const next = new Set(prev);
        next.delete(payload.userId);
        return next;
      });
    };

    // ── Host control events ──────────────────────────────────────────
    const handleHostMuted = () => {
      // Server force-muted us — check actual track state to avoid stale closure
      const audioTrack = localStreamRef.current?.getAudioTracks()[0];
      if (audioTrack?.enabled) {
        toggleAudio();
      }
    };

    const handleHostKicked = () => {
      // We've been kicked — clean up resources before navigating.
      // Use refs to avoid stale closure (this handler is created once
      // when the socket effect runs, not re-created on isRecording change).
      if (isRecordingRef.current) handleStopRecordingRef.current();

      // LiveKit transport cleanup handled by useTransport hook unmount
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      stopMedia();
      clearRoomJoinSession(meetingId);

      router.push("/meetings?kicked=true");
    };

    // ── Waiting room events ──────────────────────────────────────────
    // Server sends { roomId, users: WaitingRoomUser[] } — extract users from payload
    const handleWaitingList = (payload: { roomId?: string; users?: WaitingRoomUser[] } | WaitingRoomUser[]) => {
      const users = Array.isArray(payload) ? payload : (payload.users ?? []);
      setWaitingUsers(
        users.map((u) => ({
          id: u.id,
          name: u.name,
          displayName: u.displayName,
          avatar: u.avatar,
          joinedWaitingAt: u.joinedWaitingAt,
        }))
      );
      // Auto-show waiting room panel if there are users waiting
      if (users.length > 0 && isLocalHost) {
        setShowWaitingRoom(true);
      }
    };

    // ── Reconnection tracking ────────────────────────────────────────
    const handleDisconnect = () => {
      setReconnectAttempts(MAX_RECONNECT_ATTEMPTS);
    };

    const handleReconnectAttempt = (attempt: number) => {
      setReconnectAttempts(attempt);
    };

    // ── Register event listeners ────────────────────────────────────

    socket.on(SOCKET_EVENTS.REACTION_RECEIVED, handleReaction);
    socket.on(SOCKET_EVENTS.SCREEN_SHARE_START, handleScreenShareStart);
    socket.on(SOCKET_EVENTS.SCREEN_SHARE_STOP, handleScreenShareStop);
    socket.on(SOCKET_EVENTS.HAND_RAISED, handleHandRaised);
    socket.on(SOCKET_EVENTS.HAND_LOWERED, handleHandLowered);
    socket.on(SOCKET_EVENTS.HOST_MUTED, handleHostMuted);
    socket.on(SOCKET_EVENTS.HOST_KICKED, handleHostKicked);
    socket.on(SOCKET_EVENTS.WAITING_LIST, handleWaitingList);
    socket.io.on("reconnect_attempt", handleReconnectAttempt);
    socket.io.on("reconnect_failed", handleDisconnect);

    return () => {
      socket.off(SOCKET_EVENTS.REACTION_RECEIVED, handleReaction);
      socket.off(SOCKET_EVENTS.SCREEN_SHARE_START, handleScreenShareStart);
      socket.off(SOCKET_EVENTS.SCREEN_SHARE_STOP, handleScreenShareStop);
      socket.off(SOCKET_EVENTS.HAND_RAISED, handleHandRaised);
      socket.off(SOCKET_EVENTS.HAND_LOWERED, handleHandLowered);
      socket.off(SOCKET_EVENTS.HOST_MUTED, handleHostMuted);
      socket.off(SOCKET_EVENTS.HOST_KICKED, handleHostKicked);
      socket.off(SOCKET_EVENTS.WAITING_LIST, handleWaitingList);
      socket.io.off("reconnect_attempt", handleReconnectAttempt);
      socket.io.off("reconnect_failed", handleDisconnect);
    };
  }, [
    socket,
    isConnected,
    user,
    roomSession,
    toggleAudio,
    stopMedia,
    router,
    meetingId,
    isLocalHost,
  ]);

  // ── Broadcast media state on toggle ──────────────────────────────

  useEffect(() => {
    if (!socket || !isConnected || !user) return;
    socket.emit(SOCKET_EVENTS.MEDIA_STATE_CHANGED, {
      userId: user.id,
      isVideoEnabled,
      isAudioEnabled,
    } as MediaStatePayload);
  }, [isVideoEnabled, isAudioEnabled, socket, isConnected, user]);

  // ── Screen sharing (via LiveKit transport) ──────────────────────────

  const handleToggleScreenShare = useCallback(async () => {
    if (!canScreenShare) {
      setMediaError("Screen sharing is disabled for this meeting.");
      return;
    }

    if (isScreenSharing) {
      // Stop screen share via transport
      if (transport) {
        await transport.stopScreenShare().catch(() => {});
      }
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      setIsScreenSharing(false);

      // Broadcast screen share stop to other participants
      if (socket && user) {
        socket.emit(SOCKET_EVENTS.SCREEN_SHARE_STOP);
      }
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });
        screenStreamRef.current = screenStream;
        setIsScreenSharing(true);

        // Publish screen share tracks via LiveKit transport
        if (transport) {
          await transport.startScreenShare(screenStream);
        }

        // Broadcast screen share start to other participants
        if (socket && user) {
          socket.emit(SOCKET_EVENTS.SCREEN_SHARE_START);
        }

        // Handle native "stop sharing" browser button
        const screenTrack = screenStream.getVideoTracks()[0];
        screenTrack.onended = async () => {
          if (transport) {
            await transport.stopScreenShare().catch(() => {});
          }
          setIsScreenSharing(false);
          screenStreamRef.current = null;
          // Broadcast screen share stop when user clicks browser's native stop button
          if (socket && user) {
            socket.emit(SOCKET_EVENTS.SCREEN_SHARE_STOP);
          }
        };
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "NotAllowedError")) {
          // Screen share failed for non-cancellation reason
          void err;
        }
      }
    }
  }, [canScreenShare, isScreenSharing, transport, socket, user]);

  // ── Reactions ────────────────────────────────────────────────────

  const handleReaction = useCallback(
    (emoji: string) => {
      if (!socket || !user) return;
      const payload: ReactionPayload = {
        userId: user.id,
        userName: user.displayName || user.name,
        emoji,
        timestamp: Date.now(),
      };
      socket.emit(SOCKET_EVENTS.REACTION, payload);
      reactionRef.current?.(emoji, payload.userName);
    },
    [socket, user]
  );

  // ── Hand raise ─────────────────────────────────────────────────────

  const handleToggleHandRaise = useCallback(() => {
    if (!socket || !user) return;
    const event = isHandRaised ? SOCKET_EVENTS.HAND_LOWER : SOCKET_EVENTS.HAND_RAISE;
    socket.emit(event, {
      userId: user.id,
      userName: user.displayName || user.name,
      timestamp: Date.now(),
    } as HandRaisePayload);
    setIsHandRaised(!isHandRaised);
  }, [socket, user, isHandRaised]);

  // ── Layout toggle ─────────────────────────────────────────────────

  const handleToggleLayout = useCallback(() => {
    setLayout((prev) => (prev === "bubbles" ? "grid" : "bubbles"));
  }, []);

  // ── Host controls: mute/kick ──────────────────────────────────────

  const handleMuteParticipant = useCallback(
    (targetUserId: string) => {
      if (!socket || !isLocalHost) return;
      socket.emit(SOCKET_EVENTS.HOST_MUTE, {
        targetUserId,
        roomId: meetingId,
      } as HostMutePayload);
    },
    [socket, isLocalHost, meetingId]
  );

  const handleKickParticipant = useCallback(
    (targetUserId: string) => {
      if (!socket || !isLocalHost) return;
      socket.emit(SOCKET_EVENTS.HOST_KICK, {
        targetUserId,
        roomId: meetingId,
      } as HostKickPayload);
    },
    [socket, isLocalHost, meetingId]
  );

  // ── Waiting room controls ────────────────────────────────────────

  const handleAdmitUser = useCallback(
    (userId: string) => {
      if (!socket || !isLocalHost) return;
      socket.emit(SOCKET_EVENTS.HOST_ADMIT, {
        userId,
        roomId: meetingId,
      } as WaitingRoomActionPayload);
      setWaitingUsers((prev) => prev.filter((u) => u.id !== userId));
    },
    [socket, isLocalHost, meetingId]
  );

  const handleDenyUser = useCallback(
    (userId: string) => {
      if (!socket || !isLocalHost) return;
      socket.emit(SOCKET_EVENTS.HOST_DENY, {
        userId,
        roomId: meetingId,
      } as WaitingRoomActionPayload);
      setWaitingUsers((prev) => prev.filter((u) => u.id !== userId));
    },
    [socket, isLocalHost, meetingId]
  );

  const handleAdmitAll = useCallback(() => {
    waitingUsers.forEach((u) => handleAdmitUser(u.id));
  }, [waitingUsers, handleAdmitUser]);

  // ── Leave / End call ─────────────────────────────────────────────

  const handleEndCall = useCallback(async () => {
    // Stop recording if active
    if (isRecording) handleStopRecording();

    // LiveKit transport cleanup is handled by the useTransport hook's
    // cleanup effect (runs on unmount / when enabled becomes false).

    screenStreamRef.current?.getTracks().forEach((t) => t.stop());

    if (socket) {
      socket.emit(SOCKET_EVENTS.LEAVE_ROOM, { roomId: meetingId });
    }

    stopMedia();
    clearRoomJoinSession(meetingId);

    try {
      await fetch(`/api/meetings/${meetingId}/leave`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      /* ignore */
    }

    router.push("/meetings");
  }, [meetingId, router, stopMedia, socket, isRecording, handleStopRecording]);

  const handleStartRecordingClick = useCallback(() => {
    if (!canRecord) {
      setMediaError("Recording is disabled for this meeting.");
      return;
    }

    handleStartRecording();
  }, [canRecord, handleStartRecording]);

  // ── Keyboard shortcuts ────────────────────────────────────────────

  useKeyboardShortcuts({
    toggleAudio,
    toggleVideo,
    toggleChat: () => {
      setShowChat((prev) => !prev);
      setShowParticipants(false);
    },
    toggleParticipants: () => {
      setShowParticipants((prev) => !prev);
      setShowChat(false);
    },
    toggleLayout: handleToggleLayout,
    toggleRecording: isRecording ? handleStopRecording : handleStartRecordingClick,
    toggleHandRaise: handleToggleHandRaise,
    leaveCall: handleEndCall,
  });

  // ── Cleanup on unmount ───────────────────────────────────────────
  // LiveKit transport cleanup handled by useTransport hook unmount

  useEffect(() => {
    return () => {
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // ── Find active screen-share presenter ────────────────────────────
  // Bug #3 fix: find the FIRST participant who is sharing, not just local
  const screenSharePresenter = participants.find((p) => p.isScreenSharing);
  const screenShareStream = screenSharePresenter
    ? screenSharePresenter.id === localUser.id
      ? screenStreamRef.current
      : effectiveRemoteStreams.get(screenSharePresenter.id) || null
    : null;

  // ── Build bubble participants via adapter ─────────────────────────

  const bubbleParticipants = participants.map((p) =>
    toParticipant(p, {
      isSpeaking: speakingPeers.has(p.id),
      stream:
        p.id === localUser.id
          ? (isScreenSharing ? screenStreamRef.current : localStream)
          : effectiveRemoteStreams.get(p.id) || null,
    })
  );

  // ── Render ───────────────────────────────────────────────────────

  if (!roomSession) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="meeting-root z-50 flex flex-col" aria-label="Meeting room">
      {/* Doodle decorations */}
      <div className="pointer-events-none fixed inset-0 z-[1]">
        <DoodleStar className="absolute top-24 left-[8%] opacity-30" color="#FFE600" size={18} />
        <DoodleSparkles className="absolute bottom-40 right-[12%] opacity-20" />
      </div>

      {/* Bug #6: Media error banner */}
      {mediaError && (
        <motion.div
          role="alert"
          className="relative z-30 mx-6 mt-2 flex items-center gap-2 rounded-xl border-2 border-[#FF6B6B] bg-[#FF6B6B]/10 px-4 py-2 text-sm text-[#FF6B6B]"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <AlertTriangle size={16} />
          <span>{mediaError}</span>
          <button
            className="ml-auto text-xs underline hover:no-underline cursor-pointer"
            onClick={() => {
              setMediaError(null);
              if (!roomSession) return;
              startMedia(
                roomSession.media.videoEnabled,
                roomSession.media.audioEnabled,
                {
                  videoDeviceId: roomSession.media.videoDeviceId,
                  audioDeviceId: roomSession.media.audioDeviceId,
                },
              ).catch(() => {});
            }}
          >
            Retry
          </button>
        </motion.div>
      )}

      {/* LiveKit error banner */}
      {livekitError && (
        <motion.div
          role="alert"
          className="relative z-30 mx-6 mt-2 flex items-center gap-2 rounded-xl border-2 border-[#FF6B6B] bg-[#FF6B6B]/10 px-4 py-2 text-sm text-[#FF6B6B]"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <AlertTriangle size={16} />
          <span>Connection error: {livekitError}</span>
        </motion.div>
      )}

      {/* Header bar */}
      <motion.header
        className="meeting-header relative z-20 flex items-center justify-between px-3 py-2 sm:px-6 sm:py-3"
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 25 }}
      >
        {/* Left: LIVE badge + timer */}
        <div className="flex items-center gap-1.5 sm:gap-3">
          <div className="flex items-center gap-2 rounded-full border-2 border-[#0A0A0A] bg-[#FF6B6B] px-3 py-1 shadow-[2px_2px_0_#0A0A0A]" role="status">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
            </span>
            <span className="text-[9px] sm:text-[11px] font-bold text-white" style={{ fontFamily: "var(--font-heading)" }}>LIVE</span>
          </div>
          <span className="text-sm font-mono text-[#0A0A0A]/40">{formatTime(elapsedTime)}</span>
          {/* Transport mode indicator */}
          <span
            className="hidden sm:inline text-xs px-2 py-0.5 rounded-full border-2 border-black bg-[#FFE600]"
          >
            SFU
          </span>
          {!isConnected && (
            <span className="flex items-center gap-1 text-xs text-[#FF6B6B]">
              <WifiOff size={12} /> Reconnecting...
            </span>
          )}
        </div>

        {/* Center: meeting code */}
        <span className="hidden sm:block text-xs font-mono text-[#0A0A0A]/25">{meetingId.slice(0, 8)}</span>

        {/* Right: connection quality + participant count + recording indicator */}
        <div className="flex items-center gap-1 sm:gap-2">
          <div className="hidden sm:block">
            <ConnectionIndicator quality={connectionQuality} rtt={rtt} packetLoss={packetLoss} />
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-[#0A0A0A]/15 px-3 py-1">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0A0A0A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-40">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <span className="text-xs font-bold text-[#0A0A0A]/50" style={{ fontFamily: "var(--font-heading)" }}>
              {participants.length}
            </span>
          </div>
          {isRecording && (
            <motion.div
              role="status"
              aria-label="Recording in progress"
              className="flex items-center gap-1.5 rounded-full border-2 border-[#FF6B6B] bg-[#FF6B6B]/10 px-3 py-1"
              animate={{ opacity: [1, 0.5, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              <span className="h-2 w-2 rounded-full bg-[#FF6B6B]" />
              <span className="text-[10px] font-bold text-[#FF6B6B]" style={{ fontFamily: "var(--font-heading)" }}>REC</span>
            </motion.div>
          )}
        </div>
      </motion.header>

      {/* Main content area */}
      <div ref={containerRef} className="relative z-10 flex-1 overflow-hidden">
        {/* Bubble layout or screen share */}
        <AnimatePresence mode="wait">
          {activeScreenShare && screenSharePresenter ? (
            <ScreenShareView
              key="screenshare"
              presenter={toParticipant(screenSharePresenter, {
                isSpeaking: speakingPeers.has(screenSharePresenter.id),
                stream:
                  screenSharePresenter.id === localUser.id
                    ? localStream
                    : effectiveRemoteStreams.get(screenSharePresenter.id) || null,
              })}
              participants={bubbleParticipants}
              selfId={localUser.id}
              onStopSharing={handleToggleScreenShare}
              screenStream={screenShareStream}
            />
          ) : containerSize.width > 0 ? (
            layout === "grid" ? (
              <GridLayout
                key="grid"
                participants={bubbleParticipants}
                containerWidth={containerSize.width}
                containerHeight={containerSize.height}
                selfId={localUser.id}
              />
            ) : (
              <BubbleLayout
                key="bubbles"
                participants={bubbleParticipants}
                containerWidth={containerSize.width}
                containerHeight={containerSize.height}
                selfId={localUser.id}
              />
            )
          ) : null}
        </AnimatePresence>

        {/* Chat panel -- slides in from right */}
        <ChatPanel
          isOpen={showChat}
          onClose={() => setShowChat(false)}
          messages={chatMessages}
          onSendMessage={handleSendMessage}
          currentUserId={user?.id || "local"}
        />

        {/* Participants panel */}
        <AnimatePresence>
          {showParticipants && (
            <motion.div
              initial={{ x: 300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 300, opacity: 0 }}
              transition={{ type: "spring", stiffness: 200, damping: 28 }}
              className="absolute right-0 top-0 bottom-0 z-30 w-[300px] border-l-2 border-[#0A0A0A] bg-[#FAFAF8] shadow-[-4px_0_0_#0A0A0A] overflow-y-auto"
            >
              <ParticipantList
                isOpen={showParticipants}
                onClose={() => setShowParticipants(false)}
                participants={participants.map((p) => ({
                  id: p.id,
                  name: p.name,
                  displayName: p.displayName,
                  avatar: p.avatar,
                  isVideoEnabled: p.isVideoEnabled,
                  isAudioEnabled: p.isAudioEnabled,
                  isScreenSharing: p.isScreenSharing,
                  isHost: p.id === (roomSession?.hostUserId || localUser.id),
                  isHandRaised: p.isHandRaised,
                }))}
                speakingPeers={speakingPeers}
                localUserId={user?.id || "local"}
                isLocalHost={isLocalHost}
                onMuteParticipant={handleMuteParticipant}
                onKickParticipant={handleKickParticipant}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Waiting room panel (host only) */}
        {isLocalHost && (
          <AnimatePresence>
            {showWaitingRoom && (
              <motion.div
                initial={{ x: 300, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 300, opacity: 0 }}
                transition={{ type: "spring", stiffness: 200, damping: 28 }}
                className="absolute right-0 top-0 bottom-0 z-30 w-[320px]"
              >
                <WaitingRoomPanel
                  isOpen={showWaitingRoom}
                  onClose={() => setShowWaitingRoom(false)}
                  waitingUsers={waitingUsers}
                  onAdmit={handleAdmitUser}
                  onDeny={handleDenyUser}
                  onAdmitAll={handleAdmitAll}
                />
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>

      {/* Reactions overlay */}
      <ReactionOverlay onReactionRef={reactionRef} />

      {/* Muted warning toast */}
      <AnimatePresence>
        {showMutedWarning && (
          <motion.div
            className="fixed bottom-28 left-1/2 z-[90] -translate-x-1/2 rounded-xl border-2 border-[#0A0A0A] bg-[#FFE600] px-4 py-2.5 shadow-[3px_3px_0_#0A0A0A]"
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
          >
            <span
              className="text-sm font-bold text-[#0A0A0A]"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              🎤 You&apos;re muted — press D to unmute
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reconnection overlay */}
      <ReconnectionOverlay
        isDisconnected={!isConnected && reconnectAttempts > 0}
        attemptCount={reconnectAttempts}
        maxAttempts={MAX_RECONNECT_ATTEMPTS}
        onLeave={handleEndCall}
      />

      {/* Controls */}
      <MeetingControls
        isVideoEnabled={isVideoEnabled}
        isAudioEnabled={isAudioEnabled}
        isScreenSharing={isScreenSharing}
        isRecording={isRecording}
        isChatOpen={showChat}
        isParticipantsOpen={showParticipants}
        isHandRaised={isHandRaised}
        layout={layout}
        unreadChatCount={chatUnreadCount}
        onToggleVideo={toggleVideo}
        onToggleAudio={toggleAudio}
        onToggleScreenShare={handleToggleScreenShare}
        canScreenShare={canScreenShare}
        onToggleChat={() => {
          setShowChat(!showChat);
          setShowParticipants(false);
        }}
        onToggleParticipants={() => {
          setShowParticipants(!showParticipants);
          setShowChat(false);
        }}
        onStartRecording={handleStartRecordingClick}
        onStopRecording={handleStopRecording}
        canRecord={canRecord}
        onReaction={handleReaction}
        onLeave={handleEndCall}
        onToggleHandRaise={handleToggleHandRaise}
        onToggleLayout={handleToggleLayout}
      />
    </div>
  );
}

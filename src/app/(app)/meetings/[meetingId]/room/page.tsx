"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
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
const MeetingTimerBanner = dynamic(() => import("@/components/meeting/MeetingTimerBanner"), { ssr: false });
import { toParticipant, type RoomParticipant } from "@/components/meeting/adapters";
import { DoodleStar, DoodleSparkles } from "@/components/Doodles";
import "./meeting.css";
import { useMediaDevices } from "@/hooks/useMediaDevices";
import { useVoiceActivity, type SpeechSegment } from "@/hooks/useVoiceActivity";
import { useAuth } from "@/hooks/useAuth";
import { useChat } from "@/hooks/useChat";
import { useRecording } from "@/hooks/useRecording";
import { useTranscription } from "@/hooks/useTranscription";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useMutedWarning } from "@/hooks/useMutedWarning";
import { useConnectionQuality } from "@/hooks/useConnectionQuality";
import { useMeetingTimer } from "@/hooks/useMeetingTimer";
import { useTransport } from "@/hooks/useTransport";
import { useDataChannel } from "@/hooks/useDataChannel";
import {
  DataMessageType,
  type DataMessage,
  type ReactionData,
  type HandRaiseData,
  type HandLowerData,
  type HostMuteData,
  type HostKickData,
} from "@/lib/livekit/data-messages";
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

  // Load roomSession eagerly from sessionStorage (synchronous) so media state
  // can be initialized correctly before the first render.
  const [roomSession] = useState<RoomJoinSession | null>(() =>
    loadRoomJoinSession(meetingId),
  );

  // ── Fetch meeting title + scheduled duration + host (with polling for host changes) ──
  const [meetingTitle, setMeetingTitle] = useState("");
  const [scheduledDuration, setScheduledDuration] = useState<number | undefined>();
  const [meetingType, setMeetingType] = useState<string>("regular");
  const [ghostConverted, setGhostConverted] = useState(false);
  const [currentHostId, setCurrentHostId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const fetchMeetingData = () => {
      fetch(`/api/meetings/${meetingId}`, { credentials: "include" })
        .then((r) => r.json())
        .then((d) => {
          if (!active) return;
          if (d.success && d.data?.title) setMeetingTitle(d.data.title);
          if (d.success && d.data?.scheduledDuration) setScheduledDuration(d.data.scheduledDuration);
          if (d.success && d.data?.type) {
            setMeetingType((prev) => {
              if (prev === "ghost" && d.data.type === "regular") {
                setGhostConverted(true);
              }
              return d.data.type;
            });
          }
          // Track host — could be a populated object or plain ID
          const hostId = d.data?.hostId?._id || d.data?.hostId;
          if (hostId) setCurrentHostId(hostId.toString());
        })
        .catch(() => {});
    };

    fetchMeetingData();
    // Poll every 5s to pick up host transfers
    const interval = setInterval(fetchMeetingData, 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [meetingId]);

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
  } = useMediaDevices({
    initialVideoEnabled: roomSession?.media.videoEnabled,
    initialAudioEnabled: roomSession?.media.audioEnabled,
  });

  const effectiveMediaError = mediaDeviceError || mediaError;

  // ── LiveKit transport ──────────────────────────────────────────────
  const localUser = useMemo(
    () =>
      user
        ? {
            id: user.id,
            name: user.name,
            displayName: user.displayName || user.name,
            avatar: user.avatar || undefined,
          }
        : { id: "local", name: "You", displayName: "You", avatar: undefined },
    [user],
  );

  const [isScreenSharing, setIsScreenSharing] = useState(false);

  const {
    transport,
    room,
    connectionState: livekitConnectionState,
    remoteStreams: livekitRemoteStreams,
    screenShareStreams: livekitScreenShareStreams,
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

  const isLivekitConnected = livekitConnectionState === "connected";

  // ── Data channel for signaling ─────────────────────────────────────
  const { sendReliable, sendLossy, onMessage } = useDataChannel(room);

  // ── Voice activity (speaker detection for transcripts) ──────────────
  const {
    isSpeaking: isLocalSpeaking,
    speechSegments,
    remoteSpeakingPeers: remoteSpeakingFromVAD,
    startMonitoring: startVoiceMonitoring,
    stopMonitoring: stopVoiceMonitoring,
  } = useVoiceActivity({
    room,
    userId: user?.id || "local",
    userName: user?.displayName || user?.name || "You",
  });

  // ── Room session bootstrap ────────────────────────────────────────
  // roomSession is loaded eagerly via useState initializer above.
  // Redirect if missing (user navigated directly without joining).
  useEffect(() => {
    if (!roomSession) {
      router.push(`/meetings/${meetingId}`);
    }
  }, [meetingId, router, roomSession]);

  // ── UI state ─────────────────────────────────────────────────────────
  const [showChat, setShowChat] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [layout, setLayout] = useState<"bubbles" | "grid">("bubbles");
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [showWaitingRoom, setShowWaitingRoom] = useState(false);
  const [waitingUsers, setWaitingUsers] = useState<WaitingUser[]>([]);
  const isLocalHost = !!(user && (
    currentHostId
      ? user.id === currentHostId
      : roomSession && user.id === roomSession.hostUserId
  ));
  const reactionRef = useRef<((emoji: string, userName: string) => void) | null>(null);
  const [handRaisedUsers, setHandRaisedUsers] = useState<Set<string>>(new Set());

  // ── Bubble layout container measurement ─────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  // ── Meeting timer with warning + extend support ──────────────────
  const [timerDismissed, setTimerDismissed] = useState(false);
  const meetingTimer = useMeetingTimer({
    meetingId,
    scheduledDuration,
    onTimeWarning: () => setTimerDismissed(false), // re-show banner on each warning
  });

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


  const isGhostMeeting = meetingType === "ghost";
  const canRecord = isGhostMeeting ? false : (roomSession?.permissions.allowRecording ?? false);
  const canScreenShare = roomSession?.permissions.allowScreenShare ?? true;

  // ── Chat hook ──────────────────────────────────────────────────────
  const {
    messages: chatMessages,
    sendMessage: handleSendMessage,
    unreadCount: chatUnreadCount,
    markRead: markChatRead,
    markUnread: markChatUnread,
  } = useChat(room, localUser.id, localUser.displayName);

  useEffect(() => {
    if (showChat) {
      markChatRead();
    } else {
      markChatUnread();
    }
  }, [showChat, markChatRead, markChatUnread]);

  // ── Remote participants (from LiveKit transport) ────────────────────
  const effectiveRemoteParticipants: RoomParticipant[] = livekitRemoteParticipants.map((p) => ({
    id: p.id,
    name: p.name,
    displayName: p.name,
    avatar: p.avatar || null,
    isVideoEnabled: p.isVideoEnabled ?? true,
    isAudioEnabled: p.isAudioEnabled ?? true,
    isScreenSharing: p.isScreenSharing ?? false,
    isHandRaised: handRaisedUsers.has(p.id),
  }));

  // Speaker detection: combine local + remote
  const speakingPeers = useMemo(
    () =>
      new Set([
        ...(isLocalSpeaking ? [user?.id || "local"] : []),
        ...remoteSpeakingFromVAD,
      ]),
    [isLocalSpeaking, user?.id, remoteSpeakingFromVAD],
  );
  const localStreamRef = useRef<MediaStream | null>(null);
  const mediaStartedRef = useRef(false);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);

  // Track speech segments for recording (ref to avoid re-renders)
  const speechSegmentsRef = useRef<SpeechSegment[]>([]);
  useEffect(() => {
    speechSegmentsRef.current = speechSegments;
  }, [speechSegments]);

  // ── Recording hook (captures browser tab via getDisplayMedia) ──────
  const {
    isRecording,
    startRecording: handleStartRecording,
    stopRecording: handleStopRecording,
  } = useRecording(localStream, livekitRemoteStreams, meetingId, room, speechSegmentsRef, meetingTitle);

  const isRecordingRef = useRef(isRecording);
  const handleStopRecordingRef = useRef(handleStopRecording);
  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);
  useEffect(() => { handleStopRecordingRef.current = handleStopRecording; }, [handleStopRecording]);

  // ── Transcription hook (VAD-driven: records only while speaking) ────
  // Disabled for ghost meetings — transcription only runs after consensus converts to regular
  useTranscription(
    localStream,
    meetingId,
    user?.id || "local",
    user?.displayName || user?.name || "You",
    isAudioEnabled,
    isLivekitConnected,
    isLocalSpeaking,
    !isGhostMeeting,
  );

  // ── Build full participants list ─────────────────────────────────────
  const participants: RoomParticipant[] = [
    {
      id: localUser.id,
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

  const activeScreenShare = participants.some((p) => p.isScreenSharing);

  // ── Muted warning ──────────────────────────────────────────────────
  const showMutedWarning = useMutedWarning(localStream, isAudioEnabled);

  // ── Connection quality monitoring ─────────────────────────────────
  const { quality: connectionQuality, rtt, packetLoss } = useConnectionQuality(transport);

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
          : "Failed to access camera or microphone. Please check your permissions.",
      );
    });
  }, [roomSession, startMedia]);

  // ── Data channel event handlers ─────────────────────────────────────

  // Reactions
  useEffect(() => {
    const unsub = onMessage(DataMessageType.REACTION, (msg: DataMessage) => {
      if (msg.type !== DataMessageType.REACTION) return;
      const data = msg as ReactionData;
      reactionRef.current?.(data.emoji, data.userName);
    });
    return unsub;
  }, [onMessage]);

  // Hand raise/lower
  useEffect(() => {
    const unsubRaise = onMessage(DataMessageType.HAND_RAISE, (msg: DataMessage) => {
      if (msg.type !== DataMessageType.HAND_RAISE) return;
      const data = msg as HandRaiseData;
      setHandRaisedUsers((prev) => new Set(prev).add(data.userId));
    });
    const unsubLower = onMessage(DataMessageType.HAND_LOWER, (msg: DataMessage) => {
      if (msg.type !== DataMessageType.HAND_LOWER) return;
      const data = msg as HandLowerData;
      setHandRaisedUsers((prev) => {
        const next = new Set(prev);
        next.delete(data.userId);
        return next;
      });
    });
    return () => {
      unsubRaise();
      unsubLower();
    };
  }, [onMessage]);

  // Host controls: mute and kick
  useEffect(() => {
    const unsubMute = onMessage(DataMessageType.HOST_MUTE, (msg: DataMessage) => {
      if (msg.type !== DataMessageType.HOST_MUTE) return;
      const data = msg as HostMuteData;
      if (data.targetUserId === localUser.id) {
        const audioTrack = localStreamRef.current?.getAudioTracks()[0];
        if (audioTrack?.enabled) {
          toggleAudio();
        }
      }
    });
    const unsubKick = onMessage(DataMessageType.HOST_KICK, (msg: DataMessage) => {
      if (msg.type !== DataMessageType.HOST_KICK) return;
      const data = msg as HostKickData;
      if (data.targetUserId === localUser.id) {
        if (isRecordingRef.current) handleStopRecordingRef.current();
        screenStreamRef.current?.getTracks().forEach((t) => t.stop());
        stopMedia();
        clearRoomJoinSession(meetingId);
        router.push("/meetings?kicked=true");
      }
    });
    return () => {
      unsubMute();
      unsubKick();
    };
  }, [onMessage, localUser.id, toggleAudio, stopMedia, meetingId, router]);

  // ── Waiting room HTTP polling (host only) ──────────────────────────
  useEffect(() => {
    if (!isLocalHost || !isLivekitConnected) return;

    let active = true;
    const poll = async () => {
      try {
        const res = await fetch(`/api/meetings/${meetingId}/waiting-status`, {
          credentials: "include",
        });
        if (res.ok && active) {
          const json = await res.json();
          const rawUsers = json.data?.users ?? json.users ?? [];
          const users: WaitingUser[] = rawUsers.map((u: WaitingUser) => ({
            id: u.id,
            name: u.name,
            displayName: u.displayName,
            avatar: u.avatar,
            joinedWaitingAt: u.joinedWaitingAt,
          }));
          setWaitingUsers(users);
          if (users.length > 0) setShowWaitingRoom(true);
        }
      } catch {
        // Polling is best-effort
      }
    };

    void poll();
    const interval = setInterval(poll, 3000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [isLocalHost, isLivekitConnected, meetingId]);

  // ── Screen sharing (via LiveKit transport) ──────────────────────────

  const handleToggleScreenShare = useCallback(async () => {
    if (!canScreenShare) {
      setMediaError("Screen sharing is disabled for this meeting.");
      return;
    }

    if (isScreenSharing) {
      // Update state FIRST so the overlay is removed immediately,
      // then clean up transport in the background.
      setIsScreenSharing(false);
      setScreenStream(null);
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      if (transport) {
        transport.stopScreenShare().catch(() => {});
      }
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });
        screenStreamRef.current = stream;
        setScreenStream(stream);
        setIsScreenSharing(true);

        if (transport) {
          await transport.startScreenShare(stream);
        }

        // Handle native "stop sharing" browser button
        const screenTrack = stream.getVideoTracks()[0];
        screenTrack.onended = () => {
          // Update state FIRST, then clean up transport
          setIsScreenSharing(false);
          setScreenStream(null);
          screenStreamRef.current?.getTracks().forEach((t) => t.stop());
          screenStreamRef.current = null;
          if (transport) {
            transport.stopScreenShare().catch(() => {});
          }
        };
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "NotAllowedError")) {
          void err;
        }
      }
    }
  }, [canScreenShare, isScreenSharing, transport]);

  // ── Reactions ────────────────────────────────────────────────────

  const handleReaction = useCallback(
    (emoji: string) => {
      const data: ReactionData = {
        type: DataMessageType.REACTION,
        userId: localUser.id,
        userName: localUser.displayName || localUser.name,
        emoji,
        timestamp: Date.now(),
      };
      void sendLossy(data);
      // Show locally immediately regardless of data channel state
      reactionRef.current?.(emoji, data.userName);
    },
    [localUser.id, localUser.displayName, localUser.name, sendLossy],
  );

  // ── Hand raise ─────────────────────────────────────────────────────

  const handleToggleHandRaise = useCallback(() => {
    if (isHandRaised) {
      void sendReliable({
        type: DataMessageType.HAND_LOWER,
        userId: localUser.id,
        timestamp: Date.now(),
      });
    } else {
      void sendReliable({
        type: DataMessageType.HAND_RAISE,
        userId: localUser.id,
        userName: localUser.displayName || localUser.name,
        timestamp: Date.now(),
      });
    }
    // Toggle local state immediately regardless of data channel state
    setIsHandRaised(!isHandRaised);
  }, [localUser.id, localUser.displayName, localUser.name, isHandRaised, sendReliable]);

  // ── Layout toggle ─────────────────────────────────────────────────

  const handleToggleLayout = useCallback(() => {
    setLayout((prev) => (prev === "bubbles" ? "grid" : "bubbles"));
  }, []);

  // ── Host controls: mute/kick ──────────────────────────────────────

  const handleMuteParticipant = useCallback(
    (targetUserId: string) => {
      if (!isLocalHost) return;
      void sendReliable(
        {
          type: DataMessageType.HOST_MUTE,
          targetUserId,
        },
        [targetUserId],
      );
    },
    [isLocalHost, sendReliable],
  );

  const handleKickParticipant = useCallback(
    (targetUserId: string) => {
      if (!isLocalHost) return;
      void sendReliable(
        {
          type: DataMessageType.HOST_KICK,
          targetUserId,
        },
        [targetUserId],
      );
    },
    [isLocalHost, sendReliable],
  );

  const handleTransferHost = useCallback(
    async (targetUserId: string) => {
      if (!isLocalHost) return;
      try {
        const res = await fetch(`/api/meetings/${meetingId}/transfer-host`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ newHostUserId: targetUserId }),
        });
        if (res.ok) {
          setCurrentHostId(targetUserId);
        }
      } catch {
        /* best-effort */
      }
    },
    [isLocalHost, meetingId],
  );

  // ── Waiting room controls ────────────────────────────────────────

  const handleAdmitUser = useCallback(
    async (userId: string) => {
      if (!isLocalHost) return;
      try {
        await fetch(`/api/meetings/${meetingId}/admit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ userId }),
        });
      } catch {
        /* best-effort */
      }
      setWaitingUsers((prev) => prev.filter((u) => u.id !== userId));
    },
    [isLocalHost, meetingId],
  );

  const handleDenyUser = useCallback(
    async (userId: string) => {
      if (!isLocalHost) return;
      try {
        await fetch(`/api/meetings/${meetingId}/deny`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ userId }),
        });
      } catch {
        /* best-effort */
      }
      setWaitingUsers((prev) => prev.filter((u) => u.id !== userId));
    },
    [isLocalHost, meetingId],
  );

  const handleAdmitAll = useCallback(() => {
    waitingUsers.forEach((u) => void handleAdmitUser(u.id));
  }, [waitingUsers, handleAdmitUser]);

  // ── Leave / End call ─────────────────────────────────────────────

  const handleEndCall = useCallback(async () => {
    if (isRecording) handleStopRecording();

    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
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
  }, [meetingId, router, stopMedia, isRecording, handleStopRecording]);

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
  useEffect(() => {
    return () => {
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // ── Find active screen-share presenter ────────────────────────────
  const screenSharePresenter = participants.find((p) => p.isScreenSharing);
  const screenShareStream = screenSharePresenter
    ? screenSharePresenter.id === localUser.id
      ? screenStream
      : livekitScreenShareStreams.get(screenSharePresenter.id) || null
    : null;

  // ── Build bubble participants via adapter ─────────────────────────

  const bubbleParticipants = participants.map((p) =>
    toParticipant(p, {
      isSpeaking: speakingPeers.has(p.id),
      stream:
        p.id === localUser.id
          ? (isScreenSharing ? screenStream : localStream)
          : livekitRemoteStreams.get(p.id) || null,
    }),
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
      {effectiveMediaError && (
        <motion.div
          role="alert"
          className="relative z-30 mx-6 mt-2 flex items-center gap-2 rounded-xl border-2 border-[#FF6B6B] bg-[#FF6B6B]/10 px-4 py-2 text-sm text-[#FF6B6B]"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <AlertTriangle size={16} />
          <span>{effectiveMediaError}</span>
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
          <span className={`text-sm font-mono ${meetingTimer.isOvertime ? "text-[#FF6B6B]" : meetingTimer.isWarningZone ? "text-[#FFB800]" : "text-[#0A0A0A]/40"}`}>
            {meetingTimer.elapsedFormatted}
          </span>
          {/* Transport mode indicator */}
          <span className="hidden sm:inline text-xs px-2 py-0.5 rounded-full border-2 border-black bg-[#FFE600]">
            SFU
          </span>
          {!isLivekitConnected && livekitConnectionState !== "disconnected" && (
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

      {/* Timer warning banner — shows 1 min before end or when overtime */}
      {!timerDismissed && (
        <MeetingTimerBanner
          remainingFormatted={meetingTimer.remainingFormatted}
          remainingSeconds={meetingTimer.remainingSeconds}
          isWarningZone={meetingTimer.isWarningZone}
          isOvertime={meetingTimer.isOvertime}
          isHost={isLocalHost}
          onExtend={meetingTimer.extendMeeting}
          onDismiss={() => setTimerDismissed(true)}
        />
      )}

      {/* Main content area */}
      <div ref={containerRef} className="relative z-10 flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          {activeScreenShare && screenSharePresenter ? (
            <ScreenShareView
              key="screenshare"
              presenter={toParticipant(screenSharePresenter, {
                isSpeaking: speakingPeers.has(screenSharePresenter.id),
                stream:
                  screenSharePresenter.id === localUser.id
                    ? localStream
                    : livekitRemoteStreams.get(screenSharePresenter.id) || null,
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

        {/* Chat panel */}
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
                onTransferHost={handleTransferHost}
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

      {/* Ghost → Regular conversion toast */}
      <AnimatePresence>
        {ghostConverted && (
          <motion.div
            className="fixed top-20 left-1/2 z-[90] -translate-x-1/2 rounded-xl border-2 border-[#0A0A0A] bg-[#7C3AED] px-5 py-3 shadow-[3px_3px_0_#0A0A0A]"
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
          >
            <span className="text-sm font-bold text-white" style={{ fontFamily: "var(--font-heading)" }}>
              Room converted to regular — recording & transcription now available
            </span>
            <button
              className="ml-3 text-xs text-white/70 underline hover:text-white cursor-pointer"
              onClick={() => setGhostConverted(false)}
            >
              Dismiss
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reconnection overlay — uses LiveKit connection state */}
      <ReconnectionOverlay
        isDisconnected={livekitConnectionState === "reconnecting"}
        attemptCount={1}
        maxAttempts={5}
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

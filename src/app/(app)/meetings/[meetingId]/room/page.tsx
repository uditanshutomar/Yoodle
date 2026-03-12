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
  type SignalOfferPayload,
  type SignalAnswerPayload,
  type SignalIceCandidatePayload,
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
  saveRoomJoinSession,
  type RoomJoinSession,
} from "@/lib/meetings/room-session";

// ── Types ──────────────────────────────────────────────────────────────

interface PeerData {
  connection: RTCPeerConnection;
  stream: MediaStream;
  pendingCandidates: RTCIceCandidateInit[];
}

// ── ICE servers helper ─────────────────────────────────────────────────

async function getIceServers(): Promise<RTCIceServer[]> {
  try {
    const res = await fetch("/api/turn-credentials", { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) return data;
      return data.data?.iceServers || data.iceServers || data;
    }
  } catch {
    // fallback
  }
  return [{ urls: "stun:stun.l.google.com:19302" }];
}

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

  // ── Transport mode ─────────────────────────────────────────────────
  const [transportMode, setTransportMode] = useState<"p2p" | "livekit">("p2p");

  // ── Room session bootstrap ────────────────────────────────────────
  useEffect(() => {
    const session = loadRoomJoinSession(meetingId);
    if (!session) {
      router.push(`/meetings/${meetingId}`);
      return;
    }

    setRoomSession(session);
    setTransportMode(session.transportMode);
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

  // ── LiveKit transport (only active when mode is "livekit") ────────
  const {
    remoteStreams: livekitRemoteStreams,
    remoteParticipants: livekitRemoteParticipants,
    error: livekitError,
  } = useTransport({
    meetingId,
    mode: transportMode,
    localStream,
    user: {
      id: localUser.id,
      name: localUser.name,
      avatar: localUser.avatar || undefined,
      isAudioEnabled,
      isVideoEnabled,
      isScreenSharing,
    },
    enabled: transportMode === "livekit" && !!localStream,
  });

  // If LiveKit fails, fall back to P2P so the meeting still works
  useEffect(() => {
    if (livekitError && transportMode === "livekit") {
      console.warn("[transport] LiveKit failed, falling back to P2P:", livekitError);
      setTransportMode("p2p");
      setRoomSession((prev) => {
        if (!prev) return prev;
        const nextSession = { ...prev, transportMode: "p2p" as const };
        saveRoomJoinSession(meetingId, nextSession);
        return nextSession;
      });
    }
  }, [livekitError, meetingId, transportMode]);

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

  // ── WebRTC state ─────────────────────────────────────────────────────
  const [remoteParticipants, setRemoteParticipants] = useState<RoomUser[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());

  // ── Transport upgrade check ───────────────────────────────────────
  useEffect(() => {
    if (transportMode !== "p2p") return;
    const totalParticipants = remoteParticipants.length + 1;
    if (totalParticipants >= 5) {
      // 5+ participants on P2P — LiveKit recommended for better quality
    }
  }, [remoteParticipants.length, transportMode]);

  // ── Resolve effective remote streams based on transport mode ──────
  const effectiveRemoteStreams = transportMode === "livekit" ? livekitRemoteStreams : remoteStreams;

  // For LiveKit mode, convert transport participants to RoomUser format
  const effectiveRemoteParticipants: RoomUser[] = transportMode === "livekit"
    ? livekitRemoteParticipants.map((p) => ({
        id: p.id,
        socketId: "",
        name: p.name,
        displayName: p.name,
        avatar: p.avatar || null,
        isVideoEnabled: true,
        isAudioEnabled: true,
        isScreenSharing: false,
        isHandRaised: false,
      }))
    : remoteParticipants;

  // Speaker detection: combine local + remote
  const speakingPeers = new Set([
    ...(isLocalSpeaking ? [user?.id || "local"] : []),
    ...remoteSpeakingFromVAD,
  ]);
  const peersRef = useRef<Map<string, PeerData>>(new Map());
  const iceServersRef = useRef<RTCIceServer[]>([]);
  const localStreamRef = useRef<MediaStream | null>(null);
  const joinedRef = useRef(false);
  const mediaStartedRef = useRef(false);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const makingOfferRef = useRef<Set<string>>(new Set());
  const earlyCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

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
  const { quality: connectionQuality, rtt, packetLoss } = useConnectionQuality(peersRef.current);

  // ── Sync remote streams from peersRef to React state ────────────────

  const syncStreams = useCallback(() => {
    const streams = new Map<string, MediaStream>();
    peersRef.current.forEach((peer, peerId) => {
      streams.set(peerId, peer.stream);
    });
    setRemoteStreams(new Map(streams));
  }, []);

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

  // ── Process pending ICE candidates for a peer ────────────────────────

  const processPendingCandidates = useCallback(async (peerId: string) => {
    const peer = peersRef.current.get(peerId);
    if (!peer || peer.pendingCandidates.length === 0) return;

    const candidates = [...peer.pendingCandidates];
    peer.pendingCandidates = [];

    for (const candidate of candidates) {
      try {
        await peer.connection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {
        // ICE candidate add failed — non-critical
      }
    }
  }, []);

  // ── Clean up a peer connection ──────────────────────────────────────

  const cleanupPeer = useCallback((peerId: string) => {
    const peer = peersRef.current.get(peerId);
    if (peer) {
      peer.connection.onicecandidate = null;
      peer.connection.ontrack = null;
      peer.connection.onnegotiationneeded = null;
      peer.connection.onconnectionstatechange = null;
      peer.connection.oniceconnectionstatechange = null;
      peer.connection.close();
      peersRef.current.delete(peerId);
    }
    makingOfferRef.current.delete(peerId);
    syncStreams();
  }, [syncStreams]);

  // ── Create a peer connection for a remote user ───────────────────────

  const createPeerConnection = useCallback(
    (remoteUserId: string): RTCPeerConnection => {
      cleanupPeer(remoteUserId);

      const pc = new RTCPeerConnection({
        iceServers: iceServersRef.current,
        iceCandidatePoolSize: 10,
      });

      const remoteStream = new MediaStream();
      const earlyCandidates = earlyCandidatesRef.current.get(remoteUserId) || [];
      earlyCandidatesRef.current.delete(remoteUserId);
      peersRef.current.set(remoteUserId, {
        connection: pc,
        stream: remoteStream,
        pendingCandidates: earlyCandidates,
      });

      // Add local tracks to the connection
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current!);
        });
      }

      // ICE candidate -> send to remote via socket
      pc.onicecandidate = (event) => {
        if (event.candidate && socket) {
          socket.emit(SOCKET_EVENTS.ICE_CANDIDATE, {
            targetId: remoteUserId,
            senderId: localUser.id,
            candidate: event.candidate.toJSON(),
          } as SignalIceCandidatePayload);
        }
      };

      // Receive remote tracks
      pc.ontrack = (event) => {
        event.streams[0]?.getTracks().forEach((track) => {
          remoteStream.addTrack(track);
        });
        syncStreams();
      };

      // Monitor connection state
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed") {
          pc.restartIce();
        } else if (pc.connectionState === "closed") {
          cleanupPeer(remoteUserId);
        }
      };

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === "failed") {
          pc.restartIce();
        }
      };

      return pc;
    },
    [socket, localUser.id, syncStreams, cleanupPeer]
  );

  // ── Create offer to a remote peer ───────────────────────────────────

  const createOffer = useCallback(
    async (remoteUserId: string) => {
      if (peersRef.current.has(remoteUserId)) return;

      const pc = createPeerConnection(remoteUserId);
      try {
        makingOfferRef.current.add(remoteUserId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        if (pc.localDescription) {
          socket?.emit(SOCKET_EVENTS.OFFER, {
            targetId: remoteUserId,
            senderId: localUser.id,
            offer: pc.localDescription,
          } as SignalOfferPayload);
        }
      } catch {
        // Offer creation failed
      } finally {
        makingOfferRef.current.delete(remoteUserId);
      }
    },
    [createPeerConnection, socket, localUser.id]
  );

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

    // Pre-fetch ICE servers in parallel
    getIceServers().then((servers) => {
      iceServersRef.current = servers;
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
      peersRef.current.forEach((peer) => peer.connection.close());
      peersRef.current.clear();
      setRemoteParticipants([]);
      syncStreams();
      socket.emit(SOCKET_EVENTS.JOIN_ROOM, {
        roomId: roomSession.roomId,
        user: roomUser,
      });
    }

    // ── Event handlers ──────────────────────────────────────────────

    const handleRoomUsers = (users: RoomUser[]) => {
      const remoteUsers = users.filter((u) => u.id !== user.id);
      setRemoteParticipants(remoteUsers);
      remoteUsers.forEach((u) => {
        if (!peersRef.current.has(u.id)) createOffer(u.id);
      });
    };

    const handleUserJoined = (roomUser: RoomUser) => {
      setRemoteParticipants((prev) => {
        if (prev.find((p) => p.id === roomUser.id)) return prev;
        return [...prev, roomUser];
      });
      if (!peersRef.current.has(roomUser.id)) createOffer(roomUser.id);
    };

    const handleUserLeft = ({ userId }: { userId: string }) => {
      cleanupPeer(userId);
      setRemoteParticipants((prev) => prev.filter((p) => p.id !== userId));
    };

    // ── Receive offer -> create answer (with glare handling) ────────

    const handleOffer = async (payload: SignalOfferPayload) => {
      const { senderId } = payload;
      const isPolite = user.id < senderId;
      const existingPeer = peersRef.current.get(senderId);
      const offerCollision =
        makingOfferRef.current.has(senderId) ||
        (existingPeer && existingPeer.connection.signalingState !== "stable");

      if (offerCollision && !isPolite) return;

      if (offerCollision && isPolite && existingPeer) {
        try {
          await existingPeer.connection.setLocalDescription({ type: "rollback" });
        } catch {
          cleanupPeer(senderId);
        }
      }

      let pc: RTCPeerConnection;
      const peer = peersRef.current.get(senderId);
      if (peer && peer.connection.signalingState !== "closed") {
        pc = peer.connection;
      } else {
        pc = createPeerConnection(senderId);
      }

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.offer));
        await processPendingCandidates(senderId);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        if (pc.localDescription) {
          socket.emit(SOCKET_EVENTS.ANSWER, {
            targetId: senderId,
            senderId: user.id,
            answer: pc.localDescription,
          } as SignalAnswerPayload);
        }
      } catch {
        // Failed to handle offer
      }
    };

    const handleAnswer = async (payload: SignalAnswerPayload) => {
      const peer = peersRef.current.get(payload.senderId);
      if (!peer) return;

      const { signalingState } = peer.connection;
      if (signalingState !== "have-local-offer" && signalingState !== "have-remote-pranswer") {
        return;
      }

      try {
        await peer.connection.setRemoteDescription(
          new RTCSessionDescription(payload.answer)
        );
        await processPendingCandidates(payload.senderId);
      } catch {
        // Failed to set remote description
      }
    };

    // ── Receive ICE candidate (with queuing) ─────────────────────────

    const handleIceCandidate = async (payload: SignalIceCandidatePayload) => {
      const peer = peersRef.current.get(payload.senderId);
      if (!peer) {
        if (!earlyCandidatesRef.current.has(payload.senderId)) {
          earlyCandidatesRef.current.set(payload.senderId, []);
        }
        earlyCandidatesRef.current.get(payload.senderId)!.push(payload.candidate);
        return;
      }

      if (!peer.connection.remoteDescription) {
        peer.pendingCandidates.push(payload.candidate);
        return;
      }

      try {
        await peer.connection.addIceCandidate(new RTCIceCandidate(payload.candidate));
      } catch {
        // ICE candidate add failed
      }
    };

    const handleMediaState = (payload: MediaStatePayload) => {
      setRemoteParticipants((prev) =>
        prev.map((p) =>
          p.id === payload.userId
            ? { ...p, isVideoEnabled: payload.isVideoEnabled, isAudioEnabled: payload.isAudioEnabled }
            : p
        )
      );
    };

    const handleReaction = (payload: ReactionPayload) => {
      reactionRef.current?.(payload.emoji, payload.userName);
    };

    const handleScreenShareStart = (payload: ScreenSharePayload) => {
      setRemoteParticipants((prev) =>
        prev.map((p) =>
          p.id === payload.userId ? { ...p, isScreenSharing: true } : p
        )
      );
    };

    const handleScreenShareStop = (payload: ScreenSharePayload) => {
      setRemoteParticipants((prev) =>
        prev.map((p) =>
          p.id === payload.userId ? { ...p, isScreenSharing: false } : p
        )
      );
    };

    // ── Hand raise events ────────────────────────────────────────────
    const handleHandRaised = (payload: HandRaisePayload) => {
      setRemoteParticipants((prev) =>
        prev.map((p) =>
          p.id === payload.userId ? { ...p, isHandRaised: true } : p
        )
      );
    };

    const handleHandLowered = (payload: HandRaisePayload) => {
      setRemoteParticipants((prev) =>
        prev.map((p) =>
          p.id === payload.userId ? { ...p, isHandRaised: false } : p
        )
      );
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

      peersRef.current.forEach((peer) => {
        peer.connection.onicecandidate = null;
        peer.connection.ontrack = null;
        peer.connection.onnegotiationneeded = null;
        peer.connection.onconnectionstatechange = null;
        peer.connection.oniceconnectionstatechange = null;
        peer.connection.close();
      });
      peersRef.current.clear();

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

    socket.on(SOCKET_EVENTS.ROOM_USERS, handleRoomUsers);
    socket.on(SOCKET_EVENTS.USER_JOINED, handleUserJoined);
    socket.on(SOCKET_EVENTS.USER_LEFT, handleUserLeft);
    socket.on(SOCKET_EVENTS.OFFER, handleOffer);
    socket.on(SOCKET_EVENTS.ANSWER, handleAnswer);
    socket.on(SOCKET_EVENTS.ICE_CANDIDATE, handleIceCandidate);
    socket.on(SOCKET_EVENTS.MEDIA_STATE_CHANGED, handleMediaState);
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
      socket.off(SOCKET_EVENTS.ROOM_USERS, handleRoomUsers);
      socket.off(SOCKET_EVENTS.USER_JOINED, handleUserJoined);
      socket.off(SOCKET_EVENTS.USER_LEFT, handleUserLeft);
      socket.off(SOCKET_EVENTS.OFFER, handleOffer);
      socket.off(SOCKET_EVENTS.ANSWER, handleAnswer);
      socket.off(SOCKET_EVENTS.ICE_CANDIDATE, handleIceCandidate);
      socket.off(SOCKET_EVENTS.MEDIA_STATE_CHANGED, handleMediaState);
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
    syncStreams,
    createOffer,
    createPeerConnection,
    processPendingCandidates,
    cleanupPeer,
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

  // ── Screen sharing ───────────────────────────────────────────────

  const replaceVideoTrackInPeers = useCallback(async (newTrack: MediaStreamTrack) => {
    const replacePromises: Promise<void>[] = [];
    peersRef.current.forEach((peer) => {
      const sender = peer.connection
        .getSenders()
        .find((s) => s.track?.kind === "video");
      if (sender) {
        replacePromises.push(
          sender.replaceTrack(newTrack).catch(() => {
            // Track replace failed for peer
          })
        );
      }
    });
    await Promise.all(replacePromises);
  }, []);

  const handleToggleScreenShare = useCallback(async () => {
    if (!canScreenShare) {
      setMediaError("Screen sharing is disabled for this meeting.");
      return;
    }

    if (isScreenSharing) {
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      setIsScreenSharing(false);

      if (localStreamRef.current) {
        const videoTrack = localStreamRef.current.getVideoTracks()[0];
        if (videoTrack) await replaceVideoTrackInPeers(videoTrack);
      }

      // Broadcast screen share stop to other participants
      if (socket && user) {
        socket.emit(SOCKET_EVENTS.SCREEN_SHARE_STOP);
      }
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        });
        screenStreamRef.current = screenStream;
        setIsScreenSharing(true);

        const screenTrack = screenStream.getVideoTracks()[0];
        await replaceVideoTrackInPeers(screenTrack);

        // Broadcast screen share start to other participants
        if (socket && user) {
          socket.emit(SOCKET_EVENTS.SCREEN_SHARE_START);
        }

        // Handle native "stop sharing" browser button
        screenTrack.onended = async () => {
          setIsScreenSharing(false);
          screenStreamRef.current = null;
          if (localStreamRef.current) {
            const camTrack = localStreamRef.current.getVideoTracks()[0];
            if (camTrack) await replaceVideoTrackInPeers(camTrack);
          }
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
  }, [canScreenShare, isScreenSharing, replaceVideoTrackInPeers, socket, user]);

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

    // P2P peer cleanup
    peersRef.current.forEach((peer) => {
      peer.connection.onicecandidate = null;
      peer.connection.ontrack = null;
      peer.connection.onnegotiationneeded = null;
      peer.connection.onconnectionstatechange = null;
      peer.connection.oniceconnectionstatechange = null;
      peer.connection.close();
    });
    peersRef.current.clear();

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

  useEffect(() => {
    const peers = peersRef.current;
    const screenStream = screenStreamRef.current;
    return () => {
      peers.forEach((peer) => {
        peer.connection.onicecandidate = null;
        peer.connection.ontrack = null;
        peer.connection.onnegotiationneeded = null;
        peer.connection.onconnectionstatechange = null;
        peer.connection.oniceconnectionstatechange = null;
        peer.connection.close();
      });
      peers.clear();
      screenStream?.getTracks().forEach((t) => t.stop());
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
            className="hidden sm:inline text-xs px-2 py-0.5 rounded-full border-2 border-black"
            style={{
              backgroundColor: transportMode === "livekit" ? "#FFE600" : "#E0E0E0",
            }}
          >
            {transportMode === "livekit" ? "SFU" : "P2P"}
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

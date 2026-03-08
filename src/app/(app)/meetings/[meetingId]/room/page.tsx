"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { WifiOff } from "lucide-react";
import BubbleLayout from "@/components/meeting/BubbleLayout";
import MeetingControls from "@/components/meeting/MeetingControls";
import ChatPanel from "@/components/meeting/ChatPanel";
import ScreenShareView from "@/components/meeting/ScreenShareView";
import ParticipantList from "@/components/meeting/ParticipantList";
import ReactionOverlay from "@/components/meeting/ReactionOverlay";
import { toParticipant } from "@/components/meeting/adapters";
import { DoodleStar, DoodleSparkles } from "@/components/Doodles";
import "./meeting.css";
import { useMediaDevices } from "@/hooks/useMediaDevices";
import { useVoiceActivity, type SpeechSegment } from "@/hooks/useVoiceActivity";
import { useAuth } from "@/hooks/useAuth";
import { useSocket } from "@/hooks/useSocket";
import {
  SOCKET_EVENTS,
  type RoomUser,
  type SignalOfferPayload,
  type SignalAnswerPayload,
  type SignalIceCandidatePayload,
  type MediaStatePayload,
  type ChatMessagePayload,
  type ReactionPayload,
  type ScreenSharePayload,
  type RecordingStatusPayload,
} from "@/lib/realtime/socket-events";

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
      // API returns a flat array of ice servers
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

  const {
    stream: localStream,
    isVideoEnabled,
    isAudioEnabled,
    toggleVideo,
    toggleAudio,
    startMedia,
    stopMedia,
  } = useMediaDevices();

  // ── Voice activity (speaker detection for transcripts) ──────────────
  const {
    isSpeaking: isLocalSpeaking,
    audioLevel: localAudioLevel,
    speechSegments,
    remoteSpeakingPeers: remoteSpeakingFromVAD,
    startMonitoring: startVoiceMonitoring,
    stopMonitoring: stopVoiceMonitoring,
  } = useVoiceActivity({
    socket,
    userId: user?.id || "local",
    userName: user?.displayName || user?.name || "You",
  });

  // ── UI state ─────────────────────────────────────────────────────────
  const [showChat, setShowChat] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const reactionRef = useRef<((emoji: string, userName: string) => void) | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessagePayload[]>([]);

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

  // ── WebRTC state ─────────────────────────────────────────────────────
  const [remoteParticipants, setRemoteParticipants] = useState<RoomUser[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  // Speaker detection is handled by useVoiceActivity — combine local + remote
  const speakingPeers = new Set([
    ...(isLocalSpeaking ? [user?.id || "local"] : []),
    ...remoteSpeakingFromVAD,
  ]);
  const audioLevels = new Map<string, number>([
    [user?.id || "local", localAudioLevel],
  ]);
  const peersRef = useRef<Map<string, PeerData>>(new Map());
  const iceServersRef = useRef<RTCIceServer[]>([]);
  const localStreamRef = useRef<MediaStream | null>(null);
  const joinedRef = useRef(false);
  const mediaStartedRef = useRef(false);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const makingOfferRef = useRef<Set<string>>(new Set());
  const earlyCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

  // ── Recording state ──────────────────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mixedDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const audioSourcesRef = useRef<MediaStreamAudioSourceNode[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Transcription ref (background, automatic) ──────────────────────
  const transcriptionRecorderRef = useRef<MediaRecorder | null>(null);

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

  // Track speech segments for recording (ref to avoid re-renders)
  const speechSegmentsRef = useRef<SpeechSegment[]>([]);
  useEffect(() => {
    speechSegmentsRef.current = speechSegments;
  }, [speechSegments]);

  const localUser = user
    ? {
        id: user.id,
        name: user.name,
        displayName: user.displayName || user.name,
        avatar: user.avatar || undefined,
      }
    : { id: "local", name: "You", displayName: "You", avatar: undefined };

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
    },
    ...remoteParticipants,
  ];

  // ── Sync remote streams from peersRef to React state ─────────────────

  const syncStreams = useCallback(() => {
    const streams = new Map<string, MediaStream>();
    peersRef.current.forEach((peer, peerId) => {
      streams.set(peerId, peer.stream);
    });
    setRemoteStreams(new Map(streams));
  }, []);

  // ── Process pending ICE candidates for a peer ────────────────────────

  const processPendingCandidates = useCallback(async (peerId: string) => {
    const peer = peersRef.current.get(peerId);
    if (!peer || peer.pendingCandidates.length === 0) return;

    const candidates = [...peer.pendingCandidates];
    peer.pendingCandidates = [];

    for (const candidate of candidates) {
      try {
        await peer.connection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error(`[WebRTC] Error adding pending ICE candidate for ${peerId}:`, err);
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
      // Clean up existing connection
      cleanupPeer(remoteUserId);

      const pc = new RTCPeerConnection({
        iceServers: iceServersRef.current,
        iceCandidatePoolSize: 10,
      });

      // Outgoing stream container — drain any early candidates
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
          console.warn(`[WebRTC] Peer ${remoteUserId} connection failed, attempting ICE restart`);
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
      // Prevent duplicate connections
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
      } catch (err) {
        console.error("[WebRTC] Failed to create offer:", err);
      } finally {
        makingOfferRef.current.delete(remoteUserId);
      }
    },
    [createPeerConnection, socket, localUser.id]
  );

  // ── Start media immediately on mount (don't wait for socket) ────────

  useEffect(() => {
    if (mediaStartedRef.current) return;
    mediaStartedRef.current = true;
    // Fire and forget — start camera/mic right away so video shows instantly
    startMedia(true, true);
    // Pre-fetch ICE servers in parallel
    getIceServers().then((servers) => {
      iceServersRef.current = servers;
    });
  }, [startMedia]);

  // ── Socket event setup (handles initial join AND reconnection) ──────

  useEffect(() => {
    if (!socket || !isConnected || !user) return;

    const roomUser = {
      id: user.id,
      name: user.name,
      displayName: user.displayName,
      avatar: user.avatar,
    };

    if (!joinedRef.current) {
      // ── First time: join room (media already starting above) ──────
      socket.emit(SOCKET_EVENTS.JOIN_ROOM, { roomId: meetingId, user: roomUser });
      joinedRef.current = true;
    } else {
      // ── Reconnection: tear down stale peers, re-join room ────────
      console.log("[WebRTC] Socket reconnected — re-joining room");
      peersRef.current.forEach((peer) => peer.connection.close());
      peersRef.current.clear();
      setRemoteParticipants([]);
      syncStreams();
      socket.emit(SOCKET_EVENTS.JOIN_ROOM, { roomId: meetingId, user: roomUser });
    }

    // ── Event handlers (attached on every connect/reconnect) ────────

    const handleRoomUsers = (users: RoomUser[]) => {
      const remoteUsers = users.filter((u) => u.id !== user.id);
      setRemoteParticipants(remoteUsers);

      // Create offers only to users we don't already have connections to
      remoteUsers.forEach((u) => {
        if (!peersRef.current.has(u.id)) {
          createOffer(u.id);
        }
      });
    };

    const handleUserJoined = (roomUser: RoomUser) => {
      setRemoteParticipants((prev) => {
        if (prev.find((p) => p.id === roomUser.id)) return prev;
        return [...prev, roomUser];
      });
      // Only create offer if we don't have a connection already
      if (!peersRef.current.has(roomUser.id)) {
        createOffer(roomUser.id);
      }
    };

    const handleUserLeft = ({ userId }: { userId: string }) => {
      cleanupPeer(userId);
      setRemoteParticipants((prev) => prev.filter((p) => p.id !== userId));
    };

    // ── Receive offer -> create answer (with glare handling) ────────

    const handleOffer = async (payload: SignalOfferPayload) => {
      const { senderId } = payload;

      // Glare handling: both sides sent offers simultaneously
      const isPolite = user.id < senderId;
      const existingPeer = peersRef.current.get(senderId);
      const offerCollision =
        makingOfferRef.current.has(senderId) ||
        (existingPeer && existingPeer.connection.signalingState !== "stable");

      if (offerCollision && !isPolite) {
        console.log(`[WebRTC] Ignoring offer from ${senderId} (glare, impolite)`);
        return;
      }

      // If collision and we're polite, rollback our offer
      if (offerCollision && isPolite && existingPeer) {
        try {
          await existingPeer.connection.setLocalDescription({ type: "rollback" });
        } catch {
          // Rollback failed — recreate the connection
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
      } catch (err) {
        console.error("[WebRTC] Failed to handle offer:", err);
      }
    };

    const handleAnswer = async (payload: SignalAnswerPayload) => {
      const peer = peersRef.current.get(payload.senderId);
      if (!peer) return;

      // Accept answer in have-local-offer or have-remote-pranswer states
      const { signalingState } = peer.connection;
      if (signalingState !== "have-local-offer" && signalingState !== "have-remote-pranswer") {
        console.warn(`[WebRTC] Ignoring answer in state: ${signalingState}`);
        return;
      }

      try {
        await peer.connection.setRemoteDescription(
          new RTCSessionDescription(payload.answer)
        );
        await processPendingCandidates(payload.senderId);
      } catch (err) {
        console.error("[WebRTC] Failed to set remote description:", err);
      }
    };

    // ── Receive ICE candidate (with queuing) ─────────────────────────

    const handleIceCandidate = async (payload: SignalIceCandidatePayload) => {
      const peer = peersRef.current.get(payload.senderId);
      if (!peer) {
        // No peer yet — queue in earlyCandidatesRef for when connection is created
        if (!earlyCandidatesRef.current.has(payload.senderId)) {
          earlyCandidatesRef.current.set(payload.senderId, []);
        }
        earlyCandidatesRef.current.get(payload.senderId)!.push(payload.candidate);
        return;
      }

      // Queue if remote description hasn't been set yet
      if (!peer.connection.remoteDescription) {
        peer.pendingCandidates.push(payload.candidate);
        return;
      }

      try {
        await peer.connection.addIceCandidate(new RTCIceCandidate(payload.candidate));
      } catch (err) {
        console.error("[WebRTC] Failed to add ICE candidate:", err);
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

    // ── Chat messages ───────────────────────────────────────────────

    const handleChatMessage = (msg: ChatMessagePayload) => {
      setChatMessages((prev) => [...prev, msg]);
    };

    const handleChatHistory = (history: ChatMessagePayload[]) => {
      setChatMessages(history);
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

    const handleRecordingStatus = (payload: RecordingStatusPayload) => {
      setIsRecording(payload.isRecording);
    };

    // ── Register event listeners ────────────────────────────────────

    socket.on(SOCKET_EVENTS.ROOM_USERS, handleRoomUsers);
    socket.on(SOCKET_EVENTS.USER_JOINED, handleUserJoined);
    socket.on(SOCKET_EVENTS.USER_LEFT, handleUserLeft);
    socket.on(SOCKET_EVENTS.OFFER, handleOffer);
    socket.on(SOCKET_EVENTS.ANSWER, handleAnswer);
    socket.on(SOCKET_EVENTS.ICE_CANDIDATE, handleIceCandidate);
    socket.on(SOCKET_EVENTS.MEDIA_STATE_CHANGED, handleMediaState);
    socket.on(SOCKET_EVENTS.CHAT_MESSAGE, handleChatMessage);
    socket.on(SOCKET_EVENTS.CHAT_HISTORY, handleChatHistory);
    socket.on(SOCKET_EVENTS.REACTION_RECEIVED, handleReaction);
    socket.on(SOCKET_EVENTS.SCREEN_SHARE_START, handleScreenShareStart);
    socket.on(SOCKET_EVENTS.SCREEN_SHARE_STOP, handleScreenShareStop);
    socket.on(SOCKET_EVENTS.RECORDING_STATUS, handleRecordingStatus);

    return () => {
      socket.off(SOCKET_EVENTS.ROOM_USERS, handleRoomUsers);
      socket.off(SOCKET_EVENTS.USER_JOINED, handleUserJoined);
      socket.off(SOCKET_EVENTS.USER_LEFT, handleUserLeft);
      socket.off(SOCKET_EVENTS.OFFER, handleOffer);
      socket.off(SOCKET_EVENTS.ANSWER, handleAnswer);
      socket.off(SOCKET_EVENTS.ICE_CANDIDATE, handleIceCandidate);
      socket.off(SOCKET_EVENTS.MEDIA_STATE_CHANGED, handleMediaState);
      socket.off(SOCKET_EVENTS.CHAT_MESSAGE, handleChatMessage);
      socket.off(SOCKET_EVENTS.CHAT_HISTORY, handleChatHistory);
      socket.off(SOCKET_EVENTS.REACTION_RECEIVED, handleReaction);
      socket.off(SOCKET_EVENTS.SCREEN_SHARE_START, handleScreenShareStart);
      socket.off(SOCKET_EVENTS.SCREEN_SHARE_STOP, handleScreenShareStop);
      socket.off(SOCKET_EVENTS.RECORDING_STATUS, handleRecordingStatus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, isConnected, user]);

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
    peersRef.current.forEach((peer, peerId) => {
      const sender = peer.connection
        .getSenders()
        .find((s) => s.track?.kind === "video");
      if (sender) {
        replacePromises.push(
          sender.replaceTrack(newTrack).catch((err) => {
            console.error(`[WebRTC] Error replacing video track for ${peerId}:`, err);
          })
        );
      }
    });
    await Promise.all(replacePromises);
  }, []);

  const handleToggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      // Stop sharing -> revert to camera track
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      setIsScreenSharing(false);

      if (localStreamRef.current) {
        const videoTrack = localStreamRef.current.getVideoTracks()[0];
        if (videoTrack) {
          await replaceVideoTrackInPeers(videoTrack);
        }
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

        // Handle native "stop sharing" browser button
        screenTrack.onended = async () => {
          setIsScreenSharing(false);
          screenStreamRef.current = null;
          if (localStreamRef.current) {
            const camTrack = localStreamRef.current.getVideoTracks()[0];
            if (camTrack) {
              await replaceVideoTrackInPeers(camTrack);
            }
          }
        };
      } catch (err) {
        if (err instanceof DOMException && err.name === "NotAllowedError") {
          // User cancelled — not an error
        } else {
          console.error("[ScreenShare] Failed:", err);
        }
      }
    }
  }, [isScreenSharing, replaceVideoTrackInPeers]);

  // ── Recording (mixed audio: local + remote via Web Audio API) ────

  const handleStartRecording = useCallback(() => {
    try {
      const audioCtx = new AudioContext();
      const dest = audioCtx.createMediaStreamDestination();
      audioContextRef.current = audioCtx;
      mixedDestRef.current = dest;
      const sources: MediaStreamAudioSourceNode[] = [];

      // Add local audio
      if (localStreamRef.current) {
        const localAudioTracks = localStreamRef.current.getAudioTracks();
        if (localAudioTracks.length > 0) {
          const localSource = audioCtx.createMediaStreamSource(
            new MediaStream(localAudioTracks)
          );
          localSource.connect(dest);
          sources.push(localSource);
        }
      }

      // Add all remote audio
      peersRef.current.forEach((peer) => {
        const audioTracks = peer.stream.getAudioTracks();
        if (audioTracks.length > 0) {
          const remoteSource = audioCtx.createMediaStreamSource(
            new MediaStream(audioTracks)
          );
          remoteSource.connect(dest);
          sources.push(remoteSource);
        }
      });

      audioSourcesRef.current = sources;

      // Combine mixed audio + local video
      const videoTrack = localStreamRef.current?.getVideoTracks()[0];
      const combinedStream = new MediaStream([
        ...dest.stream.getTracks(),
        ...(videoTrack ? [videoTrack] : []),
      ]);

      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
          ? "video/webm;codecs=vp8,opus"
          : "video/webm";

      const recorder = new MediaRecorder(combinedStream, { mimeType });
      recordedChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(recordedChunksRef.current, { type: mimeType });

        // Capture speech segments for speaker-attributed transcript
        const segments = speechSegmentsRef.current.map((seg) => ({
          speakerId: seg.peerId,
          speakerName: seg.speakerName,
          startTime: seg.startTime,
          endTime: seg.endTime,
        }));

        // Try to upload via pre-signed URL
        try {
          const urlRes = await fetch("/api/recordings/upload-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              meetingId,
              contentType: mimeType,
              speechSegments: segments,
            }),
          });

          if (urlRes.ok) {
            const urlData = await urlRes.json();
            const uploadUrl = urlData.data?.uploadUrl || urlData.uploadUrl;
            if (uploadUrl) {
              await fetch(uploadUrl, {
                method: "PUT",
                headers: { "Content-Type": mimeType },
                body: blob,
              });
            }
          } else {
            downloadRecording(blob);
          }
        } catch {
          downloadRecording(blob);
        }

        // Clean up audio context and sources
        for (const source of audioSourcesRef.current) {
          try { source.disconnect(); } catch { /* already disconnected */ }
        }
        audioSourcesRef.current = [];
        audioContextRef.current?.close();
        audioContextRef.current = null;
        mixedDestRef.current = null;
      };

      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch (err) {
      console.error("[Recording] Failed to start:", err);
    }
  }, [meetingId]);

  const handleStopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setIsRecording(false);
  }, []);

  // ── Background transcription (automatic, tied to mic state) ─────
  //
  // Each participant captures their OWN mic in 3-second chunks and
  // POSTs to /api/transcription with their name/ID.  The API stores
  // every segment under the same meetingId so everyone shares one
  // transcript afterwards.  No captions UI — just silent capture.

  useEffect(() => {
    if (!isConnected || !isAudioEnabled || !localStream || !user) return;

    const audioTrack = localStream.getAudioTracks()[0];
    if (!audioTrack) return;

    const captureAndSend = () => {
      const stream = localStreamRef.current;
      if (!stream) return;
      const track = stream.getAudioTracks()[0];
      if (!track || !track.enabled) return;

      const audioStream = new MediaStream([track]);
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(audioStream, { mimeType });
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        if (chunks.length === 0) return;
        const blob = new Blob(chunks, { type: mimeType });

        // Skip silent chunks (< 1 KB is essentially silence)
        if (blob.size < 1000) return;

        const formData = new FormData();
        formData.append("audio", blob, "chunk.webm");
        formData.append("meetingId", meetingId);
        formData.append("speakerName", user.displayName || user.name);
        formData.append("speakerId", user.id);
        formData.append("timestamp", String(Date.now()));

        try {
          await fetch("/api/transcription", {
            method: "POST",
            credentials: "include",
            body: formData,
          });
        } catch {
          // Transcription is best-effort — silent fail
        }
      };

      recorder.start();
      transcriptionRecorderRef.current = recorder;

      setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
      }, 3000);
    };

    // Start immediately, then every 3.5s (3s record + 0.5s gap)
    captureAndSend();
    const interval = setInterval(captureAndSend, 3500);

    return () => {
      clearInterval(interval);
      if (transcriptionRecorderRef.current?.state === "recording") {
        transcriptionRecorderRef.current.stop();
      }
    };
  }, [isAudioEnabled, isConnected, localStream, user, meetingId]);

  // ── Chat ─────────────────────────────────────────────────────────

  const handleSendMessage = useCallback(
    (content: string) => {
      if (!socket || !user) return;
      const msg: ChatMessagePayload = {
        id: Math.random().toString(36).slice(2),
        roomId: meetingId,
        senderId: user.id,
        senderName: user.displayName || user.name,
        content,
        type: "text",
        timestamp: Date.now(),
      };
      socket.emit(SOCKET_EVENTS.CHAT_MESSAGE, msg);
      setChatMessages((prev) => [...prev, msg]);
    },
    [socket, user, meetingId]
  );

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

  // ── Leave / End call ─────────────────────────────────────────────

  const handleEndCall = useCallback(async () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }

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

    if (socket) {
      socket.emit(SOCKET_EVENTS.LEAVE_ROOM, { roomId: meetingId });
    }

    stopMedia();

    try {
      await fetch(`/api/meetings/${meetingId}/leave`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      /* ignore */
    }

    router.push("/meetings");
  }, [meetingId, router, stopMedia, socket]);

  // ── Cleanup on unmount ───────────────────────────────────────────

  useEffect(() => {
    const peers = peersRef.current;
    const screenStream = screenStreamRef.current;
    const sources = audioSourcesRef.current;
    const audioCtx = audioContextRef.current;
    const timer = recordingTimerRef.current;
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
      for (const source of sources) {
        try { source.disconnect(); } catch { /* already disconnected */ }
      }
      audioCtx?.close();
      if (timer) clearInterval(timer);
    };
  }, []);

  // ── Build bubble participants via adapter ─────────────────────────

  const bubbleParticipants = participants.map((p) =>
    toParticipant(p, {
      isSpeaking: speakingPeers.has(p.id),
      stream:
        p.id === localUser.id
          ? (isScreenSharing ? screenStreamRef.current : localStream)
          : remoteStreams.get(p.id) || null,
    })
  );

  // ── Render ───────────────────────────────────────────────────────

  return (
    <div className="meeting-root z-50 flex flex-col">
      {/* Doodle decorations */}
      <div className="pointer-events-none fixed inset-0 z-[1]">
        <DoodleStar className="absolute top-24 left-[8%] opacity-30" color="#FFE600" size={18} />
        <DoodleSparkles className="absolute bottom-40 right-[12%] opacity-20" />
      </div>

      {/* ─── Header bar ─── */}
      <motion.header
        className="meeting-header relative z-20 flex items-center justify-between px-6 py-3"
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 25 }}
      >
        {/* Left: LIVE badge + timer */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-full border-2 border-[#0A0A0A] bg-[#FF6B6B] px-3 py-1 shadow-[2px_2px_0_#0A0A0A]">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
            </span>
            <span className="text-[11px] font-bold text-white" style={{ fontFamily: "var(--font-heading)" }}>LIVE</span>
          </div>
          <span className="text-sm font-mono text-[#0A0A0A]/40">{formatTime(elapsedTime)}</span>
          {!isConnected && (
            <span className="flex items-center gap-1 text-xs text-[#FF6B6B]">
              <WifiOff size={12} /> Reconnecting...
            </span>
          )}
        </div>

        {/* Center: meeting code */}
        <span className="text-xs font-mono text-[#0A0A0A]/25">{meetingId.slice(0, 8)}</span>

        {/* Right: participant count + recording indicator */}
        <div className="flex items-center gap-2">
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

      {/* ─── Main content area ─── */}
      <div ref={containerRef} className="relative z-10 flex-1 overflow-hidden">
        {/* Bubble layout or screen share */}
        <AnimatePresence mode="wait">
          {isScreenSharing ? (
            <ScreenShareView
              key="screenshare"
              presenter={toParticipant(participants[0], {
                isSpeaking: isLocalSpeaking,
                stream: localStream,
              })}
              participants={bubbleParticipants}
              selfId={localUser.id}
              onStopSharing={handleToggleScreenShare}
              screenStream={screenStreamRef.current}
            />
          ) : (
            containerSize.width > 0 && (
              <BubbleLayout
                key="bubbles"
                participants={bubbleParticipants}
                containerWidth={containerSize.width}
                containerHeight={containerSize.height}
                selfId={localUser.id}
              />
            )
          )}
        </AnimatePresence>

        {/* Chat panel — slides in from right */}
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
                  isHost: p.id === localUser.id,
                }))}
                speakingPeers={speakingPeers}
                localUserId={user?.id || "local"}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Reactions overlay */}
      <ReactionOverlay onReactionRef={reactionRef} />

      {/* Controls */}
      <MeetingControls
        isVideoEnabled={isVideoEnabled}
        isAudioEnabled={isAudioEnabled}
        isScreenSharing={isScreenSharing}
        isRecording={isRecording}
        isChatOpen={showChat}
        isParticipantsOpen={showParticipants}
        onToggleVideo={toggleVideo}
        onToggleAudio={toggleAudio}
        onToggleScreenShare={handleToggleScreenShare}
        onToggleChat={() => {
          setShowChat(!showChat);
          setShowParticipants(false);
        }}
        onToggleParticipants={() => {
          setShowParticipants(!showParticipants);
          setShowChat(false);
        }}
        onStartRecording={handleStartRecording}
        onStopRecording={handleStopRecording}
        onReaction={handleReaction}
        onLeave={handleEndCall}
      />
    </div>
  );
}

// ── Helper: download recording blob locally ──────────────────────────

function downloadRecording(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `yoodle-recording-${Date.now()}.webm`;
  a.click();
  URL.revokeObjectURL(url);
}

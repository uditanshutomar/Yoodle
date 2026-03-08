"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, Users, X, Wifi, WifiOff } from "lucide-react";
import VideoGrid from "@/components/meeting/VideoGrid";
import MeetingControls from "@/components/meeting/MeetingControls";
import MeetingChat from "@/components/meeting/MeetingChat";
import ParticipantList from "@/components/meeting/ParticipantList";
import ReactionOverlay from "@/components/meeting/ReactionOverlay";
import { useMediaDevices } from "@/hooks/useMediaDevices";
import { useAuth } from "@/hooks/useAuth";
import { useSocket } from "@/hooks/useSocket";
import {
  SOCKET_EVENTS,
  type RoomUser,
  type SignalOfferPayload,
  type SignalAnswerPayload,
  type SignalIceCandidatePayload,
  type MediaStatePayload,
  type VoiceActivityPayload,
  type ChatMessagePayload,
  type ReactionPayload,
} from "@/lib/realtime/socket-events";

// ── Types ──────────────────────────────────────────────────────────────

interface PeerData {
  connection: RTCPeerConnection;
  stream: MediaStream;
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

  // ── UI state ─────────────────────────────────────────────────────────
  const [showChat, setShowChat] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const reactionRef = useRef<((emoji: string, userName: string) => void) | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessagePayload[]>([]);

  // ── WebRTC state ─────────────────────────────────────────────────────
  const [remoteParticipants, setRemoteParticipants] = useState<RoomUser[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [speakingPeers, setSpeakingPeers] = useState<Set<string>>(new Set());
  const [audioLevels, setAudioLevels] = useState<Map<string, number>>(new Map());
  const peersRef = useRef<Map<string, PeerData>>(new Map());
  const iceServersRef = useRef<RTCIceServer[]>([]);
  const localStreamRef = useRef<MediaStream | null>(null);
  const joinedRef = useRef(false);
  const screenStreamRef = useRef<MediaStream | null>(null);

  // ── Recording state ──────────────────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mixedDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Transcription ref (background, automatic) ──────────────────────
  const transcriptionRecorderRef = useRef<MediaRecorder | null>(null);

  // Keep localStreamRef in sync
  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  const localUser = {
    id: user?.id || "local",
    name: user?.name || "You",
    displayName: user?.displayName || user?.name || "You",
    avatar: user?.avatar || undefined,
  };

  // ── Build full participants list ─────────────────────────────────────

  const participants: RoomUser[] = [
    {
      id: localUser.id,
      socketId: socket?.id || "",
      name: localUser.name,
      displayName: localUser.displayName,
      avatar: user?.avatar || null,
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

  // ── Create a peer connection for a remote user ───────────────────────

  const createPeerConnection = useCallback(
    (remoteUserId: string): RTCPeerConnection => {
      const pc = new RTCPeerConnection({
        iceServers: iceServersRef.current,
        iceCandidatePoolSize: 10,
      });

      // Outgoing stream container
      const remoteStream = new MediaStream();
      peersRef.current.set(remoteUserId, { connection: pc, stream: remoteStream });

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
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          console.warn(`[WebRTC] Peer ${remoteUserId} state: ${pc.connectionState}`);
        }
      };

      return pc;
    },
    [socket, localUser.id, syncStreams]
  );

  // ── Create offer to a remote peer ───────────────────────────────────

  const createOffer = useCallback(
    async (remoteUserId: string) => {
      const pc = createPeerConnection(remoteUserId);
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket?.emit(SOCKET_EVENTS.OFFER, {
          targetId: remoteUserId,
          senderId: localUser.id,
          offer: pc.localDescription!,
        } as SignalOfferPayload);
      } catch (err) {
        console.error("[WebRTC] Failed to create offer:", err);
      }
    },
    [createPeerConnection, socket, localUser.id]
  );

  // ── Socket event setup ───────────────────────────────────────────────

  useEffect(() => {
    if (!socket || !isConnected || !user || joinedRef.current) return;

    const init = async () => {
      // Fetch ICE servers
      iceServersRef.current = await getIceServers();

      // Start media
      await startMedia(true, true);

      // Join the room
      socket.emit(SOCKET_EVENTS.JOIN_ROOM, {
        roomId: meetingId,
        user: {
          id: user.id,
          name: user.name,
          displayName: user.displayName,
          avatar: user.avatar,
        },
      });

      joinedRef.current = true;
    };

    init();

    // ── Receive existing users in room ──────────────────────────────

    const handleRoomUsers = (users: RoomUser[]) => {
      const remoteUsers = users.filter((u) => u.id !== user.id);
      setRemoteParticipants(remoteUsers);

      // Create offers to each existing user
      remoteUsers.forEach((u) => {
        createOffer(u.id);
      });
    };

    // ── New user joined -> create offer ─────────────────────────────

    const handleUserJoined = (roomUser: RoomUser) => {
      setRemoteParticipants((prev) => {
        if (prev.find((p) => p.id === roomUser.id)) return prev;
        return [...prev, roomUser];
      });
      createOffer(roomUser.id);
    };

    // ── User left -> clean up ───────────────────────────────────────

    const handleUserLeft = ({ userId }: { userId: string }) => {
      const peer = peersRef.current.get(userId);
      if (peer) {
        peer.connection.close();
        peersRef.current.delete(userId);
        syncStreams();
      }
      setRemoteParticipants((prev) => prev.filter((p) => p.id !== userId));
      setSpeakingPeers((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    };

    // ── Receive offer -> create answer ──────────────────────────────

    const handleOffer = async (payload: SignalOfferPayload) => {
      const existing = peersRef.current.get(payload.senderId);
      if (existing) {
        existing.connection.close();
        peersRef.current.delete(payload.senderId);
      }

      const pc = createPeerConnection(payload.senderId);
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit(SOCKET_EVENTS.ANSWER, {
          targetId: payload.senderId,
          senderId: user.id,
          answer: pc.localDescription!,
        } as SignalAnswerPayload);
      } catch (err) {
        console.error("[WebRTC] Failed to handle offer:", err);
      }
    };

    // ── Receive answer ──────────────────────────────────────────────

    const handleAnswer = async (payload: SignalAnswerPayload) => {
      const peer = peersRef.current.get(payload.senderId);
      if (peer && peer.connection.signalingState === "have-local-offer") {
        try {
          await peer.connection.setRemoteDescription(
            new RTCSessionDescription(payload.answer)
          );
        } catch (err) {
          console.error("[WebRTC] Failed to set remote description:", err);
        }
      }
    };

    // ── Receive ICE candidate ───────────────────────────────────────

    const handleIceCandidate = async (payload: SignalIceCandidatePayload) => {
      const peer = peersRef.current.get(payload.senderId);
      if (peer) {
        try {
          await peer.connection.addIceCandidate(new RTCIceCandidate(payload.candidate));
        } catch (err) {
          console.error("[WebRTC] Failed to add ICE candidate:", err);
        }
      }
    };

    // ── Media state changes from others ─────────────────────────────

    const handleMediaState = (payload: MediaStatePayload) => {
      setRemoteParticipants((prev) =>
        prev.map((p) =>
          p.id === payload.userId
            ? { ...p, isVideoEnabled: payload.isVideoEnabled, isAudioEnabled: payload.isAudioEnabled }
            : p
        )
      );
    };

    // ── Voice activity ──────────────────────────────────────────────

    const handleVoiceActivity = (payload: VoiceActivityPayload) => {
      setSpeakingPeers((prev) => {
        const next = new Set(prev);
        if (payload.isSpeaking) next.add(payload.userId);
        else next.delete(payload.userId);
        return next;
      });
      setAudioLevels((prev) => {
        const next = new Map(prev);
        next.set(payload.userId, payload.audioLevel);
        return next;
      });
    };

    // ── Chat messages ───────────────────────────────────────────────

    const handleChatMessage = (msg: ChatMessagePayload) => {
      setChatMessages((prev) => [...prev, msg]);
    };

    // ── Reactions ───────────────────────────────────────────────────

    const handleReaction = (payload: ReactionPayload) => {
      reactionRef.current?.(payload.emoji, payload.userName);
    };

    // ── Register event listeners ────────────────────────────────────

    socket.on(SOCKET_EVENTS.ROOM_USERS, handleRoomUsers);
    socket.on(SOCKET_EVENTS.USER_JOINED, handleUserJoined);
    socket.on(SOCKET_EVENTS.USER_LEFT, handleUserLeft);
    socket.on(SOCKET_EVENTS.OFFER, handleOffer);
    socket.on(SOCKET_EVENTS.ANSWER, handleAnswer);
    socket.on(SOCKET_EVENTS.ICE_CANDIDATE, handleIceCandidate);
    socket.on(SOCKET_EVENTS.MEDIA_STATE_CHANGED, handleMediaState);
    socket.on(SOCKET_EVENTS.VOICE_ACTIVITY, handleVoiceActivity);
    socket.on(SOCKET_EVENTS.CHAT_MESSAGE, handleChatMessage);
    socket.on(SOCKET_EVENTS.REACTION_RECEIVED, handleReaction);

    return () => {
      socket.off(SOCKET_EVENTS.ROOM_USERS, handleRoomUsers);
      socket.off(SOCKET_EVENTS.USER_JOINED, handleUserJoined);
      socket.off(SOCKET_EVENTS.USER_LEFT, handleUserLeft);
      socket.off(SOCKET_EVENTS.OFFER, handleOffer);
      socket.off(SOCKET_EVENTS.ANSWER, handleAnswer);
      socket.off(SOCKET_EVENTS.ICE_CANDIDATE, handleIceCandidate);
      socket.off(SOCKET_EVENTS.MEDIA_STATE_CHANGED, handleMediaState);
      socket.off(SOCKET_EVENTS.VOICE_ACTIVITY, handleVoiceActivity);
      socket.off(SOCKET_EVENTS.CHAT_MESSAGE, handleChatMessage);
      socket.off(SOCKET_EVENTS.REACTION_RECEIVED, handleReaction);
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

  const handleToggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      // Stop sharing -> revert to camera track
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      setIsScreenSharing(false);

      if (localStreamRef.current) {
        const videoTrack = localStreamRef.current.getVideoTracks()[0];
        if (videoTrack) {
          peersRef.current.forEach((peer) => {
            const sender = peer.connection
              .getSenders()
              .find((s) => s.track?.kind === "video");
            sender?.replaceTrack(videoTrack);
          });
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

        peersRef.current.forEach((peer) => {
          const sender = peer.connection
            .getSenders()
            .find((s) => s.track?.kind === "video");
          sender?.replaceTrack(screenTrack);
        });

        // Handle native "stop sharing" browser button
        screenTrack.onended = () => {
          setIsScreenSharing(false);
          screenStreamRef.current = null;
          if (localStreamRef.current) {
            const camTrack = localStreamRef.current.getVideoTracks()[0];
            if (camTrack) {
              peersRef.current.forEach((peer) => {
                const sender = peer.connection
                  .getSenders()
                  .find((s) => s.track?.kind === "video");
                sender?.replaceTrack(camTrack);
              });
            }
          }
        };
      } catch (err) {
        console.error("[ScreenShare] Failed:", err);
      }
    }
  }, [isScreenSharing]);

  // ── Recording (mixed audio: local + remote via Web Audio API) ────

  const handleStartRecording = useCallback(() => {
    try {
      const audioCtx = new AudioContext();
      const dest = audioCtx.createMediaStreamDestination();
      audioContextRef.current = audioCtx;
      mixedDestRef.current = dest;

      // Add local audio
      if (localStreamRef.current) {
        const localAudioTracks = localStreamRef.current.getAudioTracks();
        if (localAudioTracks.length > 0) {
          const localSource = audioCtx.createMediaStreamSource(
            new MediaStream(localAudioTracks)
          );
          localSource.connect(dest);
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
        }
      });

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

        // Try to upload via pre-signed URL
        try {
          const urlRes = await fetch("/api/recordings/upload-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ meetingId, contentType: mimeType }),
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

    peersRef.current.forEach((peer) => peer.connection.close());
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
    return () => {
      peersRef.current.forEach((peer) => peer.connection.close());
      peersRef.current.clear();
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      audioContextRef.current?.close();
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, []);

  // ── Render ───────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 bg-[#0A0A0A] flex flex-col">
      {/* Meeting header */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#0A0A0A]/90 border-b border-white/10">
        <div className="flex items-center gap-3">
          <span
            className="text-sm text-white/60 font-mono"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Meeting: {meetingId.slice(0, 8)}...
          </span>
          <span className="flex items-center gap-1">
            {isConnected ? (
              <Wifi size={14} className="text-green-400" />
            ) : (
              <WifiOff size={14} className="text-red-400" />
            )}
            <span className={`text-xs ${isConnected ? "text-green-400" : "text-red-400"}`}>
              {isConnected ? "Connected" : "Reconnecting..."}
            </span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/40 mr-2">
            {participants.length} participant{participants.length !== 1 ? "s" : ""}
          </span>
          <button
            onClick={() => {
              setShowChat(!showChat);
              setShowParticipants(false);
            }}
            className={`p-2 rounded-lg transition-colors cursor-pointer ${
              showChat
                ? "bg-[#FFE600] text-[#0A0A0A]"
                : "text-white/60 hover:text-white hover:bg-white/10"
            }`}
          >
            <MessageSquare size={18} />
          </button>
          <button
            onClick={() => {
              setShowParticipants(!showParticipants);
              setShowChat(false);
            }}
            className={`p-2 rounded-lg transition-colors cursor-pointer ${
              showParticipants
                ? "bg-[#FFE600] text-[#0A0A0A]"
                : "text-white/60 hover:text-white hover:bg-white/10"
            }`}
          >
            <Users size={18} />
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Video grid */}
        <div className="flex-1 p-4">
          <VideoGrid
            localStream={isScreenSharing ? screenStreamRef.current : localStream}
            remoteStreams={remoteStreams}
            participants={participants}
            speakingPeers={speakingPeers}
            audioLevels={audioLevels}
            localUser={localUser}
            isLocalMuted={!isAudioEnabled}
            isLocalVideoOff={!isVideoEnabled}
          />
        </div>

        {/* Side panel */}
        <AnimatePresence>
          {(showChat || showParticipants) && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 360, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="border-l border-white/10 bg-[#111] overflow-hidden flex flex-col"
            >
              <div className="flex items-center justify-between p-3 border-b border-white/10">
                <span
                  className="text-sm font-bold text-white"
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  {showChat ? "Chat" : "Participants"}
                </span>
                <button
                  onClick={() => {
                    setShowChat(false);
                    setShowParticipants(false);
                  }}
                  className="text-white/40 hover:text-white cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {showChat && (
                  <MeetingChat
                    isOpen={showChat}
                    onClose={() => setShowChat(false)}
                    messages={chatMessages}
                    onSendMessage={handleSendMessage}
                    currentUserId={user?.id || "local"}
                  />
                )}
                {showParticipants && (
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
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Reactions */}
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

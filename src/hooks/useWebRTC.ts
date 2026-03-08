"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Socket } from "socket.io-client";
import { SOCKET_EVENTS } from "@/lib/realtime/socket-events";

/** STUN/TURN server configuration */
function getIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];

  // Optional TURN server from environment
  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL;
  const turnUser = process.env.NEXT_PUBLIC_TURN_USERNAME;
  const turnCredential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;

  if (turnUrl) {
    servers.push({
      urls: turnUrl,
      username: turnUser || "",
      credential: turnCredential || "",
    });
  }

  return servers;
}

/** Timeout for stuck negotiations (ms) */
const NEGOTIATION_TIMEOUT = 10_000;

export interface UseWebRTCReturn {
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  peers: Map<string, RTCPeerConnection>;
  addLocalStream: (stream: MediaStream) => void;
  removeLocalStream: () => void;
  replaceTrack: (
    oldTrack: MediaStreamTrack,
    newTrack: MediaStreamTrack
  ) => Promise<void>;
}

interface UseWebRTCOptions {
  socket: Socket | null;
  userId: string;
  roomId: string;
}

export function useWebRTC({
  socket,
  userId,
  roomId,
}: UseWebRTCOptions): UseWebRTCReturn {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(
    new Map()
  );
  const [peers, setPeers] = useState<Map<string, RTCPeerConnection>>(new Map());

  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const makingOfferRef = useRef<Set<string>>(new Set());
  const negotiationTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(
    new Map()
  );

  /** Sync refs to state */
  const syncPeersToState = useCallback(() => {
    setPeers(new Map(peersRef.current));
  }, []);

  const syncRemoteStreamsToState = useCallback(() => {
    setRemoteStreams(new Map(remoteStreamsRef.current));
  }, []);

  /** Clear negotiation timeout for a peer */
  const clearNegotiationTimeout = useCallback((peerId: string) => {
    const timer = negotiationTimersRef.current.get(peerId);
    if (timer) {
      clearTimeout(timer);
      negotiationTimersRef.current.delete(peerId);
    }
  }, []);

  /** Set negotiation timeout for a peer — auto-clears makingOfferRef on expiry */
  const setNegotiationTimeout = useCallback((peerId: string) => {
    clearNegotiationTimeout(peerId);
    const timer = setTimeout(() => {
      makingOfferRef.current.delete(peerId);
      negotiationTimersRef.current.delete(peerId);
      console.warn(`[WebRTC] Negotiation timeout for ${peerId}, cleared lock`);
    }, NEGOTIATION_TIMEOUT);
    negotiationTimersRef.current.set(peerId, timer);
  }, [clearNegotiationTimeout]);

  /** Create a new RTCPeerConnection for a remote peer */
  const createPeerConnection = useCallback(
    (remotePeerId: string): RTCPeerConnection => {
      // Clean up any existing connection to this peer
      const existing = peersRef.current.get(remotePeerId);
      if (existing) {
        existing.onicecandidate = null;
        existing.ontrack = null;
        existing.onnegotiationneeded = null;
        existing.onconnectionstatechange = null;
        existing.oniceconnectionstatechange = null;
        existing.close();
        peersRef.current.delete(remotePeerId);
      }

      const pc = new RTCPeerConnection({
        iceServers: getIceServers(),
        iceCandidatePoolSize: 10,
      });

      // Add local tracks to the connection
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current!);
        });
      }

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate && socket) {
          socket.emit(SOCKET_EVENTS.ICE_CANDIDATE, {
            targetId: remotePeerId,
            senderId: userId,
            candidate: event.candidate.toJSON(),
          });
        }
      };

      // Handle remote tracks
      pc.ontrack = (event) => {
        const [remoteStream] = event.streams;
        if (remoteStream) {
          remoteStreamsRef.current.set(remotePeerId, remoteStream);
          syncRemoteStreamsToState();

          // Clean up when tracks end
          remoteStream.onremovetrack = () => {
            if (remoteStream.getTracks().length === 0) {
              remoteStreamsRef.current.delete(remotePeerId);
              syncRemoteStreamsToState();
            }
          };
        }
      };

      // Handle renegotiation
      pc.onnegotiationneeded = async () => {
        if (makingOfferRef.current.has(remotePeerId)) return;

        try {
          makingOfferRef.current.add(remotePeerId);
          setNegotiationTimeout(remotePeerId);

          const offer = await pc.createOffer();
          // Check state after async operation
          if (pc.signalingState !== "stable") {
            return;
          }
          await pc.setLocalDescription(offer);

          if (socket && pc.localDescription) {
            socket.emit(SOCKET_EVENTS.OFFER, {
              targetId: remotePeerId,
              senderId: userId,
              offer: pc.localDescription,
            });
          }
        } catch (err) {
          console.error(
            `[WebRTC] Negotiation error with ${remotePeerId}:`,
            err
          );
        } finally {
          makingOfferRef.current.delete(remotePeerId);
          clearNegotiationTimeout(remotePeerId);
        }
      };

      // Handle connection state changes
      pc.onconnectionstatechange = () => {
        console.log(
          `[WebRTC] Connection state with ${remotePeerId}: ${pc.connectionState}`
        );
        if (
          pc.connectionState === "failed" ||
          pc.connectionState === "closed"
        ) {
          // Inline cleanup to avoid forward-reference issue
          const failedPc = peersRef.current.get(remotePeerId);
          if (failedPc) {
            failedPc.onicecandidate = null;
            failedPc.ontrack = null;
            failedPc.onnegotiationneeded = null;
            failedPc.onconnectionstatechange = null;
            failedPc.oniceconnectionstatechange = null;
            failedPc.close();
            peersRef.current.delete(remotePeerId);
            syncPeersToState();
          }
          remoteStreamsRef.current.delete(remotePeerId);
          syncRemoteStreamsToState();
          pendingCandidatesRef.current.delete(remotePeerId);
          makingOfferRef.current.delete(remotePeerId);
          clearNegotiationTimeout(remotePeerId);
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log(
          `[WebRTC] ICE state with ${remotePeerId}: ${pc.iceConnectionState}`
        );
        if (pc.iceConnectionState === "failed") {
          // Try ICE restart
          pc.restartIce();
        }
      };

      peersRef.current.set(remotePeerId, pc);
      syncPeersToState();

      return pc;
    },
    [socket, userId, syncPeersToState, syncRemoteStreamsToState, setNegotiationTimeout, clearNegotiationTimeout]
  );

  /** Clean up a peer connection */
  const cleanupPeer = useCallback(
    (peerId: string) => {
      const pc = peersRef.current.get(peerId);
      if (pc) {
        pc.onicecandidate = null;
        pc.ontrack = null;
        pc.onnegotiationneeded = null;
        pc.onconnectionstatechange = null;
        pc.oniceconnectionstatechange = null;
        pc.close();
        peersRef.current.delete(peerId);
        syncPeersToState();
      }

      remoteStreamsRef.current.delete(peerId);
      syncRemoteStreamsToState();
      pendingCandidatesRef.current.delete(peerId);
      makingOfferRef.current.delete(peerId);
      clearNegotiationTimeout(peerId);
    },
    [syncPeersToState, syncRemoteStreamsToState, clearNegotiationTimeout]
  );

  /** Process any ICE candidates that arrived before the remote description was set */
  const processPendingCandidates = useCallback(
    async (peerId: string) => {
      const pc = peersRef.current.get(peerId);
      const pending = pendingCandidatesRef.current.get(peerId);
      if (!pc || !pending || pending.length === 0) return;

      for (const candidate of pending) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error(
            `[WebRTC] Error adding pending ICE candidate for ${peerId}:`,
            err
          );
        }
      }
      pendingCandidatesRef.current.delete(peerId);
    },
    []
  );

  /** Set up socket event listeners for WebRTC signaling */
  useEffect(() => {
    if (!socket || !userId || !roomId) return;

    // When a new user joins the room, create a connection and send an offer
    const handleUserJoined = async (user: { id: string }) => {
      if (user.id === userId) return;

      console.log(`[WebRTC] New user joined: ${user.id}, creating offer`);
      const pc = createPeerConnection(user.id);

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        socket.emit(SOCKET_EVENTS.OFFER, {
          targetId: user.id,
          senderId: userId,
          offer: pc.localDescription,
        });
      } catch (err) {
        console.error(`[WebRTC] Error creating offer for ${user.id}:`, err);
      }
    };

    // Handle incoming offer
    const handleOffer = async (payload: {
      senderId: string;
      offer: RTCSessionDescriptionInit;
    }) => {
      const { senderId, offer } = payload;
      console.log(`[WebRTC] Received offer from ${senderId}`);

      let pc = peersRef.current.get(senderId);
      if (!pc) {
        pc = createPeerConnection(senderId);
      }

      try {
        // Handle "glare" scenario (both sides sending offers)
        const isPolite = userId < senderId; // lower ID is polite
        const offerCollision =
          makingOfferRef.current.has(senderId) ||
          pc.signalingState !== "stable";

        if (offerCollision && !isPolite) {
          console.log(`[WebRTC] Ignoring offer from ${senderId} (glare, impolite)`);
          return;
        }

        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        await processPendingCandidates(senderId);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit(SOCKET_EVENTS.ANSWER, {
          targetId: senderId,
          senderId: userId,
          answer: pc.localDescription,
        });
      } catch (err) {
        console.error(`[WebRTC] Error handling offer from ${senderId}:`, err);
      }
    };

    // Handle incoming answer
    const handleAnswer = async (payload: {
      senderId: string;
      answer: RTCSessionDescriptionInit;
    }) => {
      const { senderId, answer } = payload;
      console.log(`[WebRTC] Received answer from ${senderId}`);

      const pc = peersRef.current.get(senderId);
      if (!pc) {
        console.warn(
          `[WebRTC] Received answer but no connection for ${senderId}`
        );
        return;
      }

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        await processPendingCandidates(senderId);
      } catch (err) {
        console.error(
          `[WebRTC] Error handling answer from ${senderId}:`,
          err
        );
      }
    };

    // Handle incoming ICE candidate
    const handleIceCandidate = async (payload: {
      senderId: string;
      candidate: RTCIceCandidateInit;
    }) => {
      const { senderId, candidate } = payload;

      const pc = peersRef.current.get(senderId);
      if (!pc) {
        // Queue the candidate if we don't have a connection yet
        if (!pendingCandidatesRef.current.has(senderId)) {
          pendingCandidatesRef.current.set(senderId, []);
        }
        pendingCandidatesRef.current.get(senderId)!.push(candidate);
        return;
      }

      if (!pc.remoteDescription) {
        // Queue if remote description hasn't been set yet
        if (!pendingCandidatesRef.current.has(senderId)) {
          pendingCandidatesRef.current.set(senderId, []);
        }
        pendingCandidatesRef.current.get(senderId)!.push(candidate);
        return;
      }

      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error(
          `[WebRTC] Error adding ICE candidate from ${senderId}:`,
          err
        );
      }
    };

    // Handle user leaving
    const handleUserLeft = (payload: { userId: string }) => {
      if (payload.userId === userId) return;
      console.log(`[WebRTC] User left: ${payload.userId}, cleaning up`);
      cleanupPeer(payload.userId);
    };

    socket.on(SOCKET_EVENTS.USER_JOINED, handleUserJoined);
    socket.on(SOCKET_EVENTS.OFFER, handleOffer);
    socket.on(SOCKET_EVENTS.ANSWER, handleAnswer);
    socket.on(SOCKET_EVENTS.ICE_CANDIDATE, handleIceCandidate);
    socket.on(SOCKET_EVENTS.USER_LEFT, handleUserLeft);

    return () => {
      socket.off(SOCKET_EVENTS.USER_JOINED, handleUserJoined);
      socket.off(SOCKET_EVENTS.OFFER, handleOffer);
      socket.off(SOCKET_EVENTS.ANSWER, handleAnswer);
      socket.off(SOCKET_EVENTS.ICE_CANDIDATE, handleIceCandidate);
      socket.off(SOCKET_EVENTS.USER_LEFT, handleUserLeft);
    };
  }, [
    socket,
    userId,
    roomId,
    createPeerConnection,
    cleanupPeer,
    processPendingCandidates,
  ]);

  /** Clean up all peer connections on unmount */
  useEffect(() => {
    const currentPeers = peersRef.current;
    const currentRemoteStreams = remoteStreamsRef.current;
    const currentPendingCandidates = pendingCandidatesRef.current;
    const currentMakingOffer = makingOfferRef.current;
    const currentNegotiationTimers = negotiationTimersRef.current;
    return () => {
      for (const [, pc] of currentPeers) {
        pc.onicecandidate = null;
        pc.ontrack = null;
        pc.onnegotiationneeded = null;
        pc.onconnectionstatechange = null;
        pc.oniceconnectionstatechange = null;
        pc.close();
      }
      currentPeers.clear();
      currentRemoteStreams.clear();
      currentPendingCandidates.clear();
      currentMakingOffer.clear();
      for (const timer of currentNegotiationTimers.values()) {
        clearTimeout(timer);
      }
      currentNegotiationTimers.clear();
    };
  }, []);

  /** Add local stream and attach tracks to all existing peer connections */
  const addLocalStream = useCallback(
    (stream: MediaStream) => {
      localStreamRef.current = stream;
      setLocalStream(stream);

      // Add tracks to all existing peer connections
      for (const [peerId, pc] of peersRef.current) {
        const existingSenders = pc.getSenders();
        stream.getTracks().forEach((track) => {
          const sender = existingSenders.find(
            (s) => s.track?.kind === track.kind
          );
          if (sender) {
            sender.replaceTrack(track).catch((err) => {
              console.error(
                `[WebRTC] Error replacing track for ${peerId}:`,
                err
              );
            });
          } else {
            pc.addTrack(track, stream);
          }
        });
      }
    },
    []
  );

  /** Remove local stream and stop all tracks */
  const removeLocalStream = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    localStreamRef.current = null;
    setLocalStream(null);

    // Remove tracks from peer connections
    for (const [, pc] of peersRef.current) {
      const senders = pc.getSenders();
      senders.forEach((sender) => {
        try {
          pc.removeTrack(sender);
        } catch {
          // Ignore errors from already-closed connections
        }
      });
    }
  }, []);

  /** Replace a specific track across all peer connections */
  const replaceTrack = useCallback(
    async (oldTrack: MediaStreamTrack, newTrack: MediaStreamTrack) => {
      // Update the local stream ref
      if (localStreamRef.current) {
        localStreamRef.current.removeTrack(oldTrack);
        localStreamRef.current.addTrack(newTrack);
      }

      // Replace the track in all peer connections
      // Match by exact track ID first, then fall back to kind match only if IDs don't match
      const replacePromises: Promise<void>[] = [];
      for (const [peerId, pc] of peersRef.current) {
        const senders = pc.getSenders();
        const sender =
          senders.find((s) => s.track?.id === oldTrack.id) ||
          senders.find((s) => s.track?.kind === newTrack.kind && !senders.some((other) => other !== s && other.track?.kind === newTrack.kind));
        if (sender) {
          replacePromises.push(
            sender.replaceTrack(newTrack).catch((err) => {
              console.error(
                `[WebRTC] Error replacing track for ${peerId}:`,
                err
              );
            })
          );
        }
      }
      await Promise.all(replacePromises);
    },
    []
  );

  return {
    localStream,
    remoteStreams,
    peers,
    addLocalStream,
    removeLocalStream,
    replaceTrack,
  };
}

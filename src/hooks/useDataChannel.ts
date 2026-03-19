"use client";

import { useEffect, useCallback, useRef } from "react";
import type { Room } from "livekit-client";
import { RoomEvent } from "livekit-client";
import {
  encodeMessage,
  decodeMessage,
  type DataMessage,
  type DataMessageType,
} from "@/lib/livekit/data-messages";

type MessageHandler = (msg: DataMessage, senderId: string) => void;

/**
 * Hook for sending and receiving data messages over LiveKit data channels.
 *
 * @param room - The LiveKit Room instance (null when not connected)
 * @returns `sendReliable`, `sendLossy`, and `onMessage` for registering handlers
 */
export function useDataChannel(room: Room | null) {
  const handlersRef = useRef<Map<DataMessageType | "*", MessageHandler[]>>(
    new Map(),
  );

  // ── Send helpers ─────────────────────────────────────────────────

  const sendReliable = useCallback(
    async (msg: DataMessage, destinationIdentities?: string[]) => {
      if (!room) {
        console.warn("[DataChannel] sendReliable: room is null, dropping message:", msg.type);
        return;
      }
      try {
        const payload = encodeMessage(msg);
        await room.localParticipant.publishData(payload, {
          reliable: true,
          destinationIdentities,
        });
      } catch (err) {
        console.error(`[DataChannel] sendReliable failed for ${msg.type}:`, err);
      }
    },
    [room],
  );

  const sendLossy = useCallback(
    async (msg: DataMessage, destinationIdentities?: string[]) => {
      if (!room) {
        console.warn("[DataChannel] sendLossy: room is null, dropping message:", msg.type);
        return;
      }
      try {
        const payload = encodeMessage(msg);
        await room.localParticipant.publishData(payload, {
          reliable: false,
          destinationIdentities,
        });
      } catch (err) {
        // Lossy sends are best-effort — log but don't throw
        console.warn(`[DataChannel] sendLossy failed for ${msg.type}:`, err);
      }
    },
    [room],
  );

  // ── Register message handler ─────────────────────────────────────

  /**
   * Register a handler for a specific message type (or "*" for all).
   * Returns an unsubscribe function.
   */
  const onMessage = useCallback(
    (type: DataMessageType | "*", handler: MessageHandler): (() => void) => {
      const map = handlersRef.current;
      if (!map.has(type)) {
        map.set(type, []);
      }
      map.get(type)!.push(handler);

      return () => {
        const arr = map.get(type);
        if (arr) {
          const idx = arr.indexOf(handler);
          if (idx >= 0) arr.splice(idx, 1);
        }
      };
    },
    [],
  );

  // ── Subscribe to incoming data ───────────────────────────────────

  useEffect(() => {
    if (!room) return;

    const handleData = (
      payload: Uint8Array,
      participant: { identity: string } | undefined,
    ) => {
      const msg = decodeMessage(payload);
      if (!msg) return; // Malformed or unknown message — already logged by decodeMessage

      const senderId = participant?.identity ?? "unknown";
      const map = handlersRef.current;

      // Dispatch to type-specific handlers — errors in handlers are bugs
      // that should be visible, not silently swallowed.
      const typeHandlers = map.get(msg.type as DataMessageType);
      if (typeHandlers) {
        for (const h of typeHandlers) {
          try {
            h(msg, senderId);
          } catch (err) {
            console.error(`[DataChannel] Handler error for ${msg.type}:`, err);
          }
        }
      }

      // Dispatch to wildcard handlers
      const wildcardHandlers = map.get("*");
      if (wildcardHandlers) {
        for (const h of wildcardHandlers) {
          try {
            h(msg, senderId);
          } catch (err) {
            console.error("[DataChannel] Wildcard handler error:", err);
          }
        }
      }
    };

    room.on(RoomEvent.DataReceived, handleData);
    return () => {
      room.off(RoomEvent.DataReceived, handleData);
    };
  }, [room]);

  return { sendReliable, sendLossy, onMessage };
}

"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { Room } from "livekit-client";
import { useDataChannel } from "./useDataChannel";
import {
  DataMessageType,
  type ChatMessageData,
  type DataMessage,
} from "@/lib/livekit/data-messages";

/** Chat message as stored in local state. */
export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  type: "text" | "reaction" | "system";
  timestamp: number;
}

export interface UseChatReturn {
  messages: ChatMessage[];
  sendMessage: (content: string) => void;
  unreadCount: number;
  markRead: () => void;
  markUnread: () => void;
}

/**
 * Manages chat messages over LiveKit data channels.
 *
 * Sends RELIABLE data messages so delivery is guaranteed.
 * Tracks unread count when the chat panel is closed.
 */
export function useChat(
  room: Room | null,
  userId: string,
  userName: string,
): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  // Tracks whether the chat panel is currently open/visible.
  // When true, incoming messages do NOT increment unread count.
  const isChatOpenRef = useRef(false);

  const { sendReliable, onMessage } = useDataChannel(room);

  // ── Listen for incoming chat messages ──────────────────────────────

  useEffect(() => {
    const unsub = onMessage(
      DataMessageType.CHAT_MESSAGE,
      (msg: DataMessage) => {
        if (msg.type !== DataMessageType.CHAT_MESSAGE) return;
        const chat = msg as ChatMessageData;

        setMessages((prev) => {
          // Deduplicate (optimistic add from sendMessage)
          if (prev.some((m) => m.id === chat.id)) return prev;
          const next = [
            ...prev,
            {
              id: chat.id,
              senderId: chat.senderId,
              senderName: chat.senderName,
              content: chat.content,
              type: chat.messageType,
              timestamp: chat.timestamp,
            },
          ];
          // Cap at 500 messages to prevent unbounded growth in long meetings
          return next.length > 500 ? next.slice(-500) : next;
        });

        // Increment unread if from someone else and chat panel is closed
        if (chat.senderId !== userId && !isChatOpenRef.current) {
          setUnreadCount((prev) => prev + 1);
        }
      },
    );

    return unsub;
  }, [onMessage, userId]);

  // ── Send message ───────────────────────────────────────────────────

  const sendMessage = useCallback(
    (content: string) => {
      if (!room || !userId) return;

      const id = Math.random().toString(36).slice(2);
      const timestamp = Date.now();

      const dataMsg: ChatMessageData = {
        type: DataMessageType.CHAT_MESSAGE,
        id,
        senderId: userId,
        senderName: userName,
        content,
        messageType: "text",
        timestamp,
      };

      // Optimistic add to local state
      setMessages((prev) => [
        ...prev,
        {
          id,
          senderId: userId,
          senderName: userName,
          content,
          type: "text",
          timestamp,
        },
      ]);

      void sendReliable(dataMsg);
    },
    [room, userId, userName, sendReliable],
  );

  // ── Mark as read / unread tracking ─────────────────────────────────

  const markRead = useCallback(() => {
    isChatOpenRef.current = true;
    setUnreadCount(0);
  }, []);

  /** Call when the chat panel is closed to resume unread counting. */
  const markUnread = useCallback(() => {
    isChatOpenRef.current = false;
  }, []);

  return {
    messages,
    sendMessage,
    unreadCount,
    markRead,
    markUnread,
  };
}

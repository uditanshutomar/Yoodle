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
  const isReadRef = useRef(true);

  const { sendReliable, onMessage } = useDataChannel(room);

  // ── Listen for incoming chat messages ──────────────────────────────

  useEffect(() => {
    const unsub = onMessage(
      DataMessageType.CHAT_MESSAGE,
      (msg: DataMessage, _senderId: string) => {
        if (msg.type !== DataMessageType.CHAT_MESSAGE) return;
        const chat = msg as ChatMessageData;

        setMessages((prev) => {
          // Deduplicate (optimistic add from sendMessage)
          if (prev.some((m) => m.id === chat.id)) return prev;
          return [
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
        });

        // Increment unread if from someone else and panel not actively read
        if (chat.senderId !== userId && !isReadRef.current) {
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

  // ── Mark as read ───────────────────────────────────────────────────

  const markRead = useCallback(() => {
    isReadRef.current = true;
    setUnreadCount(0);
  }, []);

  // After marking read, flip back to "not actively reading" so future
  // messages from others increment the counter.
  useEffect(() => {
    if (unreadCount === 0 && isReadRef.current) {
      const timer = setTimeout(() => {
        isReadRef.current = false;
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [unreadCount]);

  return {
    messages,
    sendMessage,
    unreadCount,
    markRead,
  };
}

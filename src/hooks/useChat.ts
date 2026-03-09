"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Socket } from "socket.io-client";
import {
  SOCKET_EVENTS,
  type ChatMessagePayload,
} from "@/lib/realtime/socket-events";

export interface UseChatReturn {
  messages: ChatMessagePayload[];
  sendMessage: (content: string) => void;
  unreadCount: number;
  markRead: () => void;
}

/**
 * Manages chat messages, socket event handlers, and unread count tracking.
 *
 * Bug #7 fix: tracks unread messages when the chat panel is closed so the
 * controls bar can display a badge.
 */
export function useChat(
  socket: Socket | null,
  roomId: string,
  userId: string,
  userName: string
): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessagePayload[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Track whether the consumer has marked messages as read (chat panel open)
  const isReadRef = useRef(true);

  // ── Socket event handlers ──────────────────────────────────────────

  useEffect(() => {
    if (!socket) return;

    const handleChatMessage = (msg: ChatMessagePayload) => {
      setMessages((prev) => [...prev, msg]);

      // Only count as unread if the message is from someone else and
      // the chat panel is not actively being read
      if (msg.senderId !== userId && !isReadRef.current) {
        setUnreadCount((prev) => prev + 1);
      }
    };

    const handleChatHistory = (history: ChatMessagePayload[]) => {
      setMessages(history);
    };

    socket.on(SOCKET_EVENTS.CHAT_MESSAGE, handleChatMessage);
    socket.on(SOCKET_EVENTS.CHAT_HISTORY, handleChatHistory);

    return () => {
      socket.off(SOCKET_EVENTS.CHAT_MESSAGE, handleChatMessage);
      socket.off(SOCKET_EVENTS.CHAT_HISTORY, handleChatHistory);
    };
  }, [socket, userId]);

  // ── Send message ───────────────────────────────────────────────────

  const sendMessage = useCallback(
    (content: string) => {
      if (!socket || !userId) return;

      const msg: ChatMessagePayload = {
        id: Math.random().toString(36).slice(2),
        roomId,
        senderId: userId,
        senderName: userName,
        content,
        type: "text",
        timestamp: Date.now(),
      };

      socket.emit(SOCKET_EVENTS.CHAT_MESSAGE, msg);
      setMessages((prev) => [...prev, msg]);
    },
    [socket, userId, userName, roomId]
  );

  // ── Mark as read (call when chat panel opens) ──────────────────────

  const markRead = useCallback(() => {
    isReadRef.current = true;
    setUnreadCount(0);
  }, []);

  /**
   * Expose a way for the parent to signal that the chat panel closed.
   * We use a ref trick: when markRead is called we set isReadRef to true;
   * the parent should call this when opening chat. When chat closes, the
   * parent simply stops calling markRead, and the next incoming message
   * will increment the unread counter.
   *
   * To properly toggle: the parent should call markRead() when opening the
   * chat and set isReadRef.current = false when closing. We provide a
   * clean API by resetting the ref after a tick.
   */
  // The parent controls open/close — we just need to know if it's "read".
  // We flip isReadRef to false whenever unreadCount is reset, so the next
  // message triggers the badge again once the panel closes.
  useEffect(() => {
    // After marking read, flip back to "not actively reading" so future
    // messages from others increment the counter. The parent must call
    // markRead again to clear.
    if (unreadCount === 0 && isReadRef.current) {
      // Small delay so the current render sees unreadCount=0 first
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

"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

interface ConversationData {
  unreadCount?: number;
  lastMessage?: { content: string; sender: string; createdAt: string };
  name?: string;
  participants?: Array<{
    _id: string;
    name?: string;
  }>;
}

export function useMessageNotifications() {
  const { user } = useAuth();
  const prevUnreadRef = useRef<number>(0);

  useEffect(() => {
    if (!user) return;

    const check = async () => {
      try {
        const res = await fetch("/api/conversations", {
          credentials: "include",
        });
        if (!res.ok) return;
        const data = await res.json();
        const conversations: ConversationData[] = data.data || [];
        const totalUnread = conversations.reduce(
          (sum, c) => sum + (c.unreadCount || 0),
          0
        );

        // If unread count increased, find which conversation has new messages
        if (totalUnread > prevUnreadRef.current && prevUnreadRef.current > 0) {
          const newConv = conversations.find(
            (c) => c.unreadCount && c.unreadCount > 0
          );
          if (newConv) {
            const preview = newConv.lastMessage?.content || "New message";
            toast(preview.slice(0, 60), {
              description: newConv.name || "New message",
              duration: 4000,
            });
          }
        }
        prevUnreadRef.current = totalUnread;
      } catch {
        // Silent fail
      }
    };

    const interval = setInterval(check, 15000);
    check(); // Initial check
    return () => clearInterval(interval);
  }, [user]);
}

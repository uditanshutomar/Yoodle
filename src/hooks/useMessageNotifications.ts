"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

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
        const conversations = data.data || [];
        const totalUnread = conversations.reduce(
          (sum: number, c: any) => sum + (c.unreadCount || 0),
          0
        );

        // If unread count increased, find which conversation has new messages
        if (totalUnread > prevUnreadRef.current && prevUnreadRef.current > 0) {
          const newConv = conversations.find(
            (c: any) =>
              c.unreadCount > 0 &&
              !c.participants?.find(
                (p: any) =>
                  p.userId?._id === user.id || p.userId === user.id
              )?.muted
          );
          if (newConv) {
            const preview =
              (newConv.lastMessagePreview as string) || "New message";
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

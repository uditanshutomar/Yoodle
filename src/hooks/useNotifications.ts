"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "./useAuth";

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  sourceType: string;
  sourceId: string;
  read: boolean;
  priority: string;
  createdAt: string;
}

export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const eventSourceRef = useRef<EventSource | null>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?page=1&limit=20", {
        credentials: "include",
      });
      if (!res.ok) return;
      const json = await res.json();
      if (json.success) {
        setNotifications(
          json.data.notifications.map((n: any) => ({ ...n, id: n._id || n.id }))
        );
        setUnreadCount(json.data.unreadCount);
      }
    } catch {
      /* silently fail */
    } finally {
      setLoading(false);
    }
  }, []);

  // SSE connection
  useEffect(() => {
    if (!user) return;
    fetchNotifications();

    const es = new EventSource("/api/notifications/stream", {
      withCredentials: true,
    });
    eventSourceRef.current = es;

    es.addEventListener("notification", (event) => {
      try {
        const data = JSON.parse(event.data);
        const notification: NotificationItem = {
          ...data,
          id: data.id || data._id,
        };
        setNotifications((prev) => [notification, ...prev]);
        if (notification.priority !== "low") {
          setUnreadCount((prev) => prev + 1);
        }
      } catch {
        /* invalid event */
      }
    });

    es.onerror = () => {
      /* EventSource auto-reconnects */
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [user, fetchNotifications]);

  const markRead = useCallback(
    async (id: string) => {
      // Only decrement unread count if the notification was actually unread
      setNotifications((prev) => {
        const target = prev.find((n) => n.id === id);
        if (target && !target.read) {
          setUnreadCount((c) => Math.max(0, c - 1));
        }
        return prev.map((n) => (n.id === id ? { ...n, read: true } : n));
      });
      try {
        await fetch(`/api/notifications/${id}`, {
          method: "PATCH",
          credentials: "include",
        });
      } catch {
        fetchNotifications();
      }
    },
    [fetchNotifications]
  );

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    try {
      await fetch("/api/notifications/read-all", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      fetchNotifications();
    }
  }, [fetchNotifications]);

  return {
    notifications,
    unreadCount,
    loading,
    markRead,
    markAllRead,
    refresh: fetchNotifications,
  };
}

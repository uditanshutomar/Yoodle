"use client";

import { useMemo } from "react";
import {
  Bell,
  CheckCheck,
  MessageCircle,
  Video,
  CheckSquare,
  Sparkles,
  Ghost,
} from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  useNotifications,
  type NotificationItem,
} from "@/hooks/useNotifications";

function getRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}d ago`;
}

function getNotificationIcon(type: string) {
  switch (type) {
    case "mention":
      return MessageCircle;
    case "meeting_invite":
      return Video;
    case "task_assigned":
      return CheckSquare;
    case "ai_action_complete":
      return Sparkles;
    case "ghost_room_expiring":
      return Ghost;
    default:
      return Bell;
  }
}

function getNavigationPath(sourceType: string, sourceId: string): string {
  switch (sourceType) {
    case "meeting":
      return `/meetings/${sourceId}`;
    case "message":
      return `/messages/${sourceId}`;
    case "task":
      return "/board";
    default:
      return "#";
  }
}

function NotificationRow({
  notification,
  onAction,
}: {
  notification: NotificationItem;
  onAction: (n: NotificationItem) => void;
}) {
  const Icon = getNotificationIcon(notification.type);
  const isUrgent = notification.priority === "urgent";
  const isUnread = !notification.read;

  const iconContainerClass = isUrgent
    ? "bg-[#FF6B6B]/10 text-[#FF6B6B]"
    : "bg-[var(--surface-hover)] text-[var(--text-secondary)]";

  const rowBg = isUnread ? "bg-[#FFE600]/5" : "";

  return (
    <button
      onClick={() => onAction(notification)}
      className={`flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none cursor-pointer ${rowBg}`}
    >
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconContainerClass}`}
      >
        <Icon size={16} aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p
            className={`truncate text-sm ${isUnread ? "font-bold text-[var(--text-primary)]" : "font-normal text-[var(--text-secondary)]"}`}
            style={{ fontFamily: "var(--font-heading)" }}
          >
            {notification.title}
          </p>
          {isUnread && (
            <span className="h-2 w-2 shrink-0 rounded-full bg-[#FFE600]" />
          )}
        </div>
        <p
          className="truncate text-xs text-[var(--text-muted)] mt-0.5"
          style={{ fontFamily: "var(--font-body)" }}
        >
          {notification.body}
        </p>
        <p
          className="text-[10px] text-[var(--text-muted)] mt-1"
          style={{ fontFamily: "var(--font-body)" }}
        >
          {getRelativeTime(notification.createdAt)}
        </p>
      </div>
    </button>
  );
}

export default function NotificationBell() {
  const { notifications, unreadCount, loading, markRead, markAllRead } =
    useNotifications();
  const router = useRouter();

  const badgeLabel = useMemo(() => {
    if (unreadCount <= 0) return null;
    return unreadCount > 99 ? "99+" : String(unreadCount);
  }, [unreadCount]);

  const handleNotificationClick = (n: NotificationItem) => {
    if (!n.read) markRead(n.id);
    const path = getNavigationPath(n.sourceType, n.sourceId);
    if (path !== "#") router.push(path);
  };

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          className="relative rounded-xl p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
          aria-label="Notifications"
        >
          <Bell size={20} aria-hidden="true" />
          <AnimatePresence>
            {badgeLabel && (
              <motion.span
                key="badge"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#FF6B6B] px-1 text-[10px] font-bold text-white"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                {badgeLabel}
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content asChild sideOffset={8} align="end">
          <motion.div
            className="z-50 w-[360px] max-h-[480px] flex flex-col bg-[var(--surface)] border-2 border-[var(--border-strong)] rounded-2xl shadow-[4px_4px_0_var(--border-strong)]"
            initial={{ opacity: 0, y: -5, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -5, scale: 0.95 }}
            transition={{ duration: 0.15 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b-2 border-[var(--border)] px-4 py-3">
              <h3
                className="text-sm font-bold text-[var(--text-primary)]"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                Notifications
              </h3>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none transition-colors cursor-pointer"
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  <CheckCheck size={14} />
                  Mark all read
                </button>
              )}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-2" style={{ overscrollBehavior: "contain" }}>
              {loading ? (
                <div className="space-y-2 p-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-start gap-3 animate-pulse">
                      <div className="h-8 w-8 shrink-0 rounded-lg bg-[var(--surface-hover)]" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 w-3/4 rounded bg-[var(--surface-hover)]" />
                        <div className="h-2 w-1/2 rounded bg-[var(--surface-hover)]" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-[var(--text-muted)]">
                  <Bell size={32} className="mb-2 opacity-40" aria-hidden="true" />
                  <p
                    className="text-sm"
                    style={{ fontFamily: "var(--font-body)" }}
                  >
                    No notifications yet
                  </p>
                </div>
              ) : (
                notifications.map((n) => (
                  <NotificationRow
                    key={n.id}
                    notification={n}
                    onAction={handleNotificationClick}
                  />
                ))
              )}
            </div>
          </motion.div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

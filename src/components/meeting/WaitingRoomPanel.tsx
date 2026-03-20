"use client";

import { useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Clock, Check, Ban } from "lucide-react";
import Avatar from "@/components/ui/Avatar";

export interface WaitingUser {
  id: string;
  name: string;
  displayName: string;
  avatar?: string | null;
  joinedWaitingAt: number;
}

interface WaitingRoomPanelProps {
  isOpen: boolean;
  onClose: () => void;
  waitingUsers: WaitingUser[];
  onAdmit: (userId: string) => void;
  onDeny: (userId: string) => void;
  onAdmitAll: () => void;
}

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ago`;
}

export default function WaitingRoomPanel({
  isOpen,
  onClose,
  waitingUsers,
  onAdmit,
  onDeny,
  onAdmitAll,
}: WaitingRoomPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (isOpen) {
      panelRef.current?.focus();
    }
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={panelRef}
          tabIndex={-1}
          className="w-80 h-full flex flex-col bg-[var(--surface)]/95 backdrop-blur-sm border-l-2 border-[var(--border-strong)]"
          role="complementary"
          aria-label="Waiting room"
          initial={{ x: 320, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 320, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b-2 border-[var(--border-strong)]/10">
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-[#FFE600]" />
              <h3
                className="text-base font-bold text-[var(--text-primary)] font-heading"
              >
                Waiting Room
              </h3>
              {waitingUsers.length > 0 && (
                <span
                  className="inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-[#FFE600] text-[#0A0A0A] text-[10px] font-bold px-1.5 border border-[var(--border-strong)] font-heading"
                >
                  {waitingUsers.length}
                </span>
              )}
            </div>
            <motion.button
              className="rounded-lg p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={onClose}
              aria-label="Close waiting room panel"
            >
              <X size={16} />
            </motion.button>
          </div>

          {/* Admit all button */}
          {waitingUsers.length > 1 && (
            <div className="px-4 py-2 border-b border-[var(--border-strong)]/5">
              <motion.button
                className="w-full py-2 rounded-lg border-2 border-[var(--border-strong)] bg-[#06B6D4] text-white text-xs font-bold shadow-[2px_2px_0_var(--border-strong)] cursor-pointer focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none font-heading"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={onAdmitAll}
              >
                Admit All ({waitingUsers.length})
              </motion.button>
            </div>
          )}

          {/* Waiting list */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
            {waitingUsers.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Clock size={32} className="text-[var(--text-muted)] mb-2" />
                <p
                  className="text-sm text-[var(--text-muted)] font-heading"
                >
                  No one is waiting
                </p>
              </div>
            ) : (
              waitingUsers.map((user, i) => (
                <motion.div
                  key={user.id}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-[var(--surface-hover)] transition-colors"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  {/* Avatar */}
                  <Avatar src={user.avatar} name={user.name} size="sm" />

                  {/* Name + waiting time */}
                  <div className="flex-1 min-w-0">
                    <span
                      className="text-sm font-bold text-[var(--text-primary)] truncate block font-heading"
                    >
                      {user.displayName || user.name}
                    </span>
                    <span className="text-[11px] text-[var(--text-muted)]">
                      {timeAgo(user.joinedWaitingAt)}
                    </span>
                  </div>

                  {/* Admit / Deny buttons */}
                  <div className="flex items-center gap-1 shrink-0">
                    <motion.button
                      className="h-7 w-7 rounded-lg border-2 border-[var(--border-strong)] bg-[#06B6D4] text-white flex items-center justify-center cursor-pointer shadow-[1px_1px_0_var(--border-strong)] focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none"
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => onAdmit(user.id)}
                      title="Admit"
                      aria-label={`Admit ${user.displayName || user.name || "user"}`}
                    >
                      <Check size={14} />
                    </motion.button>
                    <motion.button
                      className="h-7 w-7 rounded-lg border-2 border-[var(--border-strong)] bg-[#FF6B6B] text-white flex items-center justify-center cursor-pointer shadow-[1px_1px_0_var(--border-strong)] focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none"
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => onDeny(user.id)}
                      title="Deny"
                      aria-label={`Deny ${user.displayName || user.name || "user"}`}
                    >
                      <Ban size={14} />
                    </motion.button>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

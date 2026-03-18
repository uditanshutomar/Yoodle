"use client";

import { motion, AnimatePresence } from "framer-motion";
import { WifiOff, RefreshCw, LogOut } from "lucide-react";

interface ReconnectionOverlayProps {
  isDisconnected: boolean;
  attemptCount: number;
  maxAttempts: number;
  onLeave: () => void;
}

export default function ReconnectionOverlay({
  isDisconnected,
  attemptCount,
  maxAttempts,
  onLeave,
}: ReconnectionOverlayProps) {
  const isFailed = attemptCount >= maxAttempts;

  return (
    <AnimatePresence>
      {isDisconnected && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0A0A0A]/70 backdrop-blur-sm"
          role="alertdialog"
          aria-live="assertive"
          aria-label="Connection lost"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] p-8 shadow-[6px_6px_0_var(--border-strong)] max-w-sm w-full mx-4 text-center"
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
          >
            {isFailed ? (
              <>
                {/* Connection lost permanently */}
                <div className="flex items-center justify-center w-16 h-16 mx-auto rounded-2xl border-2 border-[var(--border-strong)] bg-[#FF6B6B] shadow-[3px_3px_0_var(--border-strong)] mb-4">
                  <WifiOff size={28} className="text-white" />
                </div>
                <h2
                  className="text-xl font-bold text-[#0A0A0A] mb-2"
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  Connection Lost
                </h2>
                <p className="text-sm text-[#0A0A0A]/60 mb-6">
                  Unable to reconnect after {maxAttempts} attempts. Please rejoin the meeting.
                </p>
                <motion.button
                  className="w-full py-3 rounded-xl border-2 border-[var(--border-strong)] bg-[#FF6B6B] text-white font-bold shadow-[3px_3px_0_var(--border-strong)] cursor-pointer flex items-center justify-center gap-2"
                  style={{ fontFamily: "var(--font-heading)" }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={onLeave}
                >
                  <LogOut size={16} />
                  Leave Meeting
                </motion.button>
              </>
            ) : (
              <>
                {/* Reconnecting */}
                <div className="flex items-center justify-center w-16 h-16 mx-auto rounded-2xl border-2 border-[var(--border-strong)] bg-[#FFE600] shadow-[3px_3px_0_var(--border-strong)] mb-4">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                  >
                    <RefreshCw size={28} className="text-[#0A0A0A]" />
                  </motion.div>
                </div>
                <h2
                  className="text-xl font-bold text-[#0A0A0A] mb-2"
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  Reconnecting...
                </h2>
                <p className="text-sm text-[#0A0A0A]/60 mb-4">
                  Attempting to restore your connection
                </p>
                <div className="flex items-center justify-center gap-1 mb-6" aria-hidden="true">
                  {Array.from({ length: maxAttempts }).map((_, i) => (
                    <div
                      key={i}
                      className={`h-2 w-2 rounded-full border border-[var(--border-strong)]/20 ${
                        i < attemptCount
                          ? "bg-[#FFE600]"
                          : "bg-[#0A0A0A]/10"
                      }`}
                    />
                  ))}
                </div>
                <p className="text-xs text-[#0A0A0A]/40">
                  Attempt {attemptCount} of {maxAttempts}
                </p>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

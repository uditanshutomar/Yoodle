"use client";

import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import ChatWindow from "@/components/ai/ChatWindow";
import { useAIChat } from "@/hooks/useAIChat";
import { useAuth } from "@/hooks/useAuth";
import { useInsightCount } from "@/hooks/useInsightCount";

const MASCOT_BY_MODE: Record<string, string> = {
  social: "/mascot-social.png",
  lockin: "/mascot-lockin.png",
  invisible: "/mascot-invisible.png",
};

interface AIDrawerContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const AIDrawerContext = createContext<AIDrawerContextValue>({
  isOpen: false,
  open: () => {},
  close: () => {},
  toggle: () => {},
});

export const useAIDrawer = () => useContext(AIDrawerContext);

export function AIDrawerProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const close = useCallback(() => setIsOpen(false), []);
  const { count: insightCount, clearCount } = useInsightCount(!isOpen);
  const toggle = useCallback(() => {
    setIsOpen((p) => {
      if (!p) clearCount(); // Clear badge when opening via toggle
      return !p;
    });
  }, [clearCount]);
  const open = useCallback(() => { setIsOpen(true); clearCount(); }, [clearCount]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "j") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggle]);

  return (
    <AIDrawerContext.Provider value={{ isOpen, open, close, toggle }}>
      {children}
      <AIDrawerPanel isOpen={isOpen} onClose={close} />
      <AIDrawerFAB onClick={toggle} isOpen={isOpen} insightCount={insightCount} />
    </AIDrawerContext.Provider>
  );
}

function AIDrawerFAB({ onClick, isOpen, insightCount }: { onClick: () => void; isOpen: boolean; insightCount: number }) {
  const { user } = useAuth();
  const mascotSrc = MASCOT_BY_MODE[user?.mode || "social"] || MASCOT_BY_MODE.social;
  const constraintsRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const [dragging, setDragging] = useState(false);

  if (isOpen) return null;

  return (
    <div ref={constraintsRef} className="fixed inset-0 z-50 pointer-events-none">
      <motion.button
        drag
        dragConstraints={constraintsRef}
        dragElastic={0.1}
        dragMomentum={false}
        onDragStart={() => { isDragging.current = true; setDragging(true); }}
        onDragEnd={() => { setDragging(false); setTimeout(() => { isDragging.current = false; }, 0); }}
        onClick={() => { if (!isDragging.current) onClick(); }}
        initial={{ scale: 0, x: 0, y: 0 }}
        animate={{ scale: dragging ? 2 : 1 }}
        whileHover={{ scale: dragging ? 2 : 1.1, rotate: dragging ? 0 : -5 }}
        whileTap={{ scale: dragging ? 2 : 0.95 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        style={{ position: "absolute", bottom: 24, right: 24 }}
        className="pointer-events-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#FFE600] border-2 border-[var(--border-strong)] shadow-[3px_3px_0_var(--border-strong)] cursor-grab active:cursor-grabbing overflow-hidden"
        title="Ask Doodle (⌘J) — drag me anywhere!"
      >
        <Image src={mascotSrc} alt="Yoodle" width={56} height={56} className="mix-blend-multiply pointer-events-none select-none object-cover" draggable={false} />
        {insightCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white border-2 border-[var(--background)] animate-pulse">
            {insightCount > 9 ? "9+" : insightCount}
          </span>
        )}
      </motion.button>
    </div>
  );
}

function AIDrawerPanel({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { messages, isStreaming, sendMessage, stopStreaming, clearMessages, sessions, activeSessionId, switchSession } = useAIChat();

  const handleCardAction = useCallback(async (actionType: string, args: Record<string, unknown>) => {
    if (actionType === "undo_cascade_action" && args.undoToken) {
      try {
        const res = await fetch("/api/ai/action/undo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ undoToken: args.undoToken }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          console.error("Undo failed:", data.error?.message || res.statusText);
        }
      } catch (err) {
        console.error("Undo request failed:", err);
      }
    }
  }, []);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 z-50 bg-black/40 lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            className="fixed top-0 right-0 z-50 h-full w-full sm:w-[400px] lg:w-[400px] bg-[var(--background)] border-l-2 border-[var(--border)] shadow-[-4px_0_20px_rgba(0,0,0,0.1)] flex flex-col"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          >
            <div className="flex-1 min-h-0">
              <ChatWindow
                messages={messages}
                isStreaming={isStreaming}
                onSend={sendMessage}
                onStop={stopStreaming}
                onClear={clearMessages}
                onClose={onClose}
                onCardAction={handleCardAction}
                sessions={sessions}
                activeSessionId={activeSessionId}
                onSwitchSession={switchSession}
              />
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

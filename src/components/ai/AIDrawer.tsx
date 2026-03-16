"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Bot } from "lucide-react";
import ChatWindow from "@/components/ai/ChatWindow";
import { useAIChat } from "@/hooks/useAIChat";

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
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((p) => !p), []);

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
      <AIDrawerFAB onClick={toggle} isOpen={isOpen} />
    </AIDrawerContext.Provider>
  );
}

function AIDrawerFAB({ onClick, isOpen }: { onClick: () => void; isOpen: boolean }) {
  if (isOpen) return null;

  return (
    <motion.button
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      whileHover={{ scale: 1.1, rotate: -5 }}
      whileTap={{ scale: 0.9 }}
      onClick={onClick}
      className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#FFE600] border-2 border-[var(--border-strong)] shadow-[3px_3px_0_var(--border-strong)] lg:bottom-8 lg:right-8"
      title="Ask Doodle (⌘J)"
    >
      <Bot size={24} className="text-[#0A0A0A]" />
    </motion.button>
  );
}

function AIDrawerPanel({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { messages, isStreaming, sendMessage, stopStreaming, clearMessages } = useAIChat();

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
            <div className="flex items-center justify-between px-4 py-3 border-b-2 border-[var(--border)]">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FFE600] border-2 border-[var(--border-strong)]">
                  <Bot size={16} className="text-[#0A0A0A]" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)]" style={{ fontFamily: "var(--font-heading)" }}>
                    Doodle Poodle
                  </h3>
                  <p className="text-[10px] text-[var(--text-muted)]">⌘J to toggle</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <ChatWindow
                messages={messages}
                isStreaming={isStreaming}
                onSend={sendMessage}
                onStop={stopStreaming}
                onClear={clearMessages}
              />
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

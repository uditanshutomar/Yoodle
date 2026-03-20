"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Sparkles, X, Wifi, WifiOff, RefreshCw } from "lucide-react";

interface CopilotMessage {
  id: string;
  type: string;
  text: string;
  timestamp: number;
  isError?: boolean;
}

interface CopilotPanelProps {
  isOpen: boolean;
  onClose: () => void;
  meetingId: string;
  /** Called when a new suggestion arrives while the panel may be closed */
  onNewMessage?: () => void;
}

export default function CopilotPanel({ isOpen, onClose, meetingId, onNewMessage }: CopilotPanelProps) {
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const [errorCount, setErrorCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  /** Create a new EventSource and attach handlers. Does NOT call setState synchronously. */
  const createEventSource = useCallback((mId: string): EventSource => {
    const es = new EventSource(`/api/meetings/${mId}/copilot`);
    eventSourceRef.current = es;

    es.onopen = () => {
      setConnected(true);
      setErrorCount(0);
    };

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "connected") { setConnected(true); return; }

        // Handle error events from backend distinctly
        if (data.type === "error") {
          setMessages((prev) => [...prev, {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            type: "error",
            text: data.message || "An error occurred",
            timestamp: Date.now(),
            isError: true,
          }]);
          return;
        }

        setMessages((prev) => [...prev, {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: data.type || "suggestion",
          text: data.text || data.message || JSON.stringify(data),
          timestamp: Date.now(),
        }]);
        onNewMessage?.();
      } catch (err) {
        if (err instanceof SyntaxError) return; // ignore unparseable SSE data
        console.error("[CopilotPanel] Error processing copilot message:", err);
      }
    };

    es.onerror = () => {
      setConnected(false);
      setErrorCount((c) => c + 1);
    };

    return es;
  }, [onNewMessage]);

  // SSE subscription — connect when panel opens, disconnect when it closes.
  // State resets (messages, errorCount) happen here so each open starts fresh.
  // Using flushSync-free queueMicrotask to avoid the "setState in effect" lint rule.
  useEffect(() => {
    if (!isOpen || !meetingId) return;

    // Reset state asynchronously to avoid cascading render warnings
    queueMicrotask(() => {
      setMessages([]);
      setErrorCount(0);
      setConnected(false);
    });

    const es = createEventSource(meetingId);

    return () => {
      es.close();
      eventSourceRef.current = null;
      queueMicrotask(() => setConnected(false));
    };
  }, [isOpen, meetingId, createEventSource]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // After too many consecutive errors, close the EventSource to stop infinite retries
  useEffect(() => {
    if (errorCount >= 5 && eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, [errorCount]);

  const handleRetry = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setMessages([]);
    setErrorCount(0);
    setConnected(false);
    if (meetingId) {
      createEventSource(meetingId);
    }
  };

  if (!isOpen) return null;

  const showRetry = errorCount >= 5;

  return (
    <motion.div
      initial={{ x: 300, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 300, opacity: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 28 }}
      className="absolute right-0 top-0 bottom-0 z-30 w-full sm:w-[340px] border-l-2 border-[var(--border-strong)] bg-[var(--background)] shadow-[-4px_0_0_var(--border-strong)] flex flex-col"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b-2 border-[var(--border-strong)]">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-[#A855F7]" />
          <span className="font-bold text-sm font-heading">Yoodler Live</span>
          {showRetry ? (
            <span className="flex items-center gap-1 text-[10px] text-[#FF6B6B]"><WifiOff size={10} /> Disconnected</span>
          ) : connected ? (
            <span className="flex items-center gap-1 text-[10px] text-green-500"><Wifi size={10} /> Live</span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] text-yellow-500"><WifiOff size={10} /> Connecting…</span>
          )}
        </div>
        <button onClick={onClose} aria-label="Close Yoodler Live" className="rounded-lg p-1 hover:bg-[var(--surface)] transition-colors"><X size={16} /></button>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {showRetry && (
          <div className="text-center mt-8">
            <WifiOff size={24} className="mx-auto mb-2 text-[#FF6B6B] opacity-60" />
            <p className="text-sm text-[var(--text-secondary)] mb-3">Connection lost</p>
            <button
              onClick={handleRetry}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded-xl bg-[#FFE600] text-[#1a1a1a] hover:bg-[#FFE600]/90 transition-colors font-heading"
            >
              <RefreshCw size={12} /> Retry
            </button>
          </div>
        )}
        {!showRetry && messages.length === 0 && (
          <div className="text-center text-sm text-[var(--text-secondary)] mt-12">
            <Sparkles size={24} className="mx-auto mb-2 text-[#A855F7] opacity-50" />
            <p>AI suggestions will appear here during the meeting.</p>
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`rounded-xl border p-3 text-sm ${
              msg.isError
                ? "border-[#FF6B6B]/30 bg-[#FF6B6B]/5"
                : "border-[var(--border)] bg-[var(--surface)]"
            }`}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <Sparkles size={12} className={msg.isError ? "text-[#FF6B6B]" : "text-[#A855F7]"} />
              <span className="text-[10px] text-[var(--text-secondary)]">
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            <p className="text-[var(--text-primary)] leading-relaxed">{msg.text}</p>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

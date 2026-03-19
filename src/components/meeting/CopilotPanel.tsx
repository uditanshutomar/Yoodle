"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, X, Wifi, WifiOff } from "lucide-react";

interface CopilotMessage {
  id: string;
  type: string;
  text: string;
  timestamp: number;
}

interface CopilotPanelProps {
  isOpen: boolean;
  onClose: () => void;
  meetingId: string;
}

export default function CopilotPanel({ isOpen, onClose, meetingId }: CopilotPanelProps) {
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!isOpen || !meetingId) return;
    const es = new EventSource(`/api/meetings/${meetingId}/copilot`);
    eventSourceRef.current = es;
    es.onopen = () => setConnected(true);
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "connected") { setConnected(true); return; }
        if (data.type === "heartbeat") return;
        setMessages((prev) => [...prev, {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: data.type || "suggestion",
          text: data.text || data.message || JSON.stringify(data),
          timestamp: Date.now(),
        }]);
      } catch { /* ignore parse errors */ }
    };
    es.onerror = () => setConnected(false);
    return () => { es.close(); eventSourceRef.current = null; setConnected(false); };
  }, [isOpen, meetingId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  if (!isOpen) return null;

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
          <span className="font-bold text-sm" style={{ fontFamily: "var(--font-heading)" }}>Copilot</span>
          {connected ? (
            <span className="flex items-center gap-1 text-[10px] text-green-500"><Wifi size={10} /> Live</span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] text-yellow-500"><WifiOff size={10} /> Connecting…</span>
          )}
        </div>
        <button onClick={onClose} className="rounded-lg p-1 hover:bg-[var(--surface)] transition-colors"><X size={16} /></button>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-sm text-[var(--text-secondary)] mt-12">
            <Sparkles size={24} className="mx-auto mb-2 text-[#A855F7] opacity-50" />
            <p>AI suggestions will appear here during the meeting.</p>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-sm">
            <div className="flex items-center gap-1.5 mb-1">
              <Sparkles size={12} className="text-[#A855F7]" />
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

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X } from "lucide-react";
import Avatar from "@/components/ui/Avatar";

interface MessageSearchProps {
  conversationId: string;
  isOpen: boolean;
  onClose: () => void;
  onResultClick: (messageId: string) => void;
}

interface SearchResult {
  _id: string;
  content: string;
  createdAt: string;
  senderId: {
    _id: string;
    name: string;
    displayName?: string;
    avatarUrl?: string;
  };
}

export default function MessageSearch({
  conversationId,
  isOpen,
  onClose,
  onResultClick,
}: MessageSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 200);
    } else {
      setQuery("");
      setResults([]);
      setSearched(false);
    }
  }, [isOpen]);

  const search = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setResults([]);
        setSearched(false);
        return;
      }

      setLoading(true);
      try {
        const res = await fetch(
          `/api/conversations/${conversationId}/search?q=${encodeURIComponent(q.trim())}`,
          { credentials: "include" }
        );
        if (res.ok) {
          const data = await res.json();
          setResults(data.data?.messages || []);
        } else {
          setResults([]);
        }
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
        setSearched(true);
      }
    },
    [conversationId]
  );

  const handleInputChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), 300);
  };

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function highlightMatch(text: string, term: string): React.ReactNode {
    if (!term.trim()) return text;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(${escaped})`, "gi");
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark key={i} className="bg-[#FFE600]/30 rounded-sm px-0.5">
          {part}
        </mark>
      ) : (
        part
      )
    );
  }

  function formatTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      return date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });
    }
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="absolute right-0 top-0 bg-[var(--surface)] border-l-2 border-[var(--border)] w-80 h-full flex flex-col z-20"
        >
          {/* Header */}
          <div className="flex items-center gap-2 p-3 border-b border-[var(--border)]">
            <Search size={16} className="text-[var(--muted)] shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => handleInputChange(e.target.value)}
              placeholder="Search messages..."
              className="flex-1 bg-transparent text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none"
            />
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-[var(--hover)] transition-colors"
            >
              <X size={16} className="text-[var(--muted)]" />
            </button>
          </div>

          {/* Results count */}
          {searched && !loading && (
            <div className="px-3 py-2 text-xs text-[var(--muted)] border-b border-[var(--border)]">
              {results.length} result{results.length !== 1 ? "s" : ""} found
            </div>
          )}

          {/* Results list */}
          <div className="flex-1 overflow-y-auto">
            {loading && (
              <div className="flex items-center justify-center py-8">
                <div className="w-5 h-5 border-2 border-[var(--muted)] border-t-[var(--foreground)] rounded-full animate-spin" />
              </div>
            )}

            {!loading && searched && results.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-[var(--muted)]">
                <Search size={32} className="mb-2 opacity-40" />
                <p className="text-sm">No messages found</p>
              </div>
            )}

            {!loading &&
              results.map((msg) => (
                <button
                  key={msg._id}
                  onClick={() => onResultClick(msg._id)}
                  className="w-full text-left px-3 py-2.5 hover:bg-[var(--hover)] transition-colors border-b border-[var(--border)]/50"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Avatar
                      src={msg.senderId.avatarUrl}
                      name={msg.senderId.displayName || msg.senderId.name}
                      size="sm"
                    />
                    <span className="text-xs font-medium text-[var(--foreground)] truncate">
                      {msg.senderId.displayName || msg.senderId.name}
                    </span>
                    <span className="text-xs text-[var(--muted)] ml-auto shrink-0">
                      {formatTime(msg.createdAt)}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--muted)] line-clamp-2 leading-relaxed">
                    {highlightMatch(msg.content, query)}
                  </p>
                </button>
              ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

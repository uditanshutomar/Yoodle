"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Link2, ImageIcon, ExternalLink } from "lucide-react";

interface SharedMediaPanelProps {
  conversationId: string;
  isOpen: boolean;
  onClose: () => void;
}

interface MediaItem {
  url: string;
  messageId: string;
  sender: { name: string; avatarUrl?: string };
  sharedAt: string;
}

type MediaTab = "links" | "images";

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url;
  }
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function SharedMediaPanel({
  conversationId,
  isOpen,
  onClose,
}: SharedMediaPanelProps) {
  const [tab, setTab] = useState<MediaTab>("links");
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchMedia = useCallback(
    async (mediaType: MediaTab) => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/conversations/${conversationId}/media?type=${mediaType}`,
          { credentials: "include" }
        );
        if (res.ok) {
          const data = await res.json();
          setItems(data.data?.items || []);
        } else {
          setItems([]);
        }
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [conversationId]
  );

  useEffect(() => {
    if (isOpen) fetchMedia(tab);
  }, [isOpen, tab, fetchMedia]);

  useEffect(() => {
    if (!isOpen) {
      setItems([]);
      setTab("links");
    }
  }, [isOpen]);

  const tabs: { key: MediaTab; label: string; icon: React.ReactNode }[] = [
    { key: "links", label: "Links", icon: <Link2 size={14} /> },
    { key: "images", label: "Images", icon: <ImageIcon size={14} /> },
  ];

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
          <div className="flex items-center justify-between p-3 border-b border-[var(--border)]">
            <h3 className="text-sm font-bold text-[var(--foreground)]">
              Shared Media
            </h3>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-[var(--hover)] transition-colors"
            >
              <X size={16} className="text-[var(--muted)]" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-[var(--border)]">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
                  tab === t.key
                    ? "text-[var(--foreground)] border-b-2 border-[#FFE600]"
                    : "text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {loading && (
              <div className="flex items-center justify-center py-8">
                <div className="w-5 h-5 border-2 border-[var(--muted)] border-t-[var(--foreground)] rounded-full animate-spin" />
              </div>
            )}

            {!loading && items.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-[var(--muted)]">
                {tab === "links" ? (
                  <Link2 size={32} className="mb-2 opacity-40" />
                ) : (
                  <ImageIcon size={32} className="mb-2 opacity-40" />
                )}
                <p className="text-sm">No {tab} shared yet</p>
              </div>
            )}

            {!loading &&
              tab === "links" &&
              items.map((item, i) => (
                <a
                  key={`${item.messageId}-${i}`}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-3 px-3 py-2.5 hover:bg-[var(--hover)] transition-colors border-b border-[var(--border)]/50 group"
                >
                  <div className="w-8 h-8 rounded bg-[var(--hover)] flex items-center justify-center shrink-0 mt-0.5">
                    <Link2 size={14} className="text-[var(--muted)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-[var(--foreground)] truncate group-hover:text-[#FFE600] transition-colors">
                      {getDomain(item.url)}
                    </p>
                    <p className="text-[10px] text-[var(--muted)] truncate">
                      {item.url}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-[10px] text-[var(--muted)]">
                        {item.sender.name}
                      </span>
                      <span className="text-[10px] text-[var(--muted)]">
                        ·
                      </span>
                      <span className="text-[10px] text-[var(--muted)]">
                        {formatDate(item.sharedAt)}
                      </span>
                    </div>
                  </div>
                  <ExternalLink
                    size={12}
                    className="text-[var(--muted)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1"
                  />
                </a>
              ))}

            {!loading && tab === "images" && (
              <div className="grid grid-cols-3 gap-1 p-2">
                {items.map((item, i) => (
                  <a
                    key={`${item.messageId}-${i}`}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="aspect-square rounded overflow-hidden bg-[var(--hover)] hover:opacity-80 transition-opacity"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.url}
                      alt=""
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </a>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { MessageCircle } from "lucide-react";

interface Conversation {
  _id: string;
  name?: string;
  participants: { name: string; displayName?: string }[];
  unreadCount: number;
  lastMessage?: { content: string };
}

export default function BuzzWidget() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();

    async function fetchConversations() {
      try {
        const res = await fetch("/api/conversations", {
          credentials: "include",
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Failed (${res.status})`);
        const json = await res.json();
        if (!mountedRef.current) return;

        const list = json?.data ?? json?.conversations ?? [];
        setConversations(Array.isArray(list) ? list.slice(0, 3) : []);
      } catch (err) {
        if (!mountedRef.current) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Silently fail — widget is non-critical
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    }

    fetchConversations();

    return () => {
      mountedRef.current = false;
      controller.abort();
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((n) => (
          <div
            key={n}
            className="h-10 animate-pulse rounded-xl bg-[var(--surface-hover)]"
          />
        ))}
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
        <MessageCircle
          size={28}
          className="text-[var(--text-muted)]"
          aria-hidden="true"
        />
        <p
          className="text-sm font-bold text-[var(--text-secondary)]"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          No conversations yet
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {conversations.map((c) => {
        const label =
          c.name ||
          c.participants
            .map((p) => p.displayName || p.name)
            .join(", ");

        return (
          <Link
            key={c._id}
            href={`/messages/${c._id}`}
            className="group flex items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2 hover:border-[#FFE600] transition-colors"
          >
            <div className="flex-1 min-w-0">
              <p
                className="text-xs font-bold text-[var(--text-primary)] truncate"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                {label}
              </p>
              {c.lastMessage && (
                <p
                  className="text-[10px] text-[var(--text-muted)] truncate"
                  style={{ fontFamily: "var(--font-body)" }}
                >
                  {c.lastMessage.content}
                </p>
              )}
            </div>
            {c.unreadCount > 0 && (
              <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#A855F7] px-1.5 text-[10px] font-bold text-white">
                {c.unreadCount}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}

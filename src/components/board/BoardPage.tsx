"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { Kanban, List, RefreshCw } from "lucide-react";
import dynamic from "next/dynamic";

const KanbanBoard = dynamic(() => import("@/components/board/KanbanBoard"), {
  ssr: false,
  loading: () => <BoardSkeleton />,
});

interface BoardSummary {
  _id: string;
  title: string;
}

function BoardSkeleton() {
  return (
    <div className="flex gap-4 overflow-hidden">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="flex-1 min-w-[240px] rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[4px_4px_0_var(--border-strong)] h-[400px] animate-pulse"
        />
      ))}
    </div>
  );
}

export default function BoardPage() {
  const [boardId, setBoardId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"board" | "list">("board");
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const fetchBoards = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/boards", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!isMountedRef.current) return;
      const boards: BoardSummary[] = json.data || [];
      if (boards.length > 0) {
        setBoardId(boards[0]._id);
      } else {
        setBoardId(null);
      }
    } catch (err) {
      if (isMountedRef.current) setError(err instanceof Error ? err.message : "Failed to load boards");
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBoards();
  }, [fetchBoards]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1
          className="text-2xl sm:text-3xl lg:text-4xl font-black text-[var(--text-primary)] leading-tight"
          style={{ fontFamily: "var(--font-heading)", textShadow: "2px 2px 0 #FFE600" }}
        >
          The Board
        </h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]" style={{ fontFamily: "var(--font-body)" }}>
          Stickies, lanes, and auto-stickies from your meetings
        </p>
      </div>

      {/* View Toggle */}
      <div className="flex items-center gap-1 rounded-xl border-2 border-[var(--border-strong)] bg-[var(--surface)] p-1 w-fit">
        <button
          onClick={() => setView("board")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
            view === "board"
              ? "bg-[#FFE600] text-[#0A0A0A] shadow-[2px_2px_0_var(--border-strong)]"
              : "text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"
          }`}
          style={{ fontFamily: "var(--font-heading)" }}
        >
          <Kanban size={14} /> Board
        </button>
        <button
          onClick={() => setView("list")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
            view === "list"
              ? "bg-[#FFE600] text-[#0A0A0A] shadow-[2px_2px_0_var(--border-strong)]"
              : "text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"
          }`}
          style={{ fontFamily: "var(--font-heading)" }}
        >
          <List size={14} /> List
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <BoardSkeleton />
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="rounded-2xl border-2 border-[#FF6B6B] bg-[#FF6B6B]/10 px-6 py-4 text-center">
            <p className="text-sm font-bold text-[#FF6B6B] mb-3" style={{ fontFamily: "var(--font-heading)" }}>
              {error}
            </p>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={fetchBoards}
              className="inline-flex items-center gap-1.5 text-sm font-bold text-[#FF6B6B] bg-[#FF6B6B]/10 border border-[#FF6B6B]/30 rounded-xl px-4 py-2 hover:bg-[#FF6B6B]/20 transition-colors"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              <RefreshCw size={14} /> Retry
            </motion.button>
          </div>
        </div>
      ) : !boardId ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[4px_4px_0_var(--border-strong)]">
            <Kanban size={28} className="text-[var(--text-muted)]" />
          </div>
          <p className="text-sm font-bold text-[var(--text-primary)]" style={{ fontFamily: "var(--font-heading)" }}>
            No board found
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            Boards are created automatically from your workspace
          </p>
        </div>
      ) : view === "list" ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[4px_4px_0_var(--border-strong)]">
            <List size={28} className="text-[var(--text-muted)]" />
          </div>
          <p className="text-sm font-bold text-[var(--text-primary)]" style={{ fontFamily: "var(--font-heading)" }}>
            List view coming soon
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            Switch to Board view to manage your tasks
          </p>
        </div>
      ) : (
        <KanbanBoard boardId={boardId} />
      )}
    </div>
  );
}

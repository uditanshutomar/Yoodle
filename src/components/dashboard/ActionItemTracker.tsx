"use client";

import { useState, useEffect } from "react";
import { CheckCircle2, Circle, AlertTriangle } from "lucide-react";

interface ActionItemStats {
  total: number;
  completed: number;
  overdue: number;
}

interface TaskItem {
  id: string;
  completedAt?: string | null;
  dueDate?: string | null;
}

export default function ActionItemTracker() {
  const [stats, setStats] = useState<ActionItemStats>({
    total: 0,
    completed: 0,
    overdue: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      try {
        const res = await fetch("/api/boards/tasks?source=meeting-mom&limit=100", {
          credentials: "include",
        });
        if (res.ok && !cancelled) {
          const data = await res.json();
          const tasks: TaskItem[] = data.data || [];
          const now = new Date();
          const total = tasks.length;
          const completed = tasks.filter((t) => !!t.completedAt).length;
          const overdue = tasks.filter(
            (t) => !t.completedAt && t.dueDate && new Date(t.dueDate) < now
          ).length;
          setStats({ total, completed, overdue });
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();
    return () => {
      cancelled = true;
    };
  }, []);

  const open = stats.total - stats.completed;
  const pct = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

  if (loading) {
    return (
      <div className="rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[var(--shadow-card)] p-4">
        <div className="flex items-center justify-between mb-3">
          <h2
            className="text-sm font-bold text-[var(--text-primary)]"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            <CheckCircle2 className="inline -mt-0.5 mr-1 text-[#22C55E]" size={15} />
            Action Items
          </h2>
        </div>
        <div className="animate-pulse space-y-2">
          <div className="h-3 bg-[var(--surface-hover)] rounded-full" />
          <div className="h-10 bg-[var(--surface-hover)] rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[var(--shadow-card)] overflow-hidden p-4">
      <div className="flex items-center justify-between mb-3">
        <h2
          className="text-sm font-bold text-[var(--text-primary)]"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          <CheckCircle2 className="inline -mt-0.5 mr-1 text-[#22C55E]" size={15} />
          Action Items
        </h2>
        <span
          className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          {stats.total} total
        </span>
      </div>

      {/* Progress bar */}
      <div className="relative h-2.5 rounded-full bg-[var(--surface-hover)] overflow-hidden mb-3">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-[#22C55E] transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Stats row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-[11px] font-semibold text-[#22C55E]">
          <CheckCircle2 size={13} />
          <span>{stats.completed} done</span>
        </div>
        <div className="flex items-center gap-1 text-[11px] font-semibold text-[var(--text-muted)]">
          <Circle size={13} />
          <span>{open} open</span>
        </div>
        <div className="flex items-center gap-1 text-[11px] font-semibold text-[#EF4444]">
          <AlertTriangle size={13} />
          <span>{stats.overdue} overdue</span>
        </div>
      </div>
    </div>
  );
}

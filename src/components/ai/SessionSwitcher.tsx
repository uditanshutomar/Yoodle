"use client";

interface Session {
  id: string;
  label?: string;
  createdAt: number;
}

interface SessionSwitcherProps {
  sessions: Session[];
  activeSessionId?: string;
  onSwitch: (id: string) => void;
}

export default function SessionSwitcher({ sessions, activeSessionId, onSwitch }: SessionSwitcherProps) {
  if (sessions.length === 0) return null;

  return (
    <div className="flex items-center gap-1 px-5 py-1.5 border-b border-[var(--border)] overflow-x-auto">
      <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide text-[var(--text-muted)] mr-1">History</span>
      {sessions.map((session) => {
        const isActive = session.id === activeSessionId;
        const label = session.label || formatDate(session.createdAt);
        return (
          <button
            key={session.id}
            onClick={() => onSwitch(session.id)}
            aria-current={isActive ? "true" : undefined}
            aria-label={`Switch to session: ${label}`}
            className={`shrink-0 px-2.5 py-1 text-[10px] font-medium rounded-md transition-colors ${
              isActive
                ? "bg-[#FFE600]/20 text-[#B8A200] border border-[#FFE600]/30"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
            }`}
            style={{ fontFamily: "var(--font-body)" }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

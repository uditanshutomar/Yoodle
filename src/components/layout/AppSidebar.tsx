"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutGrid,
  DoorOpen,
  Kanban,
  MessageCircle,
  Activity,
  ChevronDown,
  Check,
} from "lucide-react";
import { YoodleMascotSmall } from "../YoodleMascot";
import { useTotalUnread } from "@/hooks/useTotalUnread";
import { useWorkspaces } from "@/hooks/useWorkspaces";

const navItems = [
  { label: "The Desk", href: "/dashboard", icon: LayoutGrid },
  { label: "Rooms", href: "/meetings", icon: DoorOpen },
  { label: "The Board", href: "/board", icon: Kanban },
  { label: "Chatter", href: "/messages", icon: MessageCircle },
  { label: "Pulse", href: "/analytics", icon: Activity },
];

interface AppSidebarProps {
  mobile?: boolean;
}

export default function AppSidebar({ mobile }: AppSidebarProps) {
  const pathname = usePathname();
  const { totalUnread } = useTotalUnread();
  const { workspaces, fetchWorkspaces } = useWorkspaces();
  const [wsOpen, setWsOpen] = useState(false);
  const [selectedWsId, setSelectedWsId] = useState<string | null>(null);
  const wsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchWorkspaces().catch(() => {});
  }, [fetchWorkspaces]);

  // Derive selected workspace: use explicit selection if valid, otherwise first workspace
  const selectedWs = selectedWsId && workspaces.some((w) => w._id === selectedWsId)
    ? selectedWsId
    : workspaces[0]?._id ?? null;

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wsRef.current && !wsRef.current.contains(e.target as Node)) {
        setWsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const currentWs = workspaces.find((w) => w._id === selectedWs) ?? null;

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  const sidebarContent = (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b-2 border-[var(--border)]">
        <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-[#FFE600] border-2 border-[var(--border-strong)]">
          <YoodleMascotSmall className="h-8 w-8 mix-blend-multiply" />
        </span>
        <span
          className="text-2xl font-black tracking-tight text-[var(--text-primary)]"
          style={{
            fontFamily: "var(--font-heading)",
            textShadow: "2px 2px 0 #FFE600",
          }}
        >
          Yoodle
        </span>
      </div>

      {/* Space switcher */}
      <div className="px-3 py-3 border-b-2 border-[var(--border)]" ref={wsRef}>
        <button
          onClick={() => setWsOpen(!wsOpen)}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
        >
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#FFE600]/20 border-2 border-[var(--border-strong)] text-xs font-black text-[var(--text-primary)]"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            {currentWs ? currentWs.name.charAt(0).toUpperCase() : "W"}
          </div>
          <span
            className="flex-1 truncate text-left text-sm font-bold text-[var(--text-primary)]"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            {currentWs?.name || "Workspace"}
          </span>
          <ChevronDown
            size={14}
            className={`text-[var(--text-muted)] transition-transform ${wsOpen ? "rotate-180" : ""}`}
          />
        </button>

        {wsOpen && (
          <div className="mt-1 rounded-xl border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[4px_4px_0_var(--border-strong)] overflow-hidden">
            {workspaces.map((ws) => (
              <button
                key={ws._id}
                onClick={() => {
                  setSelectedWsId(ws._id);
                  setWsOpen(false);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[#FFE600]/20 border border-[var(--border)] text-[10px] font-black text-[var(--text-primary)]">
                  {ws.name.charAt(0).toUpperCase()}
                </div>
                <span className="flex-1 truncate text-left font-bold text-[var(--text-primary)]">
                  {ws.name}
                </span>
                {ws._id === selectedWs && (
                  <Check size={14} className="text-[#FFE600]" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1" aria-label="Main navigation">
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all ${
                active
                  ? "bg-[#FFE600]/20 text-[var(--text-primary)] font-bold"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] font-medium"
              }`}
              style={{ fontFamily: "var(--font-heading)" }}
            >
              <item.icon
                size={18}
                className={active ? "text-[var(--text-primary)]" : "text-[var(--text-muted)] group-hover:text-[var(--text-primary)]"}
              />
              {item.label}
              {item.label === "Chatter" && totalUnread > 0 && (
                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-[#FFE600] px-1.5 text-[10px] font-black text-[#0A0A0A] border border-[var(--border-strong)] tabular-nums">
                  {totalUnread > 99 ? "99+" : totalUnread}
                </span>
              )}
              {active && !(item.label === "Chatter" && totalUnread > 0) && (
                <motion.div
                  layoutId="sidebar-active"
                  className="ml-auto h-1.5 w-1.5 rounded-full bg-[#FFE600]"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );

  if (mobile) {
    return sidebarContent;
  }

  return (
    <aside
      className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 h-screen bg-[var(--surface)] border-r-2 border-[var(--border)] sticky top-0"
      role="navigation"
      aria-label="Main navigation"
    >
      {sidebarContent}
    </aside>
  );
}

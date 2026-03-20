"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutGrid,
  DoorOpen,
  Kanban,
  MapPin,
  Calendar,
  MessageCircle,
  Activity,
  Ghost,
  Settings,
  ChevronDown,
  Check,
  Plus,
} from "lucide-react";
import { YoodleMascotSmall } from "../YoodleMascot";
import { useTotalUnread } from "@/hooks/useTotalUnread";
import { useWorkspaces } from "@/hooks/useWorkspaces";

const navItems = [
  { label: "The Desk", href: "/dashboard", icon: LayoutGrid },
  { label: "Rooms", href: "/meetings", icon: DoorOpen },
  { label: "The Board", href: "/board", icon: Kanban },
  { label: "Map", href: "/map", icon: MapPin },
  { label: "Calendar", href: "/calendar", icon: Calendar },
  { label: "Chatter", href: "/messages", icon: MessageCircle },
  { label: "Ghost Rooms", href: "/ghost-rooms", icon: Ghost },
  { label: "Pulse", href: "/analytics", icon: Activity },
];

const bottomNavItems = [
  { label: "Settings", href: "/settings", icon: Settings },
];

interface AppSidebarProps {
  mobile?: boolean;
}

export default function AppSidebar({ mobile }: AppSidebarProps) {
  const pathname = usePathname();
  const { totalUnread } = useTotalUnread();
  const { workspaces, fetchWorkspaces, createWorkspace } = useWorkspaces();
  const [wsOpen, setWsOpen] = useState(false);
  const [selectedWsId, setSelectedWsId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newWsName, setNewWsName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const wsRef = useRef<HTMLDivElement>(null);
  const newWsInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchWorkspaces().catch((err) => console.warn("[AppSidebar] Failed to fetch workspaces:", err));
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

  const handleCreateWorkspace = async () => {
    const name = newWsName.trim();
    if (!name) return;
    setCreateError(null);
    try {
      await createWorkspace(name);
      setNewWsName("");
      setCreating(false);
      setWsOpen(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create");
    }
  };

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
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 hover:bg-[var(--surface-hover)] transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none"
        >
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#FFE600]/20 border-2 border-[var(--border-strong)] text-xs font-black text-[var(--text-primary)] font-heading"
          >
            {currentWs ? currentWs.name.charAt(0).toUpperCase() : "W"}
          </div>
          <span
            className="flex-1 truncate text-left text-sm font-bold text-[var(--text-primary)] font-heading"
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
                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm hover:bg-[var(--surface-hover)] transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none font-heading"
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

            {/* Divider + Create workspace */}
            {workspaces.length > 0 && (
              <div className="border-t border-[var(--border)]" />
            )}

            {creating ? (
              <div className="px-3 py-2 space-y-2">
                <input
                  ref={newWsInputRef}
                  type="text"
                  value={newWsName}
                  onChange={(e) => setNewWsName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateWorkspace();
                    if (e.key === "Escape") { setCreating(false); setNewWsName(""); setCreateError(null); }
                  }}
                  placeholder="Workspace name"
                  autoFocus
                  className="w-full rounded-lg border-2 border-[var(--border-strong)] bg-[var(--background)] px-2.5 py-1.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] font-body focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none"
                />
                {createError && (
                  <p className="text-[10px] text-[#FF6B6B] font-body">{createError}</p>
                )}
                <div className="flex gap-1.5">
                  <button
                    onClick={handleCreateWorkspace}
                    disabled={!newWsName.trim()}
                    className="flex-1 rounded-lg bg-[#FFE600] px-2 py-1 text-xs font-bold text-[#0A0A0A] disabled:opacity-40 cursor-pointer hover:opacity-90 transition-opacity focus-visible:ring-2 focus-visible:ring-[var(--text-primary)] focus-visible:outline-none font-heading"
                  >
                    Create
                  </button>
                  <button
                    onClick={() => { setCreating(false); setNewWsName(""); setCreateError(null); }}
                    className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs font-bold text-[var(--text-secondary)] cursor-pointer hover:bg-[var(--surface-hover)] transition-colors focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none font-heading"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => { setCreating(true); setCreateError(null); }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm hover:bg-[var(--surface-hover)] transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none font-heading"
              >
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-[var(--border-strong)] text-[var(--text-muted)]">
                  <Plus size={12} />
                </div>
                <span className="text-left font-bold text-[var(--text-secondary)]">
                  New workspace
                </span>
              </button>
            )}
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
              className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none ${
                active
                  ? "bg-[#FFE600]/20 text-[var(--text-primary)] font-bold"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] font-medium"
              } font-heading`}
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

      {/* Bottom Navigation */}
      <div className="px-3 pb-4 pt-2 border-t-2 border-[var(--border)] space-y-1">
        {bottomNavItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none ${
                active
                  ? "bg-[#FFE600]/20 text-[var(--text-primary)] font-bold"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] font-medium"
              } font-heading`}
            >
              <item.icon
                size={18}
                className={active ? "text-[var(--text-primary)]" : "text-[var(--text-muted)] group-hover:text-[var(--text-primary)]"}
              />
              {item.label}
              {active && (
                <motion.div
                  layoutId="sidebar-active"
                  className="ml-auto h-1.5 w-1.5 rounded-full bg-[#FFE600]"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );

  if (mobile) {
    return sidebarContent;
  }

  return (
    <aside
      className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 h-screen bg-[var(--surface)] border-r-2 border-[var(--border)] sticky top-0"
      aria-label="Application sidebar"
    >
      {sidebarContent}
    </aside>
  );
}

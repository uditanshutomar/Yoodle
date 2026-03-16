"use client";

import { motion } from "framer-motion";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  Video,
  MessageSquare,
  Settings,
  LogOut,
} from "lucide-react";
import { YoodleMascotSmall } from "../YoodleMascot";
import Avatar from "../ui/Avatar";
import { useAuth } from "@/hooks/useAuth";
import { useTotalUnread } from "@/hooks/useTotalUnread";

const navItems = [
  { label: "Home", href: "/dashboard", icon: LayoutDashboard },
  { label: "Meetings", href: "/meetings", icon: Video },
  { label: "Messages", href: "/messages", icon: MessageSquare },
  { label: "Settings", href: "/settings", icon: Settings },
];

export default function AppSidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { totalUnread } = useTotalUnread();

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
              {item.label === "Messages" && totalUnread > 0 && (
                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-[#FFE600] px-1.5 text-[10px] font-black text-[#0A0A0A] border border-[#0A0A0A] tabular-nums">
                  {totalUnread > 99 ? "99+" : totalUnread}
                </span>
              )}
              {active && !(item.label === "Messages" && totalUnread > 0) && (
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

      {/* User section */}
      <div className="border-t-2 border-[var(--border)] px-4 py-4">
        <div className="flex items-center gap-3">
          <Avatar
            src={user?.avatar}
            name={user?.name || "User"}
            size="sm"
            status="online"
          />
          <div className="flex-1 min-w-0">
            <p
              className="text-sm font-bold text-[var(--text-primary)] truncate"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              {user?.name || "Loading..."}
            </p>
            <p
              className="text-xs text-[var(--text-secondary)] truncate"
              style={{ fontFamily: "var(--font-body)" }}
            >
              {user?.displayName ? `@${user.displayName}` : ""}
            </p>
          </div>
          <button
            onClick={logout}
            className="rounded-lg p-1.5 text-[var(--text-muted)] hover:text-[#FF6B6B] hover:bg-[#FF6B6B]/10 transition-colors cursor-pointer"
            title="Log out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </div>
  );

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

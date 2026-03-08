"use client";

import { motion, AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  Video,
  Ghost,
  Terminal,
  Sparkles,
  Settings,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { useState } from "react";
import { YoodleMascotSmall } from "../YoodleMascot";
import Avatar from "../ui/Avatar";
import { useAuth } from "@/hooks/useAuth";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Meetings", href: "/meetings", icon: Video },
  { label: "Ghost Rooms", href: "/ghost-rooms", icon: Ghost },
  { label: "Workspaces", href: "/workspaces", icon: Terminal },
  { label: "AI Assistant", href: "/ai", icon: Sparkles },
  { label: "Settings", href: "/settings", icon: Settings },
];

export default function AppSidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  const sidebarContent = (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b-2 border-[#0A0A0A]/10">
        <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-[#FFE600] border-2 border-[#0A0A0A]">
          <YoodleMascotSmall className="h-8 w-8 mix-blend-multiply" />
        </span>
        <span
          className="text-2xl font-black tracking-tight text-[#0A0A0A]"
          style={{
            fontFamily: "var(--font-heading)",
            textShadow: "2px 2px 0 #FFE600",
          }}
        >
          Yoodle
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all ${
                active
                  ? "bg-[#FFE600]/20 text-[#0A0A0A] font-bold"
                  : "text-[#0A0A0A]/60 hover:bg-[#0A0A0A]/5 hover:text-[#0A0A0A] font-medium"
              }`}
              style={{ fontFamily: "var(--font-heading)" }}
            >
              <item.icon
                size={18}
                className={active ? "text-[#0A0A0A]" : "text-[#0A0A0A]/40 group-hover:text-[#0A0A0A]"}
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
      </nav>

      {/* User section */}
      <div className="border-t-2 border-[#0A0A0A]/10 px-4 py-4">
        <div className="flex items-center gap-3">
          <Avatar
            src={user?.avatar}
            name={user?.name || "User"}
            size="sm"
            status="online"
          />
          <div className="flex-1 min-w-0">
            <p
              className="text-sm font-bold text-[#0A0A0A] truncate"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              {user?.name || "Loading..."}
            </p>
            <p
              className="text-xs text-[#0A0A0A]/50 truncate"
              style={{ fontFamily: "var(--font-body)" }}
            >
              {user?.displayName ? `@${user.displayName}` : ""}
            </p>
          </div>
          <button
            onClick={logout}
            className="rounded-lg p-1.5 text-[#0A0A0A]/40 hover:text-[#FF6B6B] hover:bg-[#FF6B6B]/10 transition-colors cursor-pointer"
            title="Log out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 left-4 z-50 flex h-10 w-10 items-center justify-center rounded-xl bg-white border-2 border-[#0A0A0A] shadow-[3px_3px_0_#0A0A0A] lg:hidden cursor-pointer"
      >
        <Menu size={18} />
      </button>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 h-screen bg-white border-r-2 border-[#0A0A0A]/10 sticky top-0">
        {sidebarContent}
      </aside>

      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-50 bg-black/40 lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              className="fixed left-0 top-0 z-50 h-full w-72 bg-white border-r-2 border-[#0A0A0A] shadow-[6px_0_0_#0A0A0A] lg:hidden"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
              <button
                onClick={() => setMobileOpen(false)}
                className="absolute top-4 right-4 rounded-lg p-1.5 text-[#0A0A0A]/60 hover:text-[#0A0A0A] transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
              {sidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

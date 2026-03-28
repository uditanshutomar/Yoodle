"use client";

import { Search, ChevronDown, LogOut, Settings, User, Menu, X } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import Avatar from "../ui/Avatar";
import { useAuth } from "@/hooks/useAuth";
import CommandPalette from "./CommandPalette";
import NotificationBell from "./NotificationBell";

interface AppTopbarProps {
  onMenuToggle?: () => void;
  menuOpen?: boolean;
}

export default function AppTopbar({ onMenuToggle, menuOpen }: AppTopbarProps) {
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-4 border-b-2 border-[var(--border)] bg-[var(--background)]/80 backdrop-blur-xl px-4 lg:px-6">
      {/* Left: Hamburger (mobile) + Search */}
      <div className="flex flex-1 items-center gap-3 max-w-md">
        <button
          onClick={onMenuToggle}
          className="rounded-xl p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer lg:hidden"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <CommandPalette />
        <button
          onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, ctrlKey: true, bubbles: true, cancelable: true }))}
          className="flex items-center gap-2 rounded-xl border-2 border-[var(--border)] bg-[var(--surface)] py-2 px-3 text-[var(--text-muted)] cursor-pointer hover:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none transition-colors"
          aria-label="Open search (⌘K)"
        >
          <Search size={16} aria-hidden="true" />
          <span className="hidden text-sm sm:inline font-body">Search</span>
          <kbd className="ml-auto rounded-md border border-[var(--border)] bg-[var(--surface-hover)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--text-muted)] font-heading">⌘&nbsp;K</kbd>
        </button>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-3">
        <NotificationBell />
        {/* User dropdown */}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button className="flex items-center gap-2 rounded-xl py-1 px-2 hover:bg-[var(--surface-hover)] transition-colors cursor-pointer" aria-label="User menu">
              <Avatar
                src={user?.avatar}
                name={user?.name || "User"}
                size="sm"
                status={user?.mode === "lockin" ? "dnd" : user?.mode === "invisible" ? "offline" : "online"}
              />
              <span
                className="hidden text-sm font-bold text-[var(--text-primary)] sm:block font-heading"
              >
                {user?.name || "User"}
              </span>
              <ChevronDown size={14} className="text-[var(--text-muted)]" />
            </button>
          </DropdownMenu.Trigger>

          <AnimatePresence>
            <DropdownMenu.Portal>
              <DropdownMenu.Content asChild sideOffset={8} align="end">
                <motion.div
                  className="z-50 min-w-[200px] bg-[var(--surface)] border-2 border-[var(--border-strong)] rounded-xl shadow-[var(--shadow-card)] p-1.5"
                  initial={{ opacity: 0, y: -5, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -5, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                >
                  <div className="px-3 py-2 border-b border-[var(--border)] mb-1">
                    <p
                      className="text-sm font-bold text-[var(--text-primary)] font-heading"
                    >
                      {user?.name || "User"}
                    </p>
                    <p
                      className="text-xs text-[var(--text-secondary)] font-body"
                    >
                      {user?.email || ""}
                    </p>
                  </div>

                  <DropdownMenu.Item asChild>
                    <Link
                      href="/settings#profile"
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors cursor-pointer outline-none font-heading"
                    >
                      <User size={14} />
                      Profile
                    </Link>
                  </DropdownMenu.Item>

                  <DropdownMenu.Item asChild>
                    <Link
                      href="/settings"
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors cursor-pointer outline-none font-heading"
                    >
                      <Settings size={14} />
                      Preferences
                    </Link>
                  </DropdownMenu.Item>

                  <DropdownMenu.Separator className="my-1 h-px bg-[var(--border)]" />

                  <DropdownMenu.Item
                    onSelect={logout}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[#FF6B6B] hover:bg-[#FF6B6B]/10 transition-colors cursor-pointer outline-none font-heading"
                  >
                    <LogOut size={14} />
                    Log out
                  </DropdownMenu.Item>
                </motion.div>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </AnimatePresence>
        </DropdownMenu.Root>
      </div>
    </header>
  );
}

"use client";

import { useState } from "react";
import { Search, Bell, Plus, ChevronDown, LogOut, Settings, User } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import Avatar from "../ui/Avatar";
import Button from "../ui/Button";
import { useAuth } from "@/hooks/useAuth";

export default function AppTopbar() {
  const { user, logout } = useAuth();
  const [searchValue, setSearchValue] = useState("");

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-4 border-b-2 border-[#0A0A0A]/10 bg-[#FAFAF8]/80 backdrop-blur-xl px-4 lg:px-6">
      {/* Left: Search - offset on mobile for hamburger */}
      <div className="flex-1 max-w-md ml-12 lg:ml-0">
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#0A0A0A]/40"
          />
          <input
            type="text"
            placeholder="Search meetings, people, notes..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className="w-full rounded-xl border-2 border-[#0A0A0A]/15 bg-white py-2 pl-9 pr-4 text-sm text-[#0A0A0A] placeholder:text-[#0A0A0A]/40 focus:border-[#0A0A0A] focus:outline-none focus:ring-2 focus:ring-[#FFE600] transition-all"
            style={{ fontFamily: "var(--font-body)" }}
          />
        </div>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-3">
        {/* New Meeting button */}
        <Button
          variant="primary"
          size="sm"
          icon={Plus}
          href="/meetings/new"
          className="hidden sm:inline-flex"
        >
          New Meeting
        </Button>

        {/* Notifications */}
        <button
          className="relative rounded-xl p-2 text-[#0A0A0A]/60 hover:text-[#0A0A0A] hover:bg-[#0A0A0A]/5 transition-colors cursor-pointer"
          aria-label="Notifications"
        >
          <Bell size={18} />
        </button>

        {/* User dropdown */}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button className="flex items-center gap-2 rounded-xl py-1 px-2 hover:bg-[#0A0A0A]/5 transition-colors cursor-pointer">
              <Avatar
                src={user?.avatar}
                name={user?.name || "User"}
                size="sm"
                status="online"
              />
              <span
                className="hidden text-sm font-bold text-[#0A0A0A] sm:block"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                {user?.name || "User"}
              </span>
              <ChevronDown size={14} className="text-[#0A0A0A]/40" />
            </button>
          </DropdownMenu.Trigger>

          <AnimatePresence>
            <DropdownMenu.Portal>
              <DropdownMenu.Content asChild sideOffset={8} align="end">
                <motion.div
                  className="z-50 min-w-[200px] bg-white border-2 border-[#0A0A0A] rounded-xl shadow-[4px_4px_0_#0A0A0A] p-1.5"
                  initial={{ opacity: 0, y: -5, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -5, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                >
                  <div className="px-3 py-2 border-b border-[#0A0A0A]/10 mb-1">
                    <p
                      className="text-sm font-bold text-[#0A0A0A]"
                      style={{ fontFamily: "var(--font-heading)" }}
                    >
                      {user?.name || "User"}
                    </p>
                    <p
                      className="text-xs text-[#0A0A0A]/50"
                      style={{ fontFamily: "var(--font-body)" }}
                    >
                      {user?.email || ""}
                    </p>
                  </div>

                  <DropdownMenu.Item asChild>
                    <Link
                      href="/settings"
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[#0A0A0A]/70 hover:bg-[#0A0A0A]/5 hover:text-[#0A0A0A] transition-colors cursor-pointer outline-none"
                      style={{ fontFamily: "var(--font-heading)" }}
                    >
                      <User size={14} />
                      Profile
                    </Link>
                  </DropdownMenu.Item>

                  <DropdownMenu.Item asChild>
                    <Link
                      href="/settings"
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[#0A0A0A]/70 hover:bg-[#0A0A0A]/5 hover:text-[#0A0A0A] transition-colors cursor-pointer outline-none"
                      style={{ fontFamily: "var(--font-heading)" }}
                    >
                      <Settings size={14} />
                      Settings
                    </Link>
                  </DropdownMenu.Item>

                  <DropdownMenu.Separator className="my-1 h-px bg-[#0A0A0A]/10" />

                  <DropdownMenu.Item
                    onSelect={logout}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[#FF6B6B] hover:bg-[#FF6B6B]/10 transition-colors cursor-pointer outline-none"
                    style={{ fontFamily: "var(--font-heading)" }}
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

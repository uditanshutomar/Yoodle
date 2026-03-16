"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { LayoutDashboard, Video, MessageSquare, Settings } from "lucide-react";
import { useTotalUnread } from "@/hooks/useTotalUnread";

const tabs = [
  { label: "Home", href: "/dashboard", icon: LayoutDashboard },
  { label: "Meetings", href: "/meetings", icon: Video },
  { label: "Messages", href: "/messages", icon: MessageSquare },
  { label: "Settings", href: "/settings", icon: Settings },
];

export default function MobileTabBar() {
  const pathname = usePathname();
  const { totalUnread } = useTotalUnread();

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  // Hide on active meeting/ghost-room call pages
  if (pathname.match(/^\/meetings\/[^/]+$/) || pathname.match(/^\/ghost-rooms\/[^/]+$/)) {
    return null;
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t-2 border-[var(--border)] bg-[var(--surface)] px-2 py-1 pb-[env(safe-area-inset-bottom)] lg:hidden">
      {tabs.map((tab) => {
        const active = isActive(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`relative flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors ${
              active
                ? "text-[var(--text-primary)]"
                : "text-[var(--text-muted)]"
            }`}
          >
            {active && (
              <div className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-full bg-[#FFE600]" />
            )}
            <div className="relative">
              <tab.icon size={20} />
              {tab.label === "Messages" && totalUnread > 0 && (
                <span className="absolute -top-1 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#FFE600] px-1 text-[9px] font-black text-[#0A0A0A] border border-[#0A0A0A]">
                  {totalUnread > 99 ? "99+" : totalUnread}
                </span>
              )}
            </div>
            <span
              className={`text-[10px] font-bold ${active ? "text-[var(--text-primary)]" : ""}`}
              style={{ fontFamily: "var(--font-heading)" }}
            >
              {tab.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

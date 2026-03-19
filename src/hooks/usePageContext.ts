"use client";

import { usePathname } from "next/navigation";

export type PageContext =
  | "dashboard"
  | "meeting"
  | "board"
  | "messages"
  | "settings"
  | "unknown";

interface PageContextResult {
  context: PageContext;
  entityId?: string;
}

export function usePageContext(): PageContextResult {
  const pathname = usePathname();

  if (!pathname) return { context: "unknown" };

  if (pathname === "/dashboard" || pathname === "/") {
    return { context: "dashboard" };
  }

  const meetingMatch = pathname.match(/\/meetings?\/([a-zA-Z0-9_-]+)/);
  if (meetingMatch) {
    return { context: "meeting", entityId: meetingMatch[1] };
  }

  if (pathname.includes("/board") || pathname.includes("/tasks")) {
    const boardMatch = pathname.match(/\/boards?\/([a-zA-Z0-9_-]+)/);
    return { context: "board", entityId: boardMatch?.[1] };
  }

  if (pathname.includes("/messages") || pathname.includes("/conversations")) {
    const convMatch = pathname.match(
      /\/(?:messages|conversations)\/([a-zA-Z0-9_-]+)/
    );
    return { context: "messages", entityId: convMatch?.[1] };
  }

  if (pathname.includes("/settings")) {
    return { context: "settings" };
  }

  return { context: "unknown" };
}

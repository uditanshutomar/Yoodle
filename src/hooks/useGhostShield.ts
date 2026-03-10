"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * useGhostShield — Client-side content protection for Ghost Rooms.
 *
 * Blocks common screenshot / copy / print shortcuts, disables context menu,
 * and tracks page visibility so the UI can blur content when the tab
 * is not focused (prevents preview in task-switcher).
 *
 * Returns `{ isHidden }` — true when the page is not visible.
 */
export function useGhostShield(): { isHidden: boolean } {
  const [isHidden, setIsHidden] = useState(false);

  // ── Block context menu (right-click) ───────────────────────────────
  const handleContextMenu = useCallback((e: MouseEvent) => {
    e.preventDefault();
  }, []);

  // ── Block keyboard shortcuts ───────────────────────────────────────
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const ctrl = e.ctrlKey || e.metaKey;

    // PrintScreen
    if (e.key === "PrintScreen") {
      e.preventDefault();
      return;
    }

    // Ctrl/Cmd shortcuts
    if (ctrl) {
      const key = e.key.toLowerCase();

      // Copy, Save, Print, View Source
      if (["c", "s", "p", "u"].includes(key)) {
        e.preventDefault();
        return;
      }

      // DevTools: Ctrl+Shift+I / Ctrl+Shift+J / Ctrl+Shift+C
      if (e.shiftKey && ["i", "j", "c"].includes(key)) {
        e.preventDefault();
        return;
      }
    }

    // F12 — DevTools
    if (e.key === "F12") {
      e.preventDefault();
      return;
    }
  }, []);

  // ── Visibility change — blur when tab hidden ───────────────────────
  const handleVisibilityChange = useCallback(() => {
    setIsHidden(document.hidden);
  }, []);

  // ── Block drag events on the page ─────────────────────────────────
  const handleDragStart = useCallback((e: DragEvent) => {
    e.preventDefault();
  }, []);

  useEffect(() => {
    // Attach listeners
    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("dragstart", handleDragStart);

    // Inject print-blocking stylesheet
    const printStyle = document.createElement("style");
    printStyle.id = "ghost-shield-print";
    printStyle.textContent = `
      @media print {
        body * { visibility: hidden !important; }
        body::after {
          content: "Ghost Room content cannot be printed.";
          visibility: visible !important;
          position: fixed;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          font-weight: bold;
          color: #7C3AED;
        }
      }
    `;
    document.head.appendChild(printStyle);

    return () => {
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("dragstart", handleDragStart);
      printStyle.remove();
    };
  }, [handleContextMenu, handleKeyDown, handleVisibilityChange, handleDragStart]);

  return { isHidden };
}

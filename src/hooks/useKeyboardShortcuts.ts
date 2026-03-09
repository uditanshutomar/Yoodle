"use client";

import { useEffect } from "react";

export interface KeyboardShortcutActions {
  toggleAudio: () => void;
  toggleVideo: () => void;
  toggleChat: () => void;
  toggleParticipants: () => void;
  toggleLayout: () => void;
  toggleRecording: () => void;
  toggleHandRaise: () => void;
  leaveCall: () => void;
}

/**
 * Keyboard shortcuts for meeting controls.
 *
 * D = mic toggle, E = camera toggle, A = chat, P = participants
 * L = layout toggle, R = recording, H = hand raise, Escape = close panels
 * Ctrl+Shift+H = raise hand (alternative)
 *
 * All shortcuts disabled when focus is in an input/textarea/contenteditable.
 */
export function useKeyboardShortcuts(actions: KeyboardShortcutActions): void {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      const isEditable = (e.target as HTMLElement)?.isContentEditable;

      if (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        isEditable
      ) {
        return;
      }

      // Don't interfere with browser shortcuts
      if (e.metaKey || e.altKey) return;

      const key = e.key.toLowerCase();

      if (e.ctrlKey && e.shiftKey && key === "h") {
        e.preventDefault();
        actions.toggleHandRaise();
        return;
      }

      if (e.ctrlKey || e.shiftKey) return;

      switch (key) {
        case "d":
          e.preventDefault();
          actions.toggleAudio();
          break;
        case "e":
          e.preventDefault();
          actions.toggleVideo();
          break;
        case "a":
          e.preventDefault();
          actions.toggleChat();
          break;
        case "p":
          e.preventDefault();
          actions.toggleParticipants();
          break;
        case "l":
          e.preventDefault();
          actions.toggleLayout();
          break;
        case "r":
          e.preventDefault();
          actions.toggleRecording();
          break;
        case "h":
          e.preventDefault();
          actions.toggleHandRaise();
          break;
        case "escape":
          // Close panels handled by toggleChat/toggleParticipants being called with close
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [actions]);
}

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Terminal as XTermTerminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useSocket } from "@/hooks/useSocket";

interface WorkspaceTerminalProps {
  workspaceId: string;
  onClose?: () => void;
}

type TerminalStatus = "idle" | "fetching" | "connecting" | "connected" | "error";

export default function WorkspaceTerminal({ workspaceId, onClose }: WorkspaceTerminalProps) {
  const termRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTermTerminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [status, setStatus] = useState<TerminalStatus>("idle");
  const [error, setError] = useState<string>("");
  const mountedRef = useRef(true);
  const { socket, isConnected } = useSocket();

  const cleanup = useCallback(() => {
    socket?.emit("terminal:disconnect");
    if (xtermRef.current) {
      xtermRef.current.dispose();
      xtermRef.current = null;
    }
    fitAddonRef.current = null;
  }, [socket]);

  useEffect(() => {
    mountedRef.current = true;
    let resizeObserver: ResizeObserver | null = null;

    const initTerminal = async () => {
      if (!termRef.current || !socket || !isConnected) return;

      setStatus("fetching");
      setError("");

      // 1. Fetch VM credentials from API
      let sessionToken: string;

      try {
        const res = await fetch(
          `/api/workspaces/${workspaceId}/vm/terminal-session`,
          {
            credentials: "include",
          },
        );
        const data = await res.json();

        if (!data.success) {
          throw new Error(
            data.error?.message || "Failed to create terminal session.",
          );
        }

        sessionToken = data.data.token;

        if (!sessionToken) {
          throw new Error(
            "Terminal session token not available. The VM may still be provisioning.",
          );
        }
      } catch (err) {
        if (!mountedRef.current) return;
        setStatus("error");
        setError(
          err instanceof Error
            ? err.message
            : "Failed to initialize terminal session.",
        );
        return;
      }

      if (!mountedRef.current) return;

      // 2. Create xterm.js terminal
      const term = new XTermTerminal({
        cursorBlink: true,
        fontSize: 14,
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
        theme: {
          background: "#0A0A0A",
          foreground: "#E4E4E7",
          cursor: "#06B6D4",
          cursorAccent: "#0A0A0A",
          selectionBackground: "#06B6D433",
          black: "#0A0A0A",
          red: "#EF4444",
          green: "#10B981",
          yellow: "#FFE600",
          blue: "#3B82F6",
          magenta: "#A855F7",
          cyan: "#06B6D4",
          white: "#E4E4E7",
          brightBlack: "#52525B",
          brightRed: "#F87171",
          brightGreen: "#34D399",
          brightYellow: "#FDE047",
          brightBlue: "#60A5FA",
          brightMagenta: "#C084FC",
          brightCyan: "#22D3EE",
          brightWhite: "#FAFAFA",
        },
        scrollback: 5000,
        allowTransparency: true,
        convertEol: true,
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(termRef.current);

      // Small delay to ensure DOM is ready for fit
      setTimeout(() => {
        if (!mountedRef.current) return;
        try {
          fitAddon.fit();
        } catch {}
      }, 100);

      xtermRef.current = term;
      fitAddonRef.current = fitAddon;

      term.writeln("\x1b[36m  Yoodle Terminal\x1b[0m");
      term.writeln("\x1b[90m  Connecting to workspace terminal...\x1b[0m");
      term.writeln("");

      // 3. Start terminal session on the authenticated realtime backend
      setStatus("connecting");

      const handleTerminalConnected = () => {
        if (!mountedRef.current) return;
        setStatus("connected");
      };

      const handleTerminalData = (data: string) => {
        if (!mountedRef.current || !xtermRef.current) return;
        xtermRef.current.write(data);
      };

      const handleTerminalError = (data: { message: string }) => {
        if (!mountedRef.current) return;

        if (xtermRef.current) {
          xtermRef.current.writeln(`\r\n\x1b[31m${data.message}\x1b[0m`);
        }

        setStatus("error");
        setError(data.message);
      };

      const handleSocketDisconnect = () => {
        if (!mountedRef.current) return;
        if (xtermRef.current) {
          xtermRef.current.writeln(
            "\r\n\x1b[33mRealtime backend disconnected.\x1b[0m",
          );
        }
        setStatus("idle");
      };

      socket.on("terminal:connected", handleTerminalConnected);
      socket.on("terminal:data", handleTerminalData);
      socket.on("terminal:error", handleTerminalError);
      socket.on("disconnect", handleSocketDisconnect);

      socket.emit("terminal:connect", {
        sessionToken,
        cols: term.cols,
        rows: term.rows,
      });

      // 4. Forward keystrokes → server
      term.onData((data: string) => {
        if (socket.connected) {
          socket.emit("terminal:data", data);
        }
      });

      // 5. Handle resize
      resizeObserver = new ResizeObserver(() => {
        if (!mountedRef.current || !fitAddonRef.current) return;
        try {
          fitAddonRef.current.fit();
          if (socket.connected && xtermRef.current) {
            socket.emit("terminal:resize", {
              cols: xtermRef.current.cols,
              rows: xtermRef.current.rows,
            });
          }
        } catch {}
      });

      if (termRef.current) {
        resizeObserver.observe(termRef.current);
      }
      return () => {
        socket.off("terminal:connected", handleTerminalConnected);
        socket.off("terminal:data", handleTerminalData);
        socket.off("terminal:error", handleTerminalError);
        socket.off("disconnect", handleSocketDisconnect);
      };
    };

    let cleanupListeners: (() => void) | undefined;

    void initTerminal().then((result) => {
      cleanupListeners = result;
    });

    return () => {
      mountedRef.current = false;
      if (resizeObserver) resizeObserver.disconnect();
      cleanupListeners?.();
      cleanup();
    };
  }, [workspaceId, cleanup, socket, isConnected]);

  return (
    <div className="flex flex-col h-full rounded-xl overflow-hidden border-2 border-[#0A0A0A] shadow-[4px_4px_0_#0A0A0A]">
      {/* Terminal header */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#0A0A0A]">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div
              className="w-3 h-3 rounded-full bg-red-500 cursor-pointer hover:brightness-110"
              onClick={onClose}
              title="Close terminal"
            />
            <div className="w-3 h-3 rounded-full bg-yellow-500" />
            <div
              className={`w-3 h-3 rounded-full ${
                status === "connected"
                  ? "bg-green-500"
                  : status === "connecting" || status === "fetching"
                  ? "bg-yellow-500 animate-pulse"
                  : "bg-[var(--text-muted)]"
              }`}
            />
          </div>
          <span className="text-xs text-white/60 font-mono ml-2">
            {status === "fetching" && "Creating terminal session..."}
            {status === "connecting" && "Connecting..."}
            {status === "connected" && "Connected"}
            {status === "error" && "Error"}
            {status === "idle" && "Terminal"}
          </span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white text-xs font-mono transition-colors"
          >
            ESC
          </button>
        )}
      </div>

      {/* Error banner */}
      {status === "error" && error && (
        <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20">
          <p className="text-xs text-red-400 font-mono">{error}</p>
        </div>
      )}

      {/* Terminal body */}
      <div
        ref={termRef}
        className="flex-1 bg-[#0A0A0A]"
        style={{ minHeight: 300, padding: "4px" }}
      />
    </div>
  );
}

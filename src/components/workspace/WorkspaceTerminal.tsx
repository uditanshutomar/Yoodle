"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Terminal as XTermTerminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { io, Socket } from "socket.io-client";
import "@xterm/xterm/css/xterm.css";

interface WorkspaceTerminalProps {
  workspaceId: string;
  onClose?: () => void;
}

type TerminalStatus = "idle" | "fetching" | "connecting" | "connected" | "error";

export default function WorkspaceTerminal({ workspaceId, onClose }: WorkspaceTerminalProps) {
  const termRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTermTerminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const [status, setStatus] = useState<TerminalStatus>("idle");
  const [error, setError] = useState<string>("");
  const mountedRef = useRef(true);

  const cleanup = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit("terminal:disconnect");
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    if (xtermRef.current) {
      xtermRef.current.dispose();
      xtermRef.current = null;
    }
    fitAddonRef.current = null;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    let resizeObserver: ResizeObserver | null = null;

    const initTerminal = async () => {
      if (!termRef.current) return;

      setStatus("fetching");
      setError("");

      // 1. Fetch VM credentials from API
      let ip: string;
      let password: string;

      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/vm/credentials`, {
          credentials: "include",
        });
        const data = await res.json();

        if (!data.success) {
          throw new Error(data.error || "Failed to get VM credentials.");
        }

        ip = data.data.ip;
        password = data.data.password;

        if (!ip || !password) {
          throw new Error("VM credentials not available. The VM may still be provisioning.");
        }
      } catch (err) {
        if (!mountedRef.current) return;
        setStatus("error");
        setError(err instanceof Error ? err.message : "Failed to fetch credentials.");
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
      term.writeln(`\x1b[90m  Connecting to ${ip}...\x1b[0m`);
      term.writeln("");

      // 3. Connect to signaling server for SSH proxy
      setStatus("connecting");

      // Always connect to the embedded signaling server (same origin).
      // The standalone server/index.ts is deprecated — all signaling is
      // handled by the custom Next.js server (server.ts) on /api/socketio.
      const socket = io({
        path: "/api/socketio",
        transports: ["websocket", "polling"],
        reconnection: false,
        timeout: 15000,
      });

      socketRef.current = socket;

      socket.on("connect", () => {
        if (!mountedRef.current) return;
        console.log("[Terminal] Socket connected, initiating SSH...");

        socket.emit("terminal:connect", {
          host: ip,
          password,
          cols: term.cols,
          rows: term.rows,
        });
      });

      socket.on("terminal:connected", () => {
        if (!mountedRef.current) return;
        console.log("[Terminal] SSH session established");
        setStatus("connected");
      });

      socket.on("terminal:data", (data: string) => {
        if (!mountedRef.current || !xtermRef.current) return;
        xtermRef.current.write(data);
      });

      socket.on("terminal:error", (data: { message: string }) => {
        if (!mountedRef.current) return;
        console.error("[Terminal] Error:", data.message);

        if (xtermRef.current) {
          xtermRef.current.writeln(`\r\n\x1b[31m${data.message}\x1b[0m`);
        }

        setStatus("error");
        setError(data.message);
      });

      socket.on("connect_error", (err: Error) => {
        if (!mountedRef.current) return;
        console.error("[Terminal] Socket connection error:", err.message);
        setStatus("error");
        setError("Failed to connect to signaling server.");

        if (xtermRef.current) {
          xtermRef.current.writeln(`\r\n\x1b[31mConnection failed: ${err.message}\x1b[0m`);
        }
      });

      socket.on("disconnect", () => {
        if (!mountedRef.current) return;
        if (xtermRef.current) {
          xtermRef.current.writeln("\r\n\x1b[33mDisconnected.\x1b[0m");
        }
        setStatus("idle");
      });

      // 4. Forward keystrokes → server
      term.onData((data: string) => {
        if (socketRef.current?.connected) {
          socketRef.current.emit("terminal:data", data);
        }
      });

      // 5. Handle resize
      resizeObserver = new ResizeObserver(() => {
        if (!mountedRef.current || !fitAddonRef.current) return;
        try {
          fitAddonRef.current.fit();
          if (socketRef.current?.connected && xtermRef.current) {
            socketRef.current.emit("terminal:resize", {
              cols: xtermRef.current.cols,
              rows: xtermRef.current.rows,
            });
          }
        } catch {}
      });

      if (termRef.current) {
        resizeObserver.observe(termRef.current);
      }
    };

    initTerminal();

    return () => {
      mountedRef.current = false;
      if (resizeObserver) resizeObserver.disconnect();
      cleanup();
    };
  }, [workspaceId, cleanup]);

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
                  : "bg-gray-500"
              }`}
            />
          </div>
          <span className="text-xs text-white/60 font-mono ml-2">
            {status === "fetching" && "Fetching credentials..."}
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

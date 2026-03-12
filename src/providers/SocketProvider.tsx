"use client";

import {
  createContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { io, Socket } from "socket.io-client";

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

export interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  connectionStatus: ConnectionStatus;
  reconnect: () => void;
}

export const SocketContext = createContext<SocketContextType | null>(null);

interface SocketProviderProps {
  children: ReactNode;
}

export default function SocketProvider({ children }: SocketProviderProps) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const socketRef = useRef<Socket | null>(null);
  const mountedRef = useRef(true);

  const createSocket = useCallback(async () => {
    // Guard against SSR
    if (typeof window === "undefined") return;

    // Disconnect existing socket if any
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    setConnectionStatus("connecting");

    let session;
    try {
      const res = await fetch("/api/realtime/session", {
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error("Failed to create realtime session.");
      }

      const json = await res.json();
      session = json.data as {
        url: string;
        path: string;
        token: string;
      };
    } catch {
      if (!mountedRef.current) return;
      setConnectionStatus("error");
      setSocket(null);
      return;
    }

    if (!mountedRef.current) return;

    const socketInstance = io(session.url, {
      path: session.path,
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 20000,
      autoConnect: true,
      auth: {
        token: session.token,
      },
    });

    socketInstance.on("connect", () => {
      if (!mountedRef.current) return;
      setConnectionStatus("connected");
      setSocket(socketInstance);
    });

    socketInstance.on("disconnect", () => {
      if (!mountedRef.current) return;
      setConnectionStatus("disconnected");
      setSocket(null);
    });

    socketInstance.on("connect_error", () => {
      if (!mountedRef.current) return;
      setConnectionStatus("error");
    });

    socketInstance.on("reconnect", () => {
      if (!mountedRef.current) return;
      setConnectionStatus("connected");
      // Restore socket state after reconnect (disconnect handler sets it to null)
      setSocket(socketRef.current);
    });

    socketInstance.on("reconnect_attempt", () => {
      if (!mountedRef.current) return;
      setConnectionStatus("connecting");
    });

    socketInstance.on("reconnect_failed", () => {
      if (!mountedRef.current) return;
      setConnectionStatus("error");
    });

    socketRef.current = socketInstance;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    // Defer socket creation to avoid synchronous setState in effect
    const timer = setTimeout(() => {
      void createSocket();
    }, 0);

    return () => {
      clearTimeout(timer);
      mountedRef.current = false;
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reconnect = useCallback(() => {
    void createSocket();
  }, [createSocket]);

  const isConnected = connectionStatus === "connected";

  return (
    <SocketContext.Provider value={{ socket, isConnected, connectionStatus, reconnect }}>
      {children}
    </SocketContext.Provider>
  );
}

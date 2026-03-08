"use client";

import { useContext } from "react";
import { SocketContext, type SocketContextType } from "@/providers/SocketProvider";

/**
 * Access the Socket.io client instance and connection status.
 * Must be used within a SocketProvider.
 */
export function useSocket(): SocketContextType {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error("useSocket must be used within a SocketProvider");
  }
  return context;
}

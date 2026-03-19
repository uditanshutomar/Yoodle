"use client";

import { useEffect, useRef } from "react";

/**
 * A polling hook that coordinates across browser tabs using BroadcastChannel.
 *
 * Only the visible tab performs the actual fetch. After each successful fetch,
 * it broadcasts the result to sibling tabs via BroadcastChannel. Hidden tabs
 * skip polling entirely and receive data from the broadcasting tab.
 *
 * Falls back to regular polling if BroadcastChannel is not supported.
 *
 * @param channelName  Unique name for the BroadcastChannel (e.g. "yoodle:unread-count")
 * @param fetchFn      Async function that fetches the data
 * @param onData       Callback to receive the fetched data (from fetch or broadcast)
 * @param intervalMs   Polling interval in milliseconds
 * @param enabled      Whether polling is active (default true)
 */
export function useBroadcastPoll<T>(
  channelName: string,
  fetchFn: () => Promise<T>,
  onData: (data: T) => void,
  intervalMs: number,
  enabled = true,
): void {
  // Store latest callbacks in refs (updated in effects to satisfy React Compiler)
  const onDataRef = useRef(onData);
  const fetchFnRef = useRef(fetchFn);

  useEffect(() => {
    onDataRef.current = onData;
  }, [onData]);

  useEffect(() => {
    fetchFnRef.current = fetchFn;
  }, [fetchFn]);

  useEffect(() => {
    if (!enabled) return;

    let channel: BroadcastChannel | null = null;
    let disposed = false;

    // Set up BroadcastChannel if supported
    if (typeof BroadcastChannel !== "undefined") {
      try {
        channel = new BroadcastChannel(channelName);
        channel.onmessage = (event: MessageEvent) => {
          if (disposed) return;
          if (event.data?.type === channelName && event.data.payload !== undefined) {
            onDataRef.current(event.data.payload as T);
          }
        };
      } catch {
        channel = null;
      }
    }

    const doPoll = async () => {
      // Skip polling if tab is hidden — a visible tab will broadcast to us
      if (document.visibilityState === "hidden") return;

      try {
        const data = await fetchFnRef.current();
        // Guard: effect may have been cleaned up while fetch was in flight
        if (disposed) return;
        onDataRef.current(data);
        // Broadcast to sibling tabs
        try {
          channel?.postMessage({ type: channelName, payload: data });
        } catch {
          // Channel may have been closed
        }
      } catch {
        // Fetch failed — badge will show stale data until next poll
      }
    };

    // Initial fetch
    doPoll();

    // Set up interval
    const interval = setInterval(doPoll, intervalMs);

    // When tab becomes visible, do an immediate fetch
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        doPoll();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      disposed = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
      try {
        channel?.close();
      } catch {
        // Already closed
      }
    };
  }, [channelName, intervalMs, enabled]);
}

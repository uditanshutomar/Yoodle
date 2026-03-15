"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface GeolocationState {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  loading: boolean;
  error: string | null;
  permissionDenied: boolean;
}

interface UseGeolocationOptions {
  /** Auto-request location on mount (default: false — user must trigger) */
  autoRequest?: boolean;
  /** Sync location to server via PATCH /api/users/me (default: true) */
  syncToServer?: boolean;
  /** Re-sync interval in ms (default: 60_000 = 1 minute) */
  syncInterval?: number;
}

/**
 * Hook to access browser geolocation and optionally sync to the server.
 *
 * - Requests permission on `requestLocation()` or auto-requests if `autoRequest` is true.
 * - Syncs coordinates to the user's profile via PATCH /api/users/me.
 * - Provides reactive lat/lng for the map.
 */
export function useGeolocation(options: UseGeolocationOptions = {}) {
  const { autoRequest = false, syncToServer = true, syncInterval = 60_000 } = options;

  const [state, setState] = useState<GeolocationState>({
    latitude: null,
    longitude: null,
    accuracy: null,
    loading: false,
    error: null,
    permissionDenied: false,
  });

  const watchIdRef = useRef<number | null>(null);
  const lastSyncRef = useRef<number>(0);

  const syncLocationToServer = useCallback(
    async (lng: number, lat: number) => {
      if (!syncToServer) return;
      const now = Date.now();
      if (now - lastSyncRef.current < syncInterval) return; // throttle
      lastSyncRef.current = now;

      try {
        await fetch("/api/users/me", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            location: {
              type: "Point",
              coordinates: [lng, lat],
            },
          }),
        });
      } catch {
        // Best-effort sync
      }
    },
    [syncToServer, syncInterval],
  );

  const startWatching = useCallback(() => {
    if (!navigator.geolocation) {
      setState((s) => ({ ...s, error: "Geolocation not supported", loading: false }));
      return;
    }

    setState((s) => ({ ...s, loading: true, error: null, permissionDenied: false }));

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        setState({
          latitude,
          longitude,
          accuracy,
          loading: false,
          error: null,
          permissionDenied: false,
        });
        syncLocationToServer(longitude, latitude);
      },
      (err) => {
        setState((s) => ({
          ...s,
          loading: false,
          error: err.message,
          permissionDenied: err.code === err.PERMISSION_DENIED,
        }));
      },
      {
        enableHighAccuracy: false,
        timeout: 10_000,
        maximumAge: 30_000,
      },
    );
  }, [syncLocationToServer]);

  const requestLocation = useCallback(() => {
    startWatching();
  }, [startWatching]);

  const stopWatching = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  // Auto-request if enabled
  useEffect(() => {
    if (autoRequest) {
      startWatching();
    }
    return () => {
      stopWatching();
    };
    // Only run on mount — startWatching/stopWatching are stable callbacks
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRequest]);

  return {
    ...state,
    requestLocation,
    stopWatching,
  };
}

"use client";

import { useState, useCallback } from "react";
import { useBroadcastPoll } from "./useBroadcastPoll";

export interface NearbyUser {
  id: string;
  name: string;
  displayName?: string;
  avatarUrl?: string;
  status?: string;
  mode: string;
  location?: {
    label?: string;
    coordinates?: [number, number];
    blurredCoordinates?: [number, number];
    approximate?: boolean;
  };
  distanceKm: number;
}

interface UseNearbyUsersOptions {
  lat: number | null;
  lng: number | null;
  radiusKm?: number;
  mode: string;
  enabled?: boolean;
}

const POLL_INTERVAL = 30_000;

export function useNearbyUsers({
  lat,
  lng,
  radiusKm = 10,
  mode,
  enabled = true,
}: UseNearbyUsersOptions) {
  const [users, setUsers] = useState<NearbyUser[]>([]);
  const [error, setError] = useState<string | null>(null);

  const hasCoords = lat !== null && lng !== null;
  const isNinja = mode === "invisible";
  const shouldPoll = enabled && hasCoords && !isNinja;

  const fetchNearby = useCallback(async (): Promise<NearbyUser[]> => {
    if (!hasCoords) return [];
    const res = await fetch(
      `/api/users/nearby?lat=${lat}&lng=${lng}&radiusKm=${radiusKm}`,
      { credentials: "include" },
    );
    if (!res.ok) throw new Error(`Nearby fetch failed: ${res.status}`);
    const json = await res.json();
    return json.data ?? [];
  }, [lat, lng, radiusKm, hasCoords]);

  const onData = useCallback((data: NearbyUser[]) => {
    setUsers(data);
    setError(null);
  }, []);

  useBroadcastPoll<NearbyUser[]>(
    "yoodle:nearby-users",
    fetchNearby,
    onData,
    POLL_INTERVAL,
    shouldPoll,
  );

  return { users, error, isNinja };
}

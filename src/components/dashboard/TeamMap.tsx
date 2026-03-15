"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import {
  APIProvider,
  Map,
  AdvancedMarker,
  InfoWindow,
  useMap,
} from "@vis.gl/react-google-maps";
import Image from "next/image";
import { useGeolocation } from "@/hooks/useGeolocation";

interface NearbyUser {
  id: string;
  name: string;
  displayName: string;
  avatarUrl?: string;
  status: string;
  mode: string;
  location: {
    coordinates: [number, number]; // [lng, lat]
    label?: string;
  };
  distanceKm: number;
}

interface TeamMapProps {
  /** Whether to actively share location + fetch nearby users */
  active: boolean;
}

const MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

// Dark-themed map style matching Yoodle's aesthetic
const MAP_STYLES = [
  { elementType: "geometry", stylers: [{ color: "#1a1a2e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1a1a2e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8a8a9a" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2a2a3e" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#333348" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e0e1a" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#222236" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#1a2e1a" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#222236" }] },
];

export default function TeamMap({ active }: TeamMapProps) {
  const {
    latitude,
    longitude,
    loading: geoLoading,
    error: geoError,
    permissionDenied,
    requestLocation,
  } = useGeolocation({ autoRequest: active, syncToServer: active });

  const [nearbyUsers, setNearbyUsers] = useState<NearbyUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<NearbyUser | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Fetch nearby users when we have a location
  const fetchNearby = useCallback(async () => {
    if (!latitude || !longitude || !active) return;

    try {
      const res = await fetch(
        `/api/users/nearby?lng=${longitude}&lat=${latitude}&radiusKm=10&limit=20`,
        { credentials: "include" },
      );
      if (res.ok) {
        const json = await res.json();
        setNearbyUsers(json.data || []);
        setFetchError(null);
      }
    } catch {
      setFetchError("Couldn't load nearby teammates");
    }
  }, [latitude, longitude, active]);

  const fetchNearbyRef = useRef(fetchNearby);
  useEffect(() => { fetchNearbyRef.current = fetchNearby; }, [fetchNearby]);

  useEffect(() => {
    void fetchNearbyRef.current();
    if (!active) return;
    const interval = setInterval(() => void fetchNearbyRef.current(), 15_000);
    return () => clearInterval(interval);
  }, [active]);

  // No API key configured
  if (!MAPS_API_KEY) {
    return (
      <div className="rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] p-6 shadow-[5px_5px_0_var(--border-strong)]">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">🗺️</span>
          <h3 className="text-sm font-bold text-[var(--text-primary)]" style={{ fontFamily: "var(--font-heading)" }}>
            Teammate Map
          </h3>
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          Google Maps API key not configured. Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to .env.local.
        </p>
      </div>
    );
  }

  // Not in social mode
  if (!active) {
    return (
      <div className="rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] p-6 shadow-[5px_5px_0_var(--border-strong)]">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">🗺️</span>
          <h3 className="text-sm font-bold text-[var(--text-primary)]" style={{ fontFamily: "var(--font-heading)" }}>
            Teammate Map
          </h3>
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          Switch to <span className="font-bold text-[#7C3AED]">Social mode</span> to see nearby teammates on the map.
        </p>
      </div>
    );
  }

  // Permission denied
  if (permissionDenied) {
    return (
      <div className="rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] p-6 shadow-[5px_5px_0_var(--border-strong)]">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">📍</span>
          <h3 className="text-sm font-bold text-[var(--text-primary)]" style={{ fontFamily: "var(--font-heading)" }}>
            Location Access Needed
          </h3>
        </div>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          Enable location access in your browser settings to see nearby teammates.
        </p>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={requestLocation}
          className="rounded-full bg-[#FFE600] border-2 border-[var(--border-strong)] px-4 py-1.5 text-xs font-bold text-[#0A0A0A] shadow-[2px_2px_0_var(--border-strong)]"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          Try again
        </motion.button>
      </div>
    );
  }

  // Loading location
  if (geoLoading || (!latitude && !geoError)) {
    return (
      <div className="rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] p-6 shadow-[5px_5px_0_var(--border-strong)]">
        <div className="flex items-center gap-2">
          <motion.span
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
            className="text-lg"
          >
            📍
          </motion.span>
          <p className="text-xs text-[var(--text-muted)]">Getting your location...</p>
        </div>
      </div>
    );
  }

  const center = { lat: latitude!, lng: longitude! };

  return (
    <div className="rounded-2xl border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[5px_5px_0_var(--border-strong)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b-2 border-[var(--border-strong)] bg-[#7C3AED]">
        <div className="flex items-center gap-2">
          <span className="text-sm">🗺️</span>
          <h3 className="text-xs font-bold text-white" style={{ fontFamily: "var(--font-heading)" }}>
            Nearby Teammates
          </h3>
        </div>
        <span className="text-[10px] font-medium text-white/70 rounded-full bg-white/15 px-2 py-0.5">
          {nearbyUsers.length} nearby
        </span>
      </div>

      {/* Map */}
      <div className="h-[280px] relative">
        <APIProvider apiKey={MAPS_API_KEY}>
          <Map
            defaultCenter={center}
            defaultZoom={13}
            mapId="yoodle-team-map"
            disableDefaultUI={true}
            zoomControl={true}
            gestureHandling="greedy"
            styles={MAP_STYLES}
            className="w-full h-full"
          >
            {/* Your location marker */}
            <AdvancedMarker position={center}>
              <div className="relative">
                <div className="w-4 h-4 rounded-full bg-[#FFE600] border-2 border-[#0A0A0A] shadow-lg" />
                <div className="absolute inset-0 w-4 h-4 rounded-full bg-[#FFE600] animate-ping opacity-40" />
              </div>
            </AdvancedMarker>

            {/* Nearby teammate markers */}
            {nearbyUsers.map((user) => (
              <TeammateMarker
                key={user.id}
                user={user}
                selected={selectedUser?.id === user.id}
                onSelect={() => setSelectedUser(selectedUser?.id === user.id ? null : user)}
              />
            ))}

            {/* Info window for selected user */}
            {selectedUser && (
              <InfoWindow
                position={{
                  lat: selectedUser.location.coordinates[1],
                  lng: selectedUser.location.coordinates[0],
                }}
                onCloseClick={() => setSelectedUser(null)}
                pixelOffset={[0, -30]}
              >
                <UserInfoCard user={selectedUser} />
              </InfoWindow>
            )}

            <MapAutoCenter center={center} />
          </Map>
        </APIProvider>
      </div>

      {/* Nearby list (compact) */}
      {nearbyUsers.length > 0 && (
        <div className="border-t-2 border-[var(--border-strong)] px-3 py-2 max-h-[120px] overflow-y-auto">
          {nearbyUsers.map((user) => (
            <motion.button
              key={user.id}
              whileHover={{ x: 2 }}
              onClick={() => setSelectedUser(user)}
              className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg hover:bg-[var(--surface-hover)] transition-colors text-left"
            >
              {/* Avatar */}
              <div className="relative flex-shrink-0">
                {user.avatarUrl ? (
                  <Image src={user.avatarUrl!} alt="" width={24} height={24} className="w-6 h-6 rounded-full border border-[var(--border)]" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-[#7C3AED] border border-[var(--border)] flex items-center justify-center text-[10px] font-bold text-white">
                    {user.displayName?.[0] || user.name?.[0] || "?"}
                  </div>
                )}
                {/* Status dot */}
                <div
                  className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-[var(--surface)] ${
                    user.status === "online" ? "bg-emerald-400" : user.status === "dnd" ? "bg-red-400" : "bg-gray-400"
                  }`}
                />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-[var(--text-primary)] truncate">
                  {user.displayName || user.name}
                </p>
              </div>

              <span className="text-[10px] text-[var(--text-muted)] flex-shrink-0">
                {user.distanceKm < 1 ? `${Math.round(user.distanceKm * 1000)}m` : `${user.distanceKm}km`}
              </span>
            </motion.button>
          ))}
        </div>
      )}

      {/* Empty state */}
      {nearbyUsers.length === 0 && !fetchError && (
        <div className="px-4 py-3 text-center">
          <p className="text-xs text-[var(--text-muted)]">
            No teammates nearby right now. They&apos;ll show up when they switch to Social mode!
          </p>
        </div>
      )}
    </div>
  );
}

/* ─── Sub-components ─── */

function TeammateMarker({
  user,
  selected,
  onSelect,
}: {
  user: NearbyUser;
  selected: boolean;
  onSelect: () => void;
}) {
  const position = {
    lat: user.location.coordinates[1],
    lng: user.location.coordinates[0],
  };

  return (
    <AdvancedMarker position={position} onClick={onSelect}>
      <motion.div
        animate={selected ? { scale: 1.2 } : { scale: 1 }}
        className="relative cursor-pointer"
      >
        {user.avatarUrl ? (
          <Image
            src={user.avatarUrl!}
            alt={user.displayName}
            width={32}
            height={32}
            className="w-8 h-8 rounded-full border-2 border-[#7C3AED] shadow-lg"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-[#7C3AED] border-2 border-white shadow-lg flex items-center justify-center text-xs font-bold text-white">
            {user.displayName?.[0] || user.name?.[0] || "?"}
          </div>
        )}
        {/* Status ring */}
        <div
          className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${
            user.status === "online" ? "bg-emerald-400" : user.status === "dnd" ? "bg-red-400" : "bg-gray-400"
          }`}
        />
      </motion.div>
    </AdvancedMarker>
  );
}

function UserInfoCard({ user }: { user: NearbyUser }) {
  return (
    <div className="p-1 min-w-[140px]">
      <div className="flex items-center gap-2">
        {user.avatarUrl ? (
          <Image src={user.avatarUrl!} alt="" width={28} height={28} className="w-7 h-7 rounded-full" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-[#7C3AED] flex items-center justify-center text-xs font-bold text-white">
            {user.displayName?.[0] || "?"}
          </div>
        )}
        <div>
          <p className="text-xs font-bold text-[#0A0A0A]">{user.displayName || user.name}</p>
          <p className="text-[10px] text-gray-500">
            {user.distanceKm < 1 ? `${Math.round(user.distanceKm * 1000)}m away` : `${user.distanceKm}km away`}
          </p>
        </div>
      </div>
      {user.location.label && (
        <p className="text-[10px] text-gray-400 mt-1">📍 {user.location.label}</p>
      )}
    </div>
  );
}

/** Auto-pan map when user's location changes */
function MapAutoCenter({ center }: { center: { lat: number; lng: number } }) {
  const map = useMap();
  const hasCentered = useRef(false);

  useEffect(() => {
    if (map && !hasCentered.current) {
      map.panTo(center);
      hasCentered.current = true;
    }
  }, [map, center]);

  return null;
}

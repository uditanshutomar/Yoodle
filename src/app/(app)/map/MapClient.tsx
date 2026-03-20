"use client";

import { useState, useCallback } from "react";
import { AnimatePresence } from "framer-motion";
import Image from "next/image";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useUserMode } from "@/hooks/useUserMode";
import { useNearbyUsers, type NearbyUser } from "@/hooks/useNearbyUsers";
import GoogleMapView from "@/components/map/GoogleMapView";
import UserPin from "@/components/map/UserPin";
import HoverCard from "@/components/map/HoverCard";
import ModeSwitcher from "@/components/map/ModeSwitcher";
import MapEmptyState from "@/components/map/MapEmptyState";
import { MASCOT_BY_MODE } from "@/components/ai/constants";

export default function MapClient() {
  const geo = useGeolocation({ autoRequest: true });
  const { mode, switchMode } = useUserMode();
  const { users } = useNearbyUsers({ lat: geo.latitude, lng: geo.longitude, mode });
  const [selectedUser, setSelectedUser] = useState<NearbyUser | null>(null);
  const [userStatus, setUserStatus] = useState<string>("");

  const hasLocation = !geo.loading && !geo.error && geo.latitude !== null && geo.longitude !== null;

  const handlePinClick = useCallback((user: NearbyUser) => {
    setSelectedUser((prev) => (prev?.id === user.id ? null : user));
  }, []);

  const handleStatusChange = useCallback(async (newStatus: string) => {
    setUserStatus(newStatus);
    try {
      await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: newStatus }),
      });
    } catch {
      // Best effort
    }
  }, []);

  return (
    <div className="relative -mx-4 -my-6 lg:-mx-8" style={{ height: "calc(100vh - 64px)" }}>
      <div className="absolute inset-0 bg-[#1a1a2e]">
        {/* Loading state */}
        {geo.loading && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center space-y-3">
              <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[#FFE600] border-t-transparent" />
              <p className="text-sm text-[var(--text-muted)] font-body">Getting your location...</p>
            </div>
          </div>
        )}

        {/* Error / permission denied */}
        {geo.error && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center space-y-4 p-6 rounded-xl border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[4px_4px_0_var(--border-strong)]">
              <Image
                src={MASCOT_BY_MODE[mode]}
                alt="Yoodle mascot"
                width={64}
                height={64}
                className="mx-auto mix-blend-multiply"
              />
              <p className="text-sm text-[var(--text-secondary)] font-body">{geo.error}</p>
              <button
                onClick={geo.requestLocation}
                className="rounded-xl border-2 border-[var(--border-strong)] bg-[#FFE600] px-4 py-2 text-sm font-bold text-[#0A0A0A] shadow-[4px_4px_0_var(--border-strong)] hover:shadow-[2px_2px_0_var(--border-strong)] active:shadow-none transition-shadow font-heading cursor-pointer"
              >
                Enable Location
              </button>
            </div>
          </div>
        )}

        {/* Map with pins */}
        {hasLocation && (
          <GoogleMapView lat={geo.latitude!} lng={geo.longitude!}>
            {/* Current user pin */}
            <UserPin
              user={{
                id: "self",
                name: "You",
                mode,
                distanceKm: 0,
                location: { coordinates: [geo.longitude!, geo.latitude!] },
              }}
              isCurrentUser
            />

            {/* Nearby user pins */}
            {users.map((user) => (
              <UserPin
                key={user.id}
                user={user}
                onClick={handlePinClick}
              />
            ))}
          </GoogleMapView>
        )}

        {/* Empty state when no nearby users */}
        {hasLocation && users.length === 0 && mode !== "invisible" && (
          <MapEmptyState mode={mode} />
        )}

        {/* Selected user hover card */}
        <AnimatePresence>
          {selectedUser && (
            <div
              className="absolute top-4 right-4 z-20"
              key={selectedUser.id}
            >
              <HoverCard
                user={selectedUser}
                onClose={() => setSelectedUser(null)}
              />
            </div>
          )}
        </AnimatePresence>

        {/* Mode switcher — bottom left */}
        <div className="absolute bottom-6 left-6 z-20">
          <ModeSwitcher
            mode={mode}
            onModeChange={switchMode}
            status={userStatus}
            onStatusChange={handleStatusChange}
          />
        </div>

        {/* User count badge — top left */}
        {hasLocation && (
          <div className="absolute top-4 left-4 z-10 rounded-lg border-2 border-[var(--border-strong)] bg-[var(--surface)] px-3 py-1.5 shadow-[3px_3px_0_var(--border-strong)]">
            <span className="text-xs font-bold text-[var(--text-primary)] font-heading">
              {users.length} {users.length === 1 ? "person" : "people"} nearby
            </span>
          </div>
        )}

        {/* Ninja mode overlay hint */}
        <AnimatePresence>
          {mode === "invisible" && hasLocation && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 rounded-lg border-2 border-[var(--border-strong)] bg-[var(--surface)]/90 backdrop-blur-sm px-4 py-2 shadow-[3px_3px_0_var(--border-strong)]">
              <span className="text-xs font-bold text-[var(--text-secondary)] font-heading">
                🥷 Ninja Mode — You&apos;re invisible to everyone
              </span>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

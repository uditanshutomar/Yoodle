"use client";

import { useGeolocation } from "@/hooks/useGeolocation";
import { useUserMode } from "@/hooks/useUserMode";
import { useNearbyUsers } from "@/hooks/useNearbyUsers";

export default function MapClient() {
  const { latitude, longitude, loading: geoLoading, error: geoError, requestLocation } = useGeolocation({ autoRequest: true });
  const { mode, mascot, switchMode, loading: modeLoading } = useUserMode();
  const { users } = useNearbyUsers({ lat: latitude, lng: longitude, mode });

  return (
    <div className="relative -mx-4 -my-6 lg:-mx-8" style={{ height: "calc(100vh - 64px)" }}>
      <div className="absolute inset-0 bg-[#1a1a2e]">
        {geoLoading && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center space-y-3">
              <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[#FFE600] border-t-transparent" />
              <p className="text-sm text-[var(--text-muted)] font-body">Getting your location...</p>
            </div>
          </div>
        )}

        {geoError && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center space-y-4 p-6 rounded-xl border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[4px_4px_0_var(--border-strong)]">
              <p className="text-sm text-[var(--text-secondary)] font-body">{geoError}</p>
              <button
                onClick={requestLocation}
                className="rounded-xl border-2 border-[var(--border-strong)] bg-[#FFE600] px-4 py-2 text-sm font-bold text-[#0A0A0A] shadow-[4px_4px_0_var(--border-strong)] hover:shadow-[2px_2px_0_var(--border-strong)] active:shadow-none transition-shadow font-heading cursor-pointer"
              >
                Enable Location
              </button>
            </div>
          </div>
        )}

        {!geoLoading && !geoError && latitude && longitude && (
          <p className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
            Map loading... ({users.length} users nearby)
          </p>
        )}
      </div>
    </div>
  );
}

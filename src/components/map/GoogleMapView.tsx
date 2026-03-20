"use client";

import { APIProvider, Map } from "@vis.gl/react-google-maps";
import { type ReactNode, useState } from "react";
import { MapPin } from "lucide-react";

const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
const GOOGLE_MAPS_MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "";

const DARK_MAP_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#1a1a2e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1a1a2e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8a8a9a" }] },
  {
    featureType: "administrative.locality",
    elementType: "labels.text.fill",
    stylers: [{ color: "#bdbdbd" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#2a2a3e" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#1a1a2e" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#3a3a4e" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#0e0e1a" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#4a4a5a" }],
  },
  {
    featureType: "poi",
    elementType: "geometry",
    stylers: [{ color: "#222236" }],
  },
  {
    featureType: "poi",
    elementType: "labels",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "transit",
    stylers: [{ visibility: "off" }],
  },
];

interface GoogleMapViewProps {
  lat: number;
  lng: number;
  zoom?: number;
  children?: ReactNode;
}

/** Fallback shown when Google Maps API key is missing or fails to load */
function MapFallback({ lat, lng, error }: { lat: number; lng: number; error?: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-[#1a1a2e]">
      <div className="text-center space-y-4 p-6 rounded-xl border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[4px_4px_0_var(--border-strong)]">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#FFE600]/20 border-2 border-[var(--border)]">
          <MapPin size={28} className="text-[#FFE600]" />
        </div>
        <div>
          <p className="text-sm font-bold text-[var(--text-primary)] font-heading">
            Map unavailable
          </p>
          <p className="text-xs text-[var(--text-muted)] font-body mt-1 max-w-[240px]">
            Google Maps couldn&apos;t load. Make sure the Maps JavaScript API is enabled and billing is active in your Google Cloud Console.
          </p>
        </div>
        {error && (
          <div className="rounded-lg bg-red-500/10 px-3 py-1.5 border border-red-500/30">
            <p className="text-[11px] text-red-400 font-mono break-all">
              {error}
            </p>
          </div>
        )}
        <div className="rounded-lg bg-[var(--background)] px-3 py-1.5 border border-[var(--border)]">
          <p className="text-[11px] text-[var(--text-muted)] font-mono">
            📍 {lat.toFixed(4)}, {lng.toFixed(4)}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function GoogleMapView({
  lat,
  lng,
  zoom = 13,
  children,
}: GoogleMapViewProps) {
  const [loadError, setLoadError] = useState<string | null>(null);

  if (!GOOGLE_MAPS_KEY) {
    return <MapFallback lat={lat} lng={lng} error="NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set" />;
  }

  if (loadError) {
    return <MapFallback lat={lat} lng={lng} error={loadError} />;
  }

  return (
    <APIProvider
      apiKey={GOOGLE_MAPS_KEY}
      onLoad={() => setLoadError(null)}
      onError={(err) => {
        console.error("[GoogleMapView] Maps API load error:", err);
        setLoadError(String(err instanceof Error ? err.message : err));
      }}
    >
      <Map
        defaultCenter={{ lat, lng }}
        defaultZoom={zoom}
        gestureHandling="greedy"
        disableDefaultUI
        mapId={GOOGLE_MAPS_MAP_ID || undefined}
        styles={!GOOGLE_MAPS_MAP_ID ? DARK_MAP_STYLE : undefined}
        className="h-full w-full"
      >
        {children}
      </Map>
    </APIProvider>
  );
}

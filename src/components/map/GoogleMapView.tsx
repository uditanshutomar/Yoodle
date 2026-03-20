"use client";

import { APIProvider, Map } from "@vis.gl/react-google-maps";
import { type ReactNode } from "react";

const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

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

export default function GoogleMapView({
  lat,
  lng,
  zoom = 13,
  children,
}: GoogleMapViewProps) {
  return (
    <APIProvider apiKey={GOOGLE_MAPS_KEY}>
      <Map
        defaultCenter={{ lat, lng }}
        defaultZoom={zoom}
        gestureHandling="greedy"
        disableDefaultUI
        styles={DARK_MAP_STYLE}
        className="h-full w-full"
      >
        {children}
      </Map>
    </APIProvider>
  );
}

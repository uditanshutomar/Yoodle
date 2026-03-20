# Map Feature & Social Modes — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a full-screen map page with three mascot-driven social modes (Ninja, LockedIn, Social) that control who can see your location on the map.

**Architecture:** New `/map` route using `@vis.gl/react-google-maps` with full-bleed layout. Three modes reuse the existing `user.mode` enum and `MASCOT_BY_MODE` constant. `useNearbyUsers` hook polls `/api/users/nearby` every 30s via `useBroadcastPoll`. The nearby API is extended to support `lockin` mode (workspace-filtered + coord blur). A floating `ModeSwitcher` component lets users pick between Ninja/LockedIn/Social with animated mascot cards.

**Tech Stack:** Next.js App Router, `@vis.gl/react-google-maps`, Framer Motion, MongoDB `$geoNear`, existing `useGeolocation` hook, `useBroadcastPoll` pattern, `MASCOT_BY_MODE` constant.

---

### Task 1: `useUserMode` Hook

**Files:**
- Create: `src/hooks/useUserMode.ts`

**Step 1: Create the hook**

This hook reads the current user's mode from the profile API and provides a function to switch modes. It uses optimistic updates for instant UI feedback.

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import { MASCOT_BY_MODE } from "@/components/ai/constants";

export type UserMode = "social" | "lockin" | "invisible";

interface UseUserModeReturn {
  mode: UserMode;
  mascot: string;
  switchMode: (newMode: UserMode) => Promise<void>;
  loading: boolean;
}

export function useUserMode(): UseUserModeReturn {
  const [mode, setMode] = useState<UserMode>("social");
  const [loading, setLoading] = useState(true);

  // Fetch initial mode from profile
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/users/me", { credentials: "include" });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && json.data?.mode) {
          setMode(json.data.mode);
        }
      } catch {
        // Best-effort — default to social
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const switchMode = useCallback(async (newMode: UserMode) => {
    const prev = mode;
    setMode(newMode); // optimistic
    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mode: newMode }),
      });
      if (!res.ok) {
        setMode(prev); // rollback
      }
    } catch {
      setMode(prev); // rollback
    }
  }, [mode]);

  return {
    mode,
    mascot: MASCOT_BY_MODE[mode] || MASCOT_BY_MODE.social,
    switchMode,
    loading,
  };
}
```

**Step 2: Verify it compiles**

Run: `node ./node_modules/.bin/next build 2>&1 | head -30`
Expected: No TypeScript errors for the new file.

**Step 3: Commit**

```bash
git add src/hooks/useUserMode.ts
git commit -m "feat(map): add useUserMode hook for mode switching with optimistic updates"
```

---

### Task 2: `useNearbyUsers` Hook

**Files:**
- Create: `src/hooks/useNearbyUsers.ts`

**Step 1: Create the hook**

This hook polls `/api/users/nearby` every 30s using the existing `useBroadcastPoll` pattern. It pauses when the user is in ninja (invisible) mode or when coordinates are unavailable.

```typescript
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
    coordinates?: [number, number]; // [lng, lat] — only present for social users
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

const POLL_INTERVAL = 30_000; // 30 seconds

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
```

**Step 2: Verify it compiles**

Run: `node ./node_modules/.bin/next build 2>&1 | head -30`
Expected: No TypeScript errors.

**Step 3: Commit**

```bash
git add src/hooks/useNearbyUsers.ts
git commit -m "feat(map): add useNearbyUsers hook with broadcast poll and mode awareness"
```

---

### Task 3: Update `/api/users/nearby` — Workspace Filtering + Coord Blur

**Files:**
- Modify: `src/app/api/users/nearby/route.ts`
- Create: `src/app/api/users/nearby/__tests__/route.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/infra/db/client", () => ({ default: vi.fn() }));
vi.mock("@/lib/infra/api/rate-limit", () => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/infra/auth/middleware", () => ({
  getUserIdFromRequest: vi.fn().mockResolvedValue("607f1f77bcf86cd799439011"),
}));

import mongoose from "mongoose";

const mockAggregate = vi.fn();
vi.mock("@/lib/infra/db/models/user", () => ({
  default: { aggregate: (...args: unknown[]) => mockAggregate(...args) },
}));

const mockWorkspaceFind = vi.fn();
vi.mock("@/lib/infra/db/models/workspace", () => ({
  default: {
    find: (...args: unknown[]) => ({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockWorkspaceFind(...args)),
      }),
    }),
  },
}));

import { GET } from "../route";
import { NextRequest } from "next/server";

function makeReq(params: Record<string, string>) {
  const url = new URL("http://localhost/api/users/nearby");
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url);
}

describe("GET /api/users/nearby", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("includes lockin users who share a workspace with the requester", async () => {
    const wsId = new mongoose.Types.ObjectId();
    mockWorkspaceFind.mockReturnValue([{ _id: wsId }]);
    mockAggregate.mockResolvedValue([
      {
        id: "607f1f77bcf86cd799439022",
        name: "LockedIn User",
        mode: "lockin",
        location: { coordinates: [77.1, 28.6] },
        distanceMeters: 5000,
      },
    ]);

    const res = await GET(makeReq({ lng: "77.0", lat: "28.5" }));
    const body = await res.json();

    expect(body.success).toBe(true);

    // Verify the $geoNear query includes lockin mode with workspace filter
    const pipeline = mockAggregate.mock.calls[0][0];
    const geoNearQuery = pipeline[0].$geoNear.query;
    expect(geoNearQuery.$or).toBeDefined();
    expect(geoNearQuery.$or).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ mode: "social" }),
        expect.objectContaining({ mode: "lockin" }),
      ]),
    );
  });

  it("blurs coordinates for lockin users in the response", async () => {
    mockWorkspaceFind.mockReturnValue([]);
    mockAggregate.mockResolvedValue([
      {
        id: "607f1f77bcf86cd799439033",
        name: "Social User",
        mode: "social",
        location: { coordinates: [77.1025, 28.6139] },
        distanceMeters: 2000,
      },
      {
        id: "607f1f77bcf86cd799439044",
        name: "LockedIn User",
        mode: "lockin",
        location: { coordinates: [77.2000, 28.7000] },
        distanceMeters: 8000,
      },
    ]);

    const res = await GET(makeReq({ lng: "77.0", lat: "28.5" }));
    const body = await res.json();

    const socialUser = body.data.find((u: { mode: string }) => u.mode === "social");
    const lockinUser = body.data.find((u: { mode: string }) => u.mode === "lockin");

    // Social user keeps exact coords in response (location.coordinates projected)
    expect(socialUser).toBeDefined();

    // LockedIn user should NOT have exact coordinates exposed
    if (lockinUser) {
      // Coords should be absent or blurred (not matching original)
      expect(lockinUser.location?.coordinates).toBeUndefined();
    }
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node ./node_modules/.bin/vitest run src/app/api/users/nearby/__tests__/route.test.ts`
Expected: FAIL — tests fail because the current route only filters `mode: "social"` and doesn't import Workspace.

**Step 3: Update the nearby route**

Replace the content of `src/app/api/users/nearby/route.ts` with:

```typescript
import { NextRequest } from "next/server";
import { z } from "zod";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { BadRequestError } from "@/lib/infra/api/errors";
import connectDB from "@/lib/infra/db/client";
import User from "@/lib/infra/db/models/user";
import Workspace from "@/lib/infra/db/models/workspace";
import mongoose from "mongoose";

const querySchema = z.object({
  lng: z.coerce.number().min(-180).max(180),
  lat: z.coerce.number().min(-90).max(90),
  radiusKm: z.coerce.number().min(0.1).max(100).default(10),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/** Blur coordinates by ±5km random offset for privacy */
function blurCoordinates(coords: [number, number]): [number, number] {
  // ~0.045 degrees ≈ 5km at equator
  const offset = 0.045;
  const lngBlur = coords[0] + (Math.random() - 0.5) * 2 * offset;
  const latBlur = coords[1] + (Math.random() - 0.5) * 2 * offset;
  return [
    Math.max(-180, Math.min(180, lngBlur)),
    Math.max(-90, Math.min(90, latBlur)),
  ];
}

/**
 * GET /api/users/nearby?lng=...&lat=...&radiusKm=10&limit=20
 *
 * Returns users within a given radius who are visible to the requester:
 * - "social" mode → visible to everyone, exact coordinates
 * - "lockin" mode → visible only to workspace mates, coordinates blurred ±5km
 * - "invisible" mode → never returned
 */
export const GET = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "session");
  const userId = await getUserIdFromRequest(req);

  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse(params);

  if (!parsed.success) {
    throw new BadRequestError(
      "Invalid query params. Required: lng, lat. Optional: radiusKm (0.1-100), limit (1-50).",
    );
  }

  const { lng, lat, radiusKm, limit } = parsed.data;

  await connectDB();

  // Find workspaces the requesting user belongs to
  const userWorkspaces = await Workspace.find({
    "members.userId": new mongoose.Types.ObjectId(userId),
  })
    .select("_id")
    .lean();
  const workspaceIds = userWorkspaces.map((ws) => ws._id);

  // Build mode filter: social (everyone) + lockin (workspace mates only)
  const modeFilter: Record<string, unknown> = {
    $or: [
      { mode: "social" },
      ...(workspaceIds.length > 0
        ? [{ mode: "lockin" }]
        : []),
      // invisible → never included
    ],
  };

  // If we have workspaces, we need to join workspace membership for lockin filtering
  // We do this by first getting lockin user IDs from shared workspaces
  let lockinUserIds: mongoose.Types.ObjectId[] = [];
  if (workspaceIds.length > 0) {
    const sharedWorkspaces = await Workspace.find({
      _id: { $in: workspaceIds },
    })
      .select("members.userId")
      .lean();

    const memberIdSet = new Set<string>();
    for (const ws of sharedWorkspaces) {
      for (const m of ws.members) {
        const memberId = m.userId.toString();
        if (memberId !== userId) {
          memberIdSet.add(memberId);
        }
      }
    }
    lockinUserIds = [...memberIdSet].map(
      (id) => new mongoose.Types.ObjectId(id),
    );
  }

  const nearbyUsers = await User.aggregate([
    {
      $geoNear: {
        near: { type: "Point", coordinates: [lng, lat] },
        distanceField: "distanceMeters",
        maxDistance: radiusKm * 1000,
        spherical: true,
        query: {
          _id: { $ne: new mongoose.Types.ObjectId(userId) },
          "location.coordinates": { $exists: true },
          $or: [
            { mode: "social" },
            ...(lockinUserIds.length > 0
              ? [{ mode: "lockin", _id: { $in: lockinUserIds } }]
              : []),
          ],
        },
      },
    },
    { $limit: limit },
    {
      $project: {
        _id: 0,
        id: { $toString: "$_id" },
        name: 1,
        displayName: 1,
        avatarUrl: 1,
        status: 1,
        mode: 1,
        location: {
          coordinates: "$location.coordinates",
          label: "$location.label",
        },
        distanceKm: {
          $round: [{ $divide: ["$distanceMeters", 1000] }, 1],
        },
      },
    },
  ]);

  // Blur coordinates for lockin users (privacy enforcement — server-side)
  const result = nearbyUsers.map((user) => {
    if (user.mode === "lockin" && user.location?.coordinates) {
      return {
        ...user,
        location: {
          ...user.location,
          coordinates: undefined, // strip exact coords
          approximate: true,
          blurredCoordinates: blurCoordinates(user.location.coordinates),
        },
      };
    }
    return user;
  });

  return successResponse(result);
});
```

**Step 4: Run tests to verify they pass**

Run: `node ./node_modules/.bin/vitest run src/app/api/users/nearby/__tests__/route.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/app/api/users/nearby/route.ts src/app/api/users/nearby/__tests__/route.test.ts
git commit -m "feat(map): extend nearby API with lockin workspace filtering and coord blur"
```

---

### Task 4: Add Map to Sidebar Navigation

**Files:**
- Modify: `src/components/layout/AppSidebar.tsx:24-31`

**Step 1: Add MapPin icon import and map nav item**

In `src/components/layout/AppSidebar.tsx`, add `MapPin` to the lucide-react import:

```typescript
import {
  LayoutGrid,
  DoorOpen,
  Kanban,
  MapPin,
  Calendar,
  MessageCircle,
  Activity,
  Ghost,
  Settings,
  ChevronDown,
  Check,
  Plus,
} from "lucide-react";
```

Then add the Map item to `navItems` array after "The Board":

```typescript
const navItems = [
  { label: "The Desk", href: "/dashboard", icon: LayoutGrid },
  { label: "Rooms", href: "/meetings", icon: DoorOpen },
  { label: "The Board", href: "/board", icon: Kanban },
  { label: "Map", href: "/map", icon: MapPin },
  { label: "Calendar", href: "/calendar", icon: Calendar },
  { label: "Chatter", href: "/messages", icon: MessageCircle },
  { label: "Ghost Rooms", href: "/ghost-rooms", icon: Ghost },
  { label: "Pulse", href: "/analytics", icon: Activity },
];
```

**Step 2: Verify it compiles**

Run: `node ./node_modules/.bin/next build 2>&1 | head -30`
Expected: No TypeScript errors.

**Step 3: Commit**

```bash
git add src/components/layout/AppSidebar.tsx
git commit -m "feat(map): add Map entry to sidebar navigation"
```

---

### Task 5: Map Page Route + Layout Override

**Files:**
- Create: `src/app/(app)/map/page.tsx`
- Create: `src/app/(app)/map/layout.tsx`
- Create: `src/app/(app)/map/MapClient.tsx`

**Step 1: Create the map-specific layout**

The map needs full-bleed display (no max-width, no padding). Create a layout override at `src/app/(app)/map/layout.tsx`:

```typescript
export default function MapLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
```

Note: The parent `(app)/layout.tsx` wraps content in `<main>` with `max-w-7xl` and padding. The map page's content will use negative margins / absolute positioning to break out of that constraint, OR we use a portal. Simpler approach: the MapClient itself uses `fixed` positioning to fill the available space.

**Step 2: Create the page entry**

`src/app/(app)/map/page.tsx`:

```typescript
import MapClient from "./MapClient";

export default function MapPage() {
  return <MapClient />;
}
```

**Step 3: Create the MapClient shell**

`src/app/(app)/map/MapClient.tsx`:

```typescript
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
      {/* Full-bleed container that breaks out of the parent padding */}
      <div className="absolute inset-0 bg-[#1a1a2e]">
        {/* Map will go here */}
        <div className="flex h-full items-center justify-center text-[var(--text-muted)]">
          {geoLoading && <p>Getting your location...</p>}
          {geoError && (
            <div className="text-center space-y-3">
              <p className="text-sm">{geoError}</p>
              <button
                onClick={requestLocation}
                className="rounded-xl border-2 border-[var(--border-strong)] bg-[#FFE600] px-4 py-2 text-sm font-bold text-[#0A0A0A] shadow-[4px_4px_0_var(--border-strong)] hover:shadow-[2px_2px_0_var(--border-strong)] transition-shadow font-heading"
              >
                Enable Location
              </button>
            </div>
          )}
          {!geoLoading && !geoError && latitude && longitude && (
            <p className="text-sm">Map loading... ({users.length} users nearby)</p>
          )}
        </div>
      </div>
    </div>
  );
}
```

**Step 4: Verify it compiles**

Run: `node ./node_modules/.bin/next build 2>&1 | head -30`
Expected: No TypeScript errors.

**Step 5: Commit**

```bash
git add src/app/(app)/map/page.tsx src/app/(app)/map/layout.tsx src/app/(app)/map/MapClient.tsx
git commit -m "feat(map): scaffold map page route with geolocation and nearby users"
```

---

### Task 6: Google Map Component with Dark Theme

**Files:**
- Create: `src/components/map/GoogleMapView.tsx`
- Modify: `src/app/(app)/map/MapClient.tsx`

**Step 1: Create the GoogleMapView component**

`src/components/map/GoogleMapView.tsx`:

```typescript
"use client";

import { APIProvider, Map } from "@vis.gl/react-google-maps";
import { type ReactNode } from "react";

const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

/** Dark map style that makes Yoodle's yellow accent pop */
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
```

**Step 2: Wire GoogleMapView into MapClient**

Replace the placeholder in `src/app/(app)/map/MapClient.tsx` — replace the inner `<div className="absolute inset-0 bg-[#1a1a2e]">` block with:

```typescript
"use client";

import { useGeolocation } from "@/hooks/useGeolocation";
import { useUserMode } from "@/hooks/useUserMode";
import { useNearbyUsers } from "@/hooks/useNearbyUsers";
import GoogleMapView from "@/components/map/GoogleMapView";

export default function MapClient() {
  const { latitude, longitude, loading: geoLoading, error: geoError, requestLocation } = useGeolocation({ autoRequest: true });
  const { mode, mascot, switchMode, loading: modeLoading } = useUserMode();
  const { users } = useNearbyUsers({ lat: latitude, lng: longitude, mode });

  const hasLocation = !geoLoading && !geoError && latitude !== null && longitude !== null;

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

        {hasLocation && (
          <GoogleMapView lat={latitude} lng={longitude}>
            {/* Pins will be rendered here in next task */}
          </GoogleMapView>
        )}
      </div>
    </div>
  );
}
```

**Step 3: Verify it compiles**

Run: `node ./node_modules/.bin/next build 2>&1 | head -30`
Expected: No TypeScript errors.

**Step 4: Commit**

```bash
git add src/components/map/GoogleMapView.tsx src/app/(app)/map/MapClient.tsx
git commit -m "feat(map): add Google Map with dark theme and loading/error states"
```

---

### Task 7: UserPin Component

**Files:**
- Create: `src/components/map/UserPin.tsx`

**Step 1: Create UserPin with avatar, pulse ring, and mode badge**

```typescript
"use client";

import { AdvancedMarker } from "@vis.gl/react-google-maps";
import { motion } from "framer-motion";
import Image from "next/image";
import type { NearbyUser } from "@/hooks/useNearbyUsers";

interface UserPinProps {
  user: NearbyUser;
  isCurrentUser?: boolean;
  onClick?: (user: NearbyUser) => void;
}

export default function UserPin({ user, isCurrentUser, onClick }: UserPinProps) {
  const isLockin = user.mode === "lockin";
  const coords = isLockin
    ? (user.location as { blurredCoordinates?: [number, number] })?.blurredCoordinates
    : user.location?.coordinates;

  if (!coords) return null;

  const [lng, lat] = coords;

  return (
    <AdvancedMarker
      position={{ lat, lng }}
      onClick={() => onClick?.(user)}
    >
      <motion.div
        className="relative cursor-pointer"
        initial={{ scale: 0, y: -20 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: "spring", bounce: 0.4, duration: 0.6 }}
      >
        {/* Pulse ring — green for social, blue for lockin */}
        <div
          className={`absolute inset-0 -m-1.5 rounded-full animate-ping ${
            isLockin ? "bg-blue-400/30" : "bg-green-400/30"
          }`}
          style={{ animationDuration: "2s" }}
        />

        {/* Pin circle */}
        <div
          className={`relative flex h-11 w-11 items-center justify-center rounded-full border-2 ${
            isCurrentUser
              ? "border-blue-400 bg-blue-400/20"
              : isLockin
                ? "border-dashed border-blue-400 bg-[var(--surface)]"
                : "border-[#FFE600] bg-[var(--surface)]"
          } shadow-[2px_2px_0_rgba(0,0,0,0.5)]`}
        >
          {user.avatarUrl ? (
            <Image
              src={user.avatarUrl}
              alt={user.displayName || user.name}
              width={36}
              height={36}
              className="rounded-full object-cover"
            />
          ) : (
            <span className="text-sm font-bold text-[var(--text-primary)] font-heading">
              {(user.displayName || user.name || "?").charAt(0).toUpperCase()}
            </span>
          )}
        </div>

        {/* Mode badge */}
        {isLockin && (
          <div className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 border border-white text-[10px]">
            🎧
          </div>
        )}

        {/* "You" label */}
        {isCurrentUser && (
          <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-blue-500 px-1.5 py-0.5 text-[10px] font-bold text-white font-heading">
            You
          </div>
        )}
      </motion.div>
    </AdvancedMarker>
  );
}
```

**Step 2: Verify it compiles**

Run: `node ./node_modules/.bin/next build 2>&1 | head -30`
Expected: No TypeScript errors.

**Step 3: Commit**

```bash
git add src/components/map/UserPin.tsx
git commit -m "feat(map): add UserPin component with avatar, pulse ring, and mode badge"
```

---

### Task 8: HoverCard Component

**Files:**
- Create: `src/components/map/HoverCard.tsx`

**Step 1: Create the hover card with wave and chat actions**

```typescript
"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useCallback } from "react";
import type { NearbyUser } from "@/hooks/useNearbyUsers";

interface HoverCardProps {
  user: NearbyUser;
  onClose: () => void;
}

export default function HoverCard({ user, onClose }: HoverCardProps) {
  const router = useRouter();
  const [waving, setWaving] = useState(false);
  const [waved, setWaved] = useState(false);

  const handleWave = useCallback(async () => {
    if (waving || waved) return;
    setWaving(true);
    try {
      await fetch("/api/notifications/wave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ targetUserId: user.id }),
      });
      setWaved(true);
    } catch {
      // Best effort
    } finally {
      setWaving(false);
    }
  }, [user.id, waving, waved]);

  const handleChat = useCallback(() => {
    router.push(`/messages?userId=${user.id}`);
  }, [router, user.id]);

  const displayName = user.displayName || user.name || "Unknown";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.15 }}
      className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 z-10"
    >
      <div className="w-56 rounded-xl border-2 border-[var(--border-strong)] bg-[var(--surface)] p-3 shadow-[4px_4px_0_var(--border-strong)]">
        {/* User info */}
        <div className="flex items-center gap-2.5 mb-2">
          {user.avatarUrl ? (
            <Image
              src={user.avatarUrl}
              alt={displayName}
              width={32}
              height={32}
              className="rounded-full object-cover border border-[var(--border)]"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FFE600]/20 border border-[var(--border)] text-sm font-bold font-heading">
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-[var(--text-primary)] truncate font-heading">
              {displayName}
            </p>
            {user.distanceKm !== undefined && (
              <p className="text-[11px] text-[var(--text-muted)] font-body">
                {user.distanceKm < 1
                  ? `${Math.round(user.distanceKm * 1000)}m away`
                  : `${user.distanceKm}km away`}
              </p>
            )}
          </div>
        </div>

        {/* Status */}
        {user.status && (
          <p className="text-xs text-[var(--text-secondary)] mb-3 font-body">
            💬 &quot;{user.status}&quot;
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={handleWave}
            disabled={waved}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg border-2 border-[var(--border-strong)] px-3 py-1.5 text-xs font-bold transition-all cursor-pointer font-heading ${
              waved
                ? "bg-green-100 text-green-700 border-green-300"
                : "bg-[#FFE600] text-[#0A0A0A] hover:shadow-[2px_2px_0_var(--border-strong)] active:shadow-none"
            }`}
          >
            <motion.span
              animate={waving ? { rotate: [0, 20, -20, 20, 0] } : {}}
              transition={{ duration: 0.5 }}
            >
              👋
            </motion.span>
            {waved ? "Waved!" : "Wave"}
          </button>
          <button
            onClick={handleChat}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border-2 border-[var(--border-strong)] bg-[var(--surface)] px-3 py-1.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-hover)] hover:shadow-[2px_2px_0_var(--border-strong)] active:shadow-none transition-all cursor-pointer font-heading"
          >
            💬 Chat
          </button>
        </div>
      </div>

      {/* Click-away */}
      <div className="fixed inset-0 -z-10" onClick={onClose} />
    </motion.div>
  );
}
```

**Step 2: Verify it compiles**

Run: `node ./node_modules/.bin/next build 2>&1 | head -30`
Expected: No TypeScript errors.

**Step 3: Commit**

```bash
git add src/components/map/HoverCard.tsx
git commit -m "feat(map): add HoverCard component with wave and chat actions"
```

---

### Task 9: ModeSwitcher Component

**Files:**
- Create: `src/components/map/ModeSwitcher.tsx`

**Step 1: Create the mode switcher with mascot cards**

```typescript
"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { ChevronUp } from "lucide-react";
import { MASCOT_BY_MODE } from "@/components/ai/constants";
import type { UserMode } from "@/hooks/useUserMode";

const MODES: { key: UserMode; label: string; emoji: string; description: string }[] = [
  { key: "invisible", label: "Ninja", emoji: "🥷", description: "Nobody can see you" },
  { key: "lockin", label: "LockedIn", emoji: "🎧", description: "Only workspace mates" },
  { key: "social", label: "Social", emoji: "🧋", description: "Everyone on Yoodle" },
];

interface ModeSwitcherProps {
  mode: UserMode;
  onModeChange: (mode: UserMode) => void;
  status?: string;
  onStatusChange?: (status: string) => void;
}

export default function ModeSwitcher({
  mode,
  onModeChange,
  status,
  onStatusChange,
}: ModeSwitcherProps) {
  const [expanded, setExpanded] = useState(false);
  const [editingStatus, setEditingStatus] = useState(false);
  const [statusDraft, setStatusDraft] = useState(status || "");

  const handleModeClick = useCallback(
    (newMode: UserMode) => {
      if (newMode !== mode) onModeChange(newMode);
    },
    [mode, onModeChange],
  );

  const handleStatusSave = useCallback(() => {
    setEditingStatus(false);
    if (onStatusChange && statusDraft !== status) {
      onStatusChange(statusDraft);
    }
  }, [onStatusChange, statusDraft, status]);

  // Collapsed: just show current mode mascot as floating button
  if (!expanded) {
    return (
      <motion.button
        onClick={() => setExpanded(true)}
        className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-[var(--border-strong)] bg-[#FFE600] shadow-[4px_4px_0_var(--border-strong)] hover:shadow-[2px_2px_0_var(--border-strong)] active:shadow-none transition-shadow cursor-pointer"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        title={`Mode: ${MODES.find((m) => m.key === mode)?.label}`}
      >
        <Image
          src={MASCOT_BY_MODE[mode]}
          alt={MODES.find((m) => m.key === mode)?.label || "Mode"}
          width={40}
          height={40}
          className="mix-blend-multiply"
        />
      </motion.button>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className="rounded-xl border-2 border-[var(--border-strong)] bg-[var(--surface)] shadow-[4px_4px_0_var(--border-strong)] overflow-hidden"
      style={{ width: 320 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b-2 border-[var(--border)]">
        <span className="text-sm font-bold text-[var(--text-primary)] font-heading">
          🔒 Your Visibility
        </span>
        <button
          onClick={() => setExpanded(false)}
          className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
        >
          <ChevronUp size={14} className="text-[var(--text-muted)]" />
        </button>
      </div>

      {/* Mode cards */}
      <div className="flex gap-2 p-3">
        {MODES.map((m) => {
          const active = mode === m.key;
          return (
            <motion.button
              key={m.key}
              onClick={() => handleModeClick(m.key)}
              className={`flex-1 flex flex-col items-center gap-1.5 rounded-xl border-2 px-2 py-3 transition-all cursor-pointer ${
                active
                  ? "border-[var(--border-strong)] bg-[#FFE600] shadow-[3px_3px_0_var(--border-strong)]"
                  : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-hover)]"
              }`}
              animate={active ? { scale: 1.03 } : { scale: 1 }}
              whileTap={{ scale: 0.97 }}
            >
              <motion.div
                animate={active ? { y: [0, -4, 0] } : {}}
                transition={{ duration: 0.4 }}
              >
                <Image
                  src={MASCOT_BY_MODE[m.key]}
                  alt={m.label}
                  width={48}
                  height={48}
                  className="mix-blend-multiply"
                />
              </motion.div>
              <span
                className={`text-xs font-bold font-heading ${
                  active ? "text-[#0A0A0A]" : "text-[var(--text-secondary)]"
                }`}
              >
                {m.label}
              </span>
              <span
                className={`text-[10px] font-body leading-tight text-center ${
                  active ? "text-[#0A0A0A]/70" : "text-[var(--text-muted)]"
                }`}
              >
                {m.description}
              </span>
            </motion.button>
          );
        })}
      </div>

      {/* Status editor — hidden in Ninja mode */}
      <AnimatePresence>
        {mode !== "invisible" && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3">
              {editingStatus ? (
                <input
                  type="text"
                  value={statusDraft}
                  onChange={(e) => setStatusDraft(e.target.value.slice(0, 60))}
                  onBlur={handleStatusSave}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleStatusSave();
                    if (e.key === "Escape") { setEditingStatus(false); setStatusDraft(status || ""); }
                  }}
                  placeholder="What are you up to?"
                  maxLength={60}
                  autoFocus
                  className="w-full rounded-lg border-2 border-[var(--border-strong)] bg-[var(--background)] px-3 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] font-body focus-visible:ring-2 focus-visible:ring-[#FFE600] focus-visible:outline-none"
                />
              ) : (
                <button
                  onClick={() => { setStatusDraft(status || ""); setEditingStatus(true); }}
                  className="flex w-full items-center gap-2 rounded-lg border border-dashed border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-muted)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer font-body"
                >
                  💬 {status || "Set a status..."} ✏️
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
```

**Step 2: Verify it compiles**

Run: `node ./node_modules/.bin/next build 2>&1 | head -30`
Expected: No TypeScript errors.

**Step 3: Commit**

```bash
git add src/components/map/ModeSwitcher.tsx
git commit -m "feat(map): add ModeSwitcher component with mascot cards and status editor"
```

---

### Task 10: Wire Everything Together in MapClient

**Files:**
- Modify: `src/app/(app)/map/MapClient.tsx`

**Step 1: Full MapClient with map, pins, hover cards, and mode switcher**

Replace `src/app/(app)/map/MapClient.tsx` entirely:

```typescript
"use client";

import { useState, useCallback } from "react";
import { AnimatePresence } from "framer-motion";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useUserMode } from "@/hooks/useUserMode";
import { useNearbyUsers, type NearbyUser } from "@/hooks/useNearbyUsers";
import GoogleMapView from "@/components/map/GoogleMapView";
import UserPin from "@/components/map/UserPin";
import HoverCard from "@/components/map/HoverCard";
import ModeSwitcher from "@/components/map/ModeSwitcher";
import Image from "next/image";
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
          <GoogleMapView lat={geo.latitude} lng={geo.longitude}>
            {/* Current user pin */}
            <UserPin
              user={{
                id: "self",
                name: "You",
                mode,
                distanceKm: 0,
                location: { coordinates: [geo.longitude, geo.latitude] },
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

        {/* User count badge — top right */}
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
```

**Step 2: Verify it compiles**

Run: `node ./node_modules/.bin/next build 2>&1 | head -30`
Expected: No TypeScript errors.

**Step 3: Commit**

```bash
git add src/app/(app)/map/MapClient.tsx
git commit -m "feat(map): wire up MapClient with pins, hover cards, mode switcher, and states"
```

---

### Task 11: Wave Notification API Endpoint

**Files:**
- Create: `src/app/api/notifications/wave/route.ts`
- Create: `src/app/api/notifications/wave/__tests__/route.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/infra/db/client", () => ({ default: vi.fn() }));
vi.mock("@/lib/infra/api/rate-limit", () => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/infra/auth/middleware", () => ({
  getUserIdFromRequest: vi.fn().mockResolvedValue("607f1f77bcf86cd799439011"),
}));

const mockFindById = vi.fn();
vi.mock("@/lib/infra/db/models/user", () => ({
  default: {
    findById: (...args: unknown[]) => ({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockImplementation(() => mockFindById(...args)),
      }),
    }),
  },
}));

import { POST } from "../route";
import { NextRequest } from "next/server";

function makeReq(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/notifications/wave", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/notifications/wave", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns success when waving at a valid user", async () => {
    mockFindById.mockResolvedValue({
      _id: "607f1f77bcf86cd799439022",
      name: "Target User",
    });

    const res = await POST(makeReq({ targetUserId: "607f1f77bcf86cd799439022" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.waved).toBe(true);
  });

  it("returns 400 for invalid targetUserId", async () => {
    const res = await POST(makeReq({ targetUserId: "invalid" }));
    expect(res.status).toBe(400);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node ./node_modules/.bin/vitest run src/app/api/notifications/wave/__tests__/route.test.ts`
Expected: FAIL — route doesn't exist yet.

**Step 3: Create the wave endpoint**

`src/app/api/notifications/wave/route.ts`:

```typescript
import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { BadRequestError, NotFoundError } from "@/lib/infra/api/errors";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import connectDB from "@/lib/infra/db/client";
import User from "@/lib/infra/db/models/user";

const waveSchema = z.object({
  targetUserId: z.string().refine(
    (val) => mongoose.Types.ObjectId.isValid(val),
    { message: "Invalid target user ID" },
  ),
});

export const POST = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);
  const body = waveSchema.parse(await req.json());
  await connectDB();

  if (body.targetUserId === userId) {
    throw new BadRequestError("Cannot wave at yourself");
  }

  const targetUser = await User.findById(body.targetUserId).select("_id name").lean();
  if (!targetUser) throw new NotFoundError("User not found");

  // For now, just acknowledge the wave. A full notification system
  // (Redis pub/sub → SSE push) can be added as a follow-up.
  return successResponse({ waved: true, targetUserId: body.targetUserId });
});
```

**Step 4: Run tests to verify they pass**

Run: `node ./node_modules/.bin/vitest run src/app/api/notifications/wave/__tests__/route.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/app/api/notifications/wave/route.ts src/app/api/notifications/wave/__tests__/route.test.ts
git commit -m "feat(map): add wave notification API endpoint"
```

---

### Task 12: MapEmptyState Component

**Files:**
- Create: `src/components/map/MapEmptyState.tsx`
- Modify: `src/app/(app)/map/MapClient.tsx`

**Step 1: Create the empty state component**

```typescript
"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { MASCOT_BY_MODE } from "@/components/ai/constants";

interface MapEmptyStateProps {
  mode: string;
}

export default function MapEmptyState({ mode }: MapEmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none"
    >
      <div className="text-center space-y-3 rounded-xl border-2 border-[var(--border-strong)] bg-[var(--surface)] p-6 shadow-[4px_4px_0_var(--border-strong)] pointer-events-auto">
        <motion.div
          animate={{ y: [0, -6, 0] }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
        >
          <Image
            src={MASCOT_BY_MODE[mode] || MASCOT_BY_MODE.social}
            alt="Yoodle mascot"
            width={80}
            height={80}
            className="mx-auto mix-blend-multiply"
          />
        </motion.div>
        <p className="text-sm font-bold text-[var(--text-primary)] font-heading">
          No one&apos;s nearby yet
        </p>
        <p className="text-xs text-[var(--text-muted)] font-body max-w-[200px]">
          Be the first to drop a pin! Others in your area will show up here.
        </p>
      </div>
    </motion.div>
  );
}
```

**Step 2: Add empty state to MapClient**

In `src/app/(app)/map/MapClient.tsx`, import `MapEmptyState`:

```typescript
import MapEmptyState from "@/components/map/MapEmptyState";
```

Then add the empty state after the user pins section, inside the `{hasLocation && (` block, right after the closing `</GoogleMapView>`:

```typescript
{/* Empty state when no nearby users */}
{hasLocation && users.length === 0 && mode !== "invisible" && (
  <MapEmptyState mode={mode} />
)}
```

**Step 3: Verify it compiles**

Run: `node ./node_modules/.bin/next build 2>&1 | head -30`
Expected: No TypeScript errors.

**Step 4: Commit**

```bash
git add src/components/map/MapEmptyState.tsx src/app/(app)/map/MapClient.tsx
git commit -m "feat(map): add MapEmptyState component with bouncing mascot"
```

---

### Task 13: Run Full Test Suite + Build

**Step 1: Run all tests**

Run: `node ./node_modules/.bin/vitest run`
Expected: All tests pass (900+ tests).

**Step 2: Run production build**

Run: `node ./node_modules/.bin/next build`
Expected: Build succeeds with no TypeScript or ESLint errors.

**Step 3: Fix any issues found**

If tests or build fail, fix the issues and commit the fix.

**Step 4: Final commit**

```bash
git add -A
git commit -m "chore: fix any lint/type issues from map feature"
```

---

## File Summary

**New files (11):**
- `src/hooks/useUserMode.ts`
- `src/hooks/useNearbyUsers.ts`
- `src/app/(app)/map/page.tsx`
- `src/app/(app)/map/layout.tsx`
- `src/app/(app)/map/MapClient.tsx`
- `src/components/map/GoogleMapView.tsx`
- `src/components/map/UserPin.tsx`
- `src/components/map/HoverCard.tsx`
- `src/components/map/ModeSwitcher.tsx`
- `src/components/map/MapEmptyState.tsx`
- `src/app/api/notifications/wave/route.ts`

**New test files (2):**
- `src/app/api/users/nearby/__tests__/route.test.ts`
- `src/app/api/notifications/wave/__tests__/route.test.ts`

**Modified files (2):**
- `src/app/api/users/nearby/route.ts` — workspace filtering + coord blur for lockin
- `src/components/layout/AppSidebar.tsx` — add Map nav item

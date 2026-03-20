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

/**
 * Blur coordinates by adding a random offset of ~5km to prevent
 * exact location disclosure for lockin-mode users.
 */
function blurCoordinates(coords: [number, number]): [number, number] {
  const offset = 0.045; // ~5km at equator
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
 * Returns users within a given radius who are in "social" mode
 * and have shared their location, plus "lockin" mode users who
 * share a workspace with the requester (with blurred coordinates).
 * Uses MongoDB $geoNear for efficient geospatial queries on the
 * 2dsphere index.
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
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const workspaces = await Workspace.find({
    "members.userId": userObjectId,
  })
    .select("members.userId")
    .lean();

  // Collect all workspace mate user IDs (excluding self)
  const workspaceMateIds = new Set<string>();
  for (const ws of workspaces) {
    for (const member of ws.members) {
      const memberId = member.userId.toString();
      if (memberId !== userId) {
        workspaceMateIds.add(memberId);
      }
    }
  }

  const lockinUserIds = [...workspaceMateIds].map(
    (id) => new mongoose.Types.ObjectId(id),
  );

  // Use MongoDB aggregation with $geoNear for distance-sorted results
  const nearbyUsers = await User.aggregate([
    {
      $geoNear: {
        near: { type: "Point", coordinates: [lng, lat] },
        distanceField: "distanceMeters",
        maxDistance: radiusKm * 1000, // convert km to meters
        spherical: true,
        query: {
          _id: { $ne: userObjectId }, // exclude self
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

  // Blur coordinates for lockin users to protect their exact location
  const result = nearbyUsers.map((user) => {
    if (user.mode === "lockin" && user.location?.coordinates) {
      return {
        ...user,
        location: {
          ...user.location,
          coordinates: undefined,
          approximate: true,
          blurredCoordinates: blurCoordinates(user.location.coordinates),
        },
      };
    }
    return user;
  });

  return successResponse(result);
});

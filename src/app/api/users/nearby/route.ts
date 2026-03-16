import { NextRequest } from "next/server";
import { z } from "zod";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { BadRequestError } from "@/lib/infra/api/errors";
import connectDB from "@/lib/infra/db/client";
import User from "@/lib/infra/db/models/user";
import mongoose from "mongoose";

const querySchema = z.object({
  lng: z.coerce.number().min(-180).max(180),
  lat: z.coerce.number().min(-90).max(90),
  radiusKm: z.coerce.number().min(0.1).max(100).default(10),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/**
 * GET /api/users/nearby?lng=...&lat=...&radiusKm=10&limit=20
 *
 * Returns users within a given radius who are in "social" mode
 * and have shared their location. Uses MongoDB $geoNear for efficient
 * geospatial queries on the 2dsphere index.
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

  // Use MongoDB aggregation with $geoNear for distance-sorted results
  const nearbyUsers = await User.aggregate([
    {
      $geoNear: {
        near: { type: "Point", coordinates: [lng, lat] },
        distanceField: "distanceMeters",
        maxDistance: radiusKm * 1000, // convert km to meters
        spherical: true,
        query: {
          _id: { $ne: new mongoose.Types.ObjectId(userId) }, // exclude self
          mode: "social", // only show users in social mode
          "location.coordinates": { $exists: true },
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
          label: "$location.label",
        },
        distanceKm: {
          $round: [{ $divide: ["$distanceMeters", 1000] }, 1],
        },
      },
    },
  ]);

  return successResponse(nearbyUsers);
});

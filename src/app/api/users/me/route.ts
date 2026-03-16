import { NextRequest } from "next/server";
import { z } from "zod";
import { withHandler } from "@/lib/infra/api/with-handler";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import { getUserIdFromRequest } from "@/lib/infra/auth/middleware";
import { BadRequestError, NotFoundError } from "@/lib/infra/api/errors";
import connectDB from "@/lib/infra/db/client";
import User from "@/lib/infra/db/models/user";
import { successResponse } from "@/lib/infra/api/response";

/**
 * GET /api/users/me
 * Returns the authenticated user's profile.
 */
export const GET = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);

  await connectDB();

  const user = await User.findById(userId)
    .select("-magicLinkToken -magicLinkExpires -refreshTokenHash -__v")
    .lean();

  if (!user) {
    throw new NotFoundError("User not found.");
  }

  return successResponse({
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    mode: user.mode,
    status: user.status,
    location: user.location,
    preferences: user.preferences,
    lastSeenAt: user.lastSeenAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  });
});

const updateProfileSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required.")
    .max(100, "Name must be 100 characters or fewer.")
    .optional(),
  displayName: z
    .string()
    .min(1, "Display name is required.")
    .max(50, "Display name must be 50 characters or fewer.")
    .optional(),
  avatarUrl: z
    .string()
    .url("Avatar URL must be a valid URL.")
    .optional()
    .nullable(),
  mode: z.enum(["lockin", "invisible", "social"]).optional(),
  location: z
    .object({
      type: z.literal("Point"),
      coordinates: z.tuple([z.number(), z.number()]),
      label: z.string().optional(),
    })
    .optional()
    .nullable(),
  preferences: z
    .object({
      notifications: z.boolean().optional(),
      ghostModeDefault: z.boolean().optional(),
      theme: z.enum(["light", "dark", "auto"]).optional(),
    })
    .optional(),
});

/**
 * PATCH /api/users/me
 * Updates the authenticated user's profile fields.
 */
export const PATCH = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "general");
  const userId = await getUserIdFromRequest(req);

  const body = await req.json();

  // Zod parse — withHandler converts ZodError to 400 automatically
  const updates = updateProfileSchema.parse(body);

  await connectDB();

  // Build the update object, handling nested preferences
  const updateFields: Record<string, unknown> = {};
  const unsetFields: Record<string, 1> = {};

  if (updates.name !== undefined) {
    updateFields.name = updates.name;
  }
  if (updates.displayName !== undefined) {
    updateFields.displayName = updates.displayName;
  }
  if (updates.mode !== undefined) {
    updateFields.mode = updates.mode;

    // Enforce mode behaviors on the server side:
    //   lockin    → status "dnd", pause notifications
    //   invisible → status "offline", clear shared location
    //   social    → status "online", re-enable notifications
    switch (updates.mode) {
      case "lockin":
        updateFields.status = "dnd";
        updateFields["preferences.notifications"] = false;
        break;
      case "invisible":
        updateFields.status = "offline";
        unsetFields.location = 1;
        break;
      case "social":
        updateFields.status = "online";
        updateFields["preferences.notifications"] = true;
        break;
    }
  }
  if (updates.avatarUrl !== undefined) {
    if (updates.avatarUrl === null) {
      unsetFields.avatarUrl = 1;
    } else {
      updateFields.avatarUrl = updates.avatarUrl;
    }
  }
  if (updates.location !== undefined) {
    if (updates.location === null) {
      unsetFields.location = 1;
    } else {
      updateFields.location = {
        ...updates.location,
        updatedAt: new Date(),
      };
    }
  }
  if (updates.preferences !== undefined) {
    // Merge individual preference fields
    if (updates.preferences.notifications !== undefined) {
      updateFields["preferences.notifications"] =
        updates.preferences.notifications;
    }
    if (updates.preferences.ghostModeDefault !== undefined) {
      updateFields["preferences.ghostModeDefault"] =
        updates.preferences.ghostModeDefault;
    }
    if (updates.preferences.theme !== undefined) {
      updateFields["preferences.theme"] = updates.preferences.theme;
    }
  }

  const updateQuery: Record<string, unknown> = {};
  if (Object.keys(updateFields).length > 0) {
    updateQuery.$set = updateFields;
  }
  if (Object.keys(unsetFields).length > 0) {
    updateQuery.$unset = unsetFields;
  }

  if (Object.keys(updateQuery).length === 0) {
    throw new BadRequestError("No valid fields to update.");
  }

  const updatedUser = await User.findByIdAndUpdate(userId, updateQuery, {
    new: true,
    runValidators: true,
  }).select("-magicLinkToken -magicLinkExpires -refreshTokenHash -__v");

  if (!updatedUser) {
    throw new NotFoundError("User not found.");
  }

  return successResponse({
    id: updatedUser._id.toString(),
    email: updatedUser.email,
    name: updatedUser.name,
    displayName: updatedUser.displayName,
    avatarUrl: updatedUser.avatarUrl,
    mode: updatedUser.mode,
    status: updatedUser.status,
    location: updatedUser.location,
    preferences: updatedUser.preferences,
    lastSeenAt: updatedUser.lastSeenAt,
    createdAt: updatedUser.createdAt,
    updatedAt: updatedUser.updatedAt,
  });
});

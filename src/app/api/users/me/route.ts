import { NextRequest } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/infra/db/client";
import User from "@/lib/infra/db/models/user";
import { authenticateRequest } from "@/lib/infra/auth/middleware";
import {
  successResponse,
  errorResponse,
  unauthorized,
  notFound,
  internalError,
} from "@/lib/infra/api/response";

/**
 * GET /api/users/me
 * Returns the authenticated user's profile.
 */
export async function GET(request: NextRequest) {
  try {
    let userId: string;

    try {
      const payload = await authenticateRequest(request);
      userId = payload.userId;
    } catch {
      return unauthorized();
    }

    await connectDB();

    const user = await User.findById(userId).select(
      "-magicLinkToken -magicLinkExpires -refreshTokenHash -__v"
    );

    if (!user) {
      return notFound("User not found.");
    }

    return successResponse({
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      status: user.status,
      location: user.location,
      preferences: user.preferences,
      lastSeenAt: user.lastSeenAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  } catch (error) {
    console.error("[Users/Me GET Error]", error);
    return internalError("Failed to retrieve profile.");
  }
}

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
export async function PATCH(request: NextRequest) {
  try {
    let userId: string;

    try {
      const payload = await authenticateRequest(request);
      userId = payload.userId;
    } catch {
      return unauthorized();
    }

    const body = await request.json();

    const parsed = updateProfileSchema.safeParse(body);
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path.join(".");
        if (!fieldErrors[path]) {
          fieldErrors[path] = [];
        }
        fieldErrors[path].push(issue.message);
      }
      return errorResponse("VALIDATION_ERROR", "Validation failed.", 400, fieldErrors);
    }

    const updates = parsed.data;

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
      return errorResponse("BAD_REQUEST", "No valid fields to update.", 400);
    }

    const updatedUser = await User.findByIdAndUpdate(userId, updateQuery, {
      new: true,
      runValidators: true,
    }).select("-magicLinkToken -magicLinkExpires -refreshTokenHash -__v");

    if (!updatedUser) {
      return notFound("User not found.");
    }

    return successResponse({
      data: {
        id: updatedUser._id.toString(),
        email: updatedUser.email,
        name: updatedUser.name,
        displayName: updatedUser.displayName,
        avatarUrl: updatedUser.avatarUrl,
        status: updatedUser.status,
        location: updatedUser.location,
        preferences: updatedUser.preferences,
        lastSeenAt: updatedUser.lastSeenAt,
        createdAt: updatedUser.createdAt,
        updatedAt: updatedUser.updatedAt,
      },
      message: "Profile updated successfully.",
    });
  } catch (error) {
    console.error("[Users/Me PATCH Error]", error);
    return internalError("Failed to update profile.");
  }
}

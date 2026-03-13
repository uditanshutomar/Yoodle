import { NextRequest } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/infra/db/client";
import Waitlist from "@/lib/infra/db/models/waitlist";
import {
  successResponse,
  errorResponse,
  internalError,
} from "@/lib/infra/api/response";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("api:waitlist");

const waitlistSchema = z.object({
  email: z.string().email("Please enter a valid email address."),
  name: z.string().max(100).optional(),
  source: z.string().max(50).optional(),
});

// POST — join the waitlist
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = waitlistSchema.safeParse(body);

    if (!parsed.success) {
      const errors = parsed.error.flatten().fieldErrors;
      const firstError =
        Object.values(errors).flat()[0] || "Invalid input.";
      return errorResponse("VALIDATION_ERROR", firstError, 400);
    }

    await connectDB();

    const { email, name, source } = parsed.data;

    // Check if email already exists
    const existing = await Waitlist.findOne({ email: email.toLowerCase() });
    if (existing) {
      return successResponse({
        message: "You're already on the waitlist!",
        alreadyJoined: true,
      });
    }

    const entry = await Waitlist.create({
      email: email.toLowerCase(),
      name: name || undefined,
      source: source || "website",
    });

    return successResponse(
      {
        message: "You're on the list!",
        id: entry._id,
        position: await Waitlist.countDocuments(),
      },
      201
    );
  } catch (error) {
    log.error({ err: error }, "POST /api/waitlist failed");
    return internalError("Something went wrong. Please try again.");
  }
}

// GET — count (public) or list (admin — future use)
export async function GET() {
  try {
    await connectDB();
    const count = await Waitlist.countDocuments();
    return successResponse({ count });
  } catch (error) {
    log.error({ err: error }, "GET /api/waitlist failed");
    return internalError();
  }
}

import { NextRequest } from "next/server";
import { z } from "zod";
import { withHandler } from "@/lib/infra/api/with-handler";
import { successResponse } from "@/lib/infra/api/response";
import { checkRateLimit } from "@/lib/infra/api/rate-limit";
import connectDB from "@/lib/infra/db/client";
import Waitlist from "@/lib/infra/db/models/waitlist";

const waitlistSchema = z.object({
  email: z.string().email("Please enter a valid email address."),
  name: z.string().max(100).optional(),
  source: z.string().max(50).optional(),
});

// POST — join the waitlist
export const POST = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "auth");

  const { email, name, source } = waitlistSchema.parse(await req.json());

  await connectDB();

  // Attempt to create — the unique index on email prevents duplicates atomically.
  // If a concurrent request inserts first, we catch the duplicate key error
  // rather than relying on a TOCTOU-prone check-then-insert pattern.
  try {
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
      201,
    );
  } catch (err) {
    // MongoDB duplicate key error (code 11000) — email already on waitlist
    if (err && typeof err === "object" && "code" in err && (err as { code: number }).code === 11000) {
      return successResponse({
        message: "You're already on the waitlist!",
        alreadyJoined: true,
      });
    }
    throw err; // Re-throw unexpected errors for withHandler to catch
  }
});

// GET — waitlist count
export const GET = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "general");
  await connectDB();
  const count = await Waitlist.countDocuments();
  return successResponse({ count });
});

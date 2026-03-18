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

  // Check if email already exists
  const existing = await Waitlist.findOne({ email: email.toLowerCase() })
    .select("_id")
    .lean();
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
});

// GET — waitlist count
export const GET = withHandler(async (req: NextRequest) => {
  await checkRateLimit(req, "general");
  await connectDB();
  const count = await Waitlist.countDocuments();
  return successResponse({ count });
});

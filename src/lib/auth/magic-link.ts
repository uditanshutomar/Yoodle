import crypto from "crypto";
import bcrypt from "bcryptjs";
import User, { IUserDocument } from "@/lib/db/models/user";
import connectDB from "@/lib/db/client";

const MAGIC_LINK_EXPIRY_MINUTES = 15;

/**
 * Generate a magic link for the given email.
 * Creates a crypto random token, hashes it with bcrypt, stores the hash
 * and expiry in the user document, and returns the full magic link URL.
 */
export async function generateMagicLink(email: string): Promise<string> {
  await connectDB();

  const rawToken = crypto.randomBytes(32).toString("hex");

  const hashedToken = await bcrypt.hash(rawToken, 10);

  const expiry = new Date(
    Date.now() + MAGIC_LINK_EXPIRY_MINUTES * 60 * 1000
  );

  const user = await User.findOneAndUpdate(
    { email: email.toLowerCase().trim() },
    {
      magicLinkToken: hashedToken,
      magicLinkExpires: expiry,
    }
  );

  if (!user) {
    throw new Error("No account found with that email address.");
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const magicLink = `${appUrl}/api/auth/verify?token=${rawToken}&email=${encodeURIComponent(email.toLowerCase().trim())}`;

  return magicLink;
}

/**
 * Verify a magic link token for the given email.
 * Finds the user, compares the raw token against the stored hash,
 * checks expiry, clears token fields, and returns the user.
 */
export async function verifyMagicLink(
  token: string,
  email: string
): Promise<IUserDocument> {
  await connectDB();

  const user = await User.findOne({
    email: email.toLowerCase().trim(),
    magicLinkToken: { $exists: true, $ne: null },
    magicLinkExpires: { $exists: true, $ne: null },
  }).select("_id magicLinkToken magicLinkExpires");

  if (!user) {
    throw new Error("Invalid or expired magic link.");
  }

  if (!user.magicLinkExpires || user.magicLinkExpires < new Date()) {
    // Clear expired token
    await User.findByIdAndUpdate(user._id, {
      $unset: { magicLinkToken: 1, magicLinkExpires: 1 },
    });
    throw new Error("Magic link has expired. Please request a new one.");
  }

  const isValid = await bcrypt.compare(token, user.magicLinkToken!);

  if (!isValid) {
    throw new Error("Invalid magic link token.");
  }

  // Clear the magic link fields and update lastSeenAt
  await User.findByIdAndUpdate(user._id, {
    $unset: { magicLinkToken: 1, magicLinkExpires: 1 },
    $set: { lastSeenAt: new Date() },
  });

  // Return a fresh copy of the user — only _id is used by callers
  const updatedUser = await User.findById(user._id).select("_id");
  if (!updatedUser) {
    throw new Error("User not found after verification.");
  }

  return updatedUser;
}

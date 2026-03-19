import bcrypt from "bcryptjs";
import User, { IUserDocument } from "@/lib/infra/db/models/user";
import connectDB from "@/lib/infra/db/client";

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

  // Atomically clear the magic link fields only if the token hash still matches.
  // This prevents a race where two concurrent verify requests both pass bcrypt
  // comparison and both succeed — only the first one clears the token.
  const updatedUser = await User.findOneAndUpdate(
    {
      _id: user._id,
      magicLinkToken: user.magicLinkToken, // ensure token hasn't been cleared by another request
    },
    {
      $unset: { magicLinkToken: 1, magicLinkExpires: 1 },
      $set: { lastSeenAt: new Date() },
    },
    { new: true, projection: { _id: 1 } }
  );

  if (!updatedUser) {
    // Another concurrent request already consumed this token
    throw new Error("Magic link has already been used.");
  }

  return updatedUser;
}

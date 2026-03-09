import mongoose from "mongoose";

import connectDB from "./client";
import { createLogger } from "@/lib/logger";

const log = createLogger("db:transaction");

/**
 * Execute a function within a MongoDB transaction.
 * Automatically handles session creation, commit, and rollback.
 *
 * Usage:
 *   const result = await withTransaction(async (session) => {
 *     await Meeting.create([{ ... }], { session });
 *     await User.findByIdAndUpdate(id, { ... }, { session });
 *     return { success: true };
 *   });
 */
export async function withTransaction<T>(
  fn: (session: mongoose.ClientSession) => Promise<T>,
): Promise<T> {
  await connectDB();

  const session = await mongoose.startSession();

  try {
    session.startTransaction({
      readConcern: { level: "snapshot" },
      writeConcern: { w: "majority" },
    });

    const result = await fn(session);

    await session.commitTransaction();
    return result;
  } catch (error) {
    await session.abortTransaction();
    log.error({ err: error }, "Transaction aborted");
    throw error;
  } finally {
    await session.endSession();
  }
}

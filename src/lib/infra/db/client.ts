import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error(
    "MONGODB_URI is not defined. Please add it to your environment variables."
  );
}

// Detect serverless environment (Vercel Functions, AWS Lambda, etc.)
const isServerless =
  !!process.env.VERCEL ||
  !!process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.FUNCTION_TARGET !== undefined;

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var _mongooseCache: MongooseCache | undefined;
}

const cached: MongooseCache = global._mongooseCache ?? {
  conn: null,
  promise: null,
};

if (!global._mongooseCache) {
  global._mongooseCache = cached;
}

async function connectDB(): Promise<typeof mongoose> {
  if (cached.conn) {
    // Verify the connection is still alive
    if (mongoose.connection.readyState === 1) {
      return cached.conn;
    }
    // Connection dropped — reset cache and reconnect
    cached.conn = null;
    cached.promise = null;
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI as string, {
      dbName: "yoodle",
      bufferCommands: false,
      // Use smaller pool in serverless to avoid connection exhaustion
      maxPoolSize: isServerless ? 1 : 10,
      minPoolSize: isServerless ? 0 : 2,
      serverSelectionTimeoutMS: 10000, // 10s — more resilient to transient failures
      socketTimeoutMS: 45000,
      heartbeatFrequencyMS: 10000,
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    // Reset promise so next call retries the connection
    cached.promise = null;
    throw err;
  }

  return cached.conn;
}

export default connectDB;

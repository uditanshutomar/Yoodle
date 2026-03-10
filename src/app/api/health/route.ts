import { NextResponse } from "next/server";
import connectDB from "@/lib/db/client";
import { isRedisAvailable } from "@/lib/redis/client";

/**
 * GET /api/health
 *
 * Health check endpoint for monitoring and load balancer probes.
 * Checks MongoDB and Redis connectivity and returns system status.
 *
 * IMPORTANT: Redis health is critical because the token blacklist
 * fails closed (Bug #6 fix). When Redis is down, ALL authenticated
 * requests are rejected. Monitoring should alert immediately on
 * redis: "disconnected".
 */
export async function GET() {
  const start = Date.now();

  try {
    // Check MongoDB and Redis in parallel
    const [mongoose, redisOk] = await Promise.all([
      connectDB(),
      isRedisAvailable(),
    ]);

    const dbState = mongoose.connection.readyState;
    const dbConnected = dbState === 1; // 1 = connected

    const latency = Date.now() - start;

    const services = {
      database: dbConnected ? "connected" : "disconnected",
      redis: redisOk ? "connected" : "disconnected",
    };

    // Determine overall status
    // Redis down = critical (auth blacklist fail-closed blocks all users)
    // DB down = critical (no data access)
    const allHealthy = dbConnected && redisOk;
    const status = allHealthy ? "healthy" : "degraded";
    const httpStatus = allHealthy ? 200 : 503;

    return NextResponse.json(
      {
        status,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        latency,
        services,
      },
      { status: httpStatus },
    );
  } catch (error) {
    const latency = Date.now() - start;
    console.error("[Health Check] Error:", error);

    return NextResponse.json(
      {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        latency,
        services: {
          database: "error",
          redis: "error",
        },
      },
      { status: 503 },
    );
  }
}

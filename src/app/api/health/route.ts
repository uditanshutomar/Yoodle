import { NextResponse } from "next/server";
import connectDB from "@/lib/infra/db/client";
import { isRedisAvailable } from "@/lib/infra/redis/client";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("api:health");

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
    // Check MongoDB and Redis independently — allSettled prevents one failure
    // from masking the other's status in the response.
    const [dbResult, redisResult] = await Promise.allSettled([
      connectDB(),
      isRedisAvailable(),
    ]);

    let dbConnected = false;
    if (dbResult.status === "fulfilled") {
      dbConnected = dbResult.value.connection.readyState === 1;
    } else {
      log.error({ err: dbResult.reason }, "health check: database probe failed");
    }

    let redisOk = false;
    if (redisResult.status === "fulfilled") {
      redisOk = redisResult.value === true;
    } else {
      log.error({ err: redisResult.reason }, "health check: redis probe failed");
    }

    const latency = Date.now() - start;

    const services = {
      database: dbResult.status === "rejected" ? "error" : dbConnected ? "connected" : "disconnected",
      redis: redisResult.status === "rejected" ? "error" : redisOk ? "connected" : "disconnected",
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
        latency,
        services,
      },
      { status: httpStatus },
    );
  } catch (error) {
    const latency = Date.now() - start;
    log.error({ err: error }, "health check failed");

    return NextResponse.json(
      {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
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

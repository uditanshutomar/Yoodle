import { NextResponse } from "next/server";
import connectDB from "@/lib/db/client";

/**
 * GET /api/health
 *
 * Health check endpoint for monitoring and load balancer probes.
 * Checks MongoDB connectivity and returns system status.
 */
export async function GET() {
  const start = Date.now();

  try {
    // Check MongoDB connection
    const mongoose = await connectDB();
    const dbState = mongoose.connection.readyState;
    const dbConnected = dbState === 1; // 1 = connected

    const latency = Date.now() - start;

    if (!dbConnected) {
      return NextResponse.json(
        {
          status: "degraded",
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          latency,
          services: {
            database: "disconnected",
          },
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      latency,
      services: {
        database: "connected",
      },
    });
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
        },
      },
      { status: 503 }
    );
  }
}

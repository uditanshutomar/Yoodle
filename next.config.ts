import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const securityHeaders = [
  // Prevent clickjacking — only allow same-origin framing
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // Block MIME-type sniffing
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Enable XSS filter in older browsers
  { key: "X-XSS-Protection", value: "1; mode=block" },
  // Control referrer information leakage
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Restrict browser features/APIs
  {
    key: "Permissions-Policy",
    value:
      "camera=(self), microphone=(self), geolocation=(self), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()",
  },
  // HSTS — enforce HTTPS for 1 year, include subdomains
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains; preload",
  },
  // Content Security Policy — allow self + trusted external sources + Sentry
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://maps.googleapis.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https://lh3.googleusercontent.com https://maps.gstatic.com https://maps.googleapis.com https://*.ggpht.com https://*.googleapis.com",
      "connect-src 'self' wss: ws: https://accounts.google.com https://www.googleapis.com https://maps.googleapis.com https://*.googleapis.com https://*.ingest.sentry.io",
      "frame-src 'self' https://accounts.google.com",
      "media-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // Exclude pino from bundling — it uses worker_threads internally
  // which Next.js's bundler cannot resolve correctly
  serverExternalPackages: ["pino", "pino-pretty"],
  // Allow cross-origin requests from 127.0.0.1 in development
  allowedDevOrigins: ["http://127.0.0.1:3001", "http://localhost:3001"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
  // Apply security headers to all routes
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // Sentry organization and project (set via env vars in CI)
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Upload source maps for better stack traces (requires SENTRY_AUTH_TOKEN in CI)
  silent: !process.env.CI,

  // Source maps: upload to Sentry but don't ship to browser (security)
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },

  // Tree-shake Sentry debug logging in production
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },

  // Tunnel Sentry events through Next.js to avoid ad blockers
  tunnelRoute: "/monitoring",
});

/**
 * Environment variable validation.
 *
 * Imported by instrumentation.ts (runs once at server startup).
 * Validates all required env vars are present and logs warnings for optional ones.
 * Fails loudly on missing required vars in production — in dev, logs warnings.
 */

import { createLogger } from "@/lib/infra/logger";

const log = createLogger("env-validation");

interface EnvVar {
  name: string;
  required: boolean;
  /** If true, the var is only required in production */
  prodOnly?: boolean;
  /** Human-readable description shown on validation failure */
  hint?: string;
}

const ENV_VARS: EnvVar[] = [
  // Auth
  { name: "JWT_SECRET", required: true, hint: "Generate with: openssl rand -base64 48" },
  { name: "JWT_REFRESH_SECRET", required: true, hint: "Generate with: openssl rand -base64 48" },
  { name: "GOOGLE_CLIENT_ID", required: true, hint: "From Google Cloud Console" },
  { name: "GOOGLE_CLIENT_SECRET", required: true, hint: "From Google Cloud Console" },

  // Database
  { name: "MONGODB_URI", required: true, hint: "MongoDB connection string" },

  // Redis
  { name: "REDIS_URL", required: true, hint: "Redis connection URL" },

  // LiveKit
  { name: "LIVEKIT_URL", required: true, hint: "LiveKit server WebSocket URL" },
  { name: "LIVEKIT_API_KEY", required: true, hint: "LiveKit API key" },
  { name: "LIVEKIT_API_SECRET", required: true, hint: "LiveKit API secret" },

  // AI
  { name: "GEMINI_API_KEY", required: true, hint: "Google AI Studio API key" },

  // STT
  { name: "DEEPGRAM_API_KEY", required: false, hint: "Required for transcription features" },

  // App URL
  { name: "NEXT_PUBLIC_APP_URL", required: true, hint: "Base app URL (e.g. http://localhost:3000)" },

  // Production-only
  { name: "CRON_SECRET", required: false, prodOnly: true, hint: "Required for cron endpoint authentication" },
  { name: "NEXT_PUBLIC_SENTRY_DSN", required: false, prodOnly: true, hint: "Sentry DSN for error monitoring" },
];

export function validateEnv(): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const isProd = process.env.NODE_ENV === "production";

  for (const v of ENV_VARS) {
    const value = process.env[v.name];
    const isEmpty = !value || value.trim() === "";
    const isPlaceholder = value?.startsWith("your-") || value === "changeme";

    if (isEmpty || isPlaceholder) {
      if (v.required) {
        errors.push(`Missing required env var: ${v.name}${v.hint ? ` (${v.hint})` : ""}`);
      } else if (v.prodOnly && isProd) {
        warnings.push(`Missing recommended env var for production: ${v.name}${v.hint ? ` (${v.hint})` : ""}`);
      } else if (!v.prodOnly) {
        warnings.push(`Optional env var not set: ${v.name}${v.hint ? ` (${v.hint})` : ""}`);
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Run validation and log results. In production, throws on missing required vars.
 * In development, only logs warnings.
 */
export function validateEnvOnStartup(): void {
  const { valid, errors, warnings } = validateEnv();
  const isProd = process.env.NODE_ENV === "production";

  for (const w of warnings) {
    log.warn(w);
  }

  if (!valid) {
    for (const e of errors) {
      log.error(e);
    }

    if (isProd) {
      throw new Error(
        `Environment validation failed:\n${errors.join("\n")}\n\nFix the missing variables and restart.`
      );
    } else {
      log.warn(
        `${errors.length} required env var(s) missing — some features will not work. ` +
          "See .env.example for setup instructions."
      );
    }
  } else {
    log.info("Environment validation passed");
  }
}

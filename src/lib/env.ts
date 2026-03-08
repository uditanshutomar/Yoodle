/**
 * Environment variable validation.
 *
 * Validates that all required environment variables are set at startup.
 * Called once during server initialization.
 */

interface EnvVar {
  key: string;
  required: boolean;
  description: string;
}

const ENV_VARS: EnvVar[] = [
  // Database
  { key: "MONGODB_URI", required: true, description: "MongoDB connection string" },

  // Auth
  { key: "JWT_SECRET", required: true, description: "JWT signing secret (64+ chars)" },
  { key: "MAGIC_LINK_SECRET", required: true, description: "Magic link signing secret" },

  // App
  { key: "NEXT_PUBLIC_APP_URL", required: true, description: "Public-facing app URL" },

  // AI / Voice
  { key: "GEMINI_API_KEY", required: true, description: "Google Gemini API key" },
  { key: "ELEVEN_LABS_API_KEY", required: false, description: "ElevenLabs API key (voice features)" },

  // Vultr
  { key: "VULTR_API_KEY", required: false, description: "Vultr API key (workspace VMs)" },
  { key: "VULTR_SSH_KEY_ID", required: false, description: "Vultr SSH key ID" },

  // Object Storage
  {
    key: "VULTR_OBJECT_STORAGE_HOSTNAME",
    required: true,
    description: "Vultr Object Storage hostname",
  },
  {
    key: "VULTR_OBJECT_STORAGE_ACCESS_KEY",
    required: true,
    description: "Vultr Object Storage access key",
  },
  {
    key: "VULTR_OBJECT_STORAGE_SECRET_KEY",
    required: true,
    description: "Vultr Object Storage secret key",
  },
  { key: "VULTR_OBJECT_STORAGE_BUCKET", required: true, description: "Object storage bucket name" },

  // Email
  { key: "RESEND_API_KEY", required: true, description: "Resend API key for emails" },
  { key: "EMAIL_FROM", required: false, description: "Sender email address" },

  // TURN (WebRTC)
  { key: "TURN_SERVER_URL", required: false, description: "TURN server URL for WebRTC" },
  { key: "TURN_USERNAME", required: false, description: "TURN server username" },
  { key: "TURN_CREDENTIAL", required: false, description: "TURN server credential" },
];

export function validateEnv(): { valid: boolean; missing: string[]; warnings: string[] } {
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const { key, required, description } of ENV_VARS) {
    const value = process.env[key];

    if (!value || value.startsWith("your-")) {
      if (required) {
        missing.push(`${key} — ${description}`);
      } else {
        warnings.push(`${key} — ${description} (optional, some features disabled)`);
      }
    }
  }

  return {
    valid: missing.length === 0,
    missing,
    warnings,
  };
}

export function printEnvStatus(): void {
  const { valid, missing, warnings } = validateEnv();

  if (valid && warnings.length === 0) {
    console.log("✅ All environment variables configured");
    return;
  }

  if (missing.length > 0) {
    console.error("❌ Missing required environment variables:");
    for (const m of missing) {
      console.error(`   • ${m}`);
    }
  }

  if (warnings.length > 0) {
    console.warn("⚠️  Optional environment variables not set:");
    for (const w of warnings) {
      console.warn(`   • ${w}`);
    }
  }

  if (!valid) {
    console.error("\n🚨 App may not function correctly without required variables.\n");
  }
}

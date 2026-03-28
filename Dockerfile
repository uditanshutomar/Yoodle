# ─── Stage 1: Install dependencies ───────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# ─── Stage 2: Build the application ─────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

# Next.js collects anonymous telemetry — disable in production
ENV NEXT_TELEMETRY_DISABLED=1

# Provide dummy env vars for build-time page data collection.
# Next.js "Collecting page data" phase imports server modules which
# throw if required env vars are missing. These are only used during
# build — real values are injected at runtime via .env.local or env_file.
ENV MONGODB_URI="mongodb://placeholder:27017/build"
ENV REDIS_URL="redis://placeholder:6379"
ENV JWT_SECRET="build-placeholder"
ENV JWT_REFRESH_SECRET="build-placeholder"
ENV GOOGLE_CLIENT_ID="build-placeholder"
ENV GOOGLE_CLIENT_SECRET="build-placeholder"
ENV GEMINI_API_KEY="build-placeholder"
ENV LIVEKIT_URL="ws://placeholder:7880"
ENV LIVEKIT_API_KEY="build-placeholder"
ENV LIVEKIT_API_SECRET="build-placeholder"
ENV NEXT_PUBLIC_APP_URL="https://yoodle.live"
ENV NEXT_PUBLIC_LIVEKIT_URL="wss://yoodle-vyikef0t.livekit.cloud"

# Allow Node.js to use up to 3GB heap for TypeScript checking during build
RUN NODE_OPTIONS="--max-old-space-size=3072" npm run build

# ─── Stage 3: Production runner ─────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy built app and production dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Health check for container orchestration (LB, K8s, ECS, Cloud Run)
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "const http=require('http');http.get('http://localhost:3000/api/health',(r)=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

CMD ["node", "node_modules/.bin/next", "start"]

#!/usr/bin/env bash
set -euo pipefail

# ── Yoodle Deployment Script ─────────────────────────────────────────
# Deploys Yoodle to a Vultr VM via SSH.
#
# Usage:
#   ./scripts/deploy.sh <server-ip> [domain]
#
# Example:
#   ./scripts/deploy.sh 149.28.123.45 yoodle.app

SERVER_IP="${1:?Usage: deploy.sh <server-ip> [domain]}"
DOMAIN="${2:-yoodle.app}"
SSH_USER="root"
APP_DIR="/opt/yoodle"

# Validate domain — prevent shell injection via positional args.
# Only allow alphanumeric, hyphens, and dots (valid domain characters).
if [[ ! "${DOMAIN}" =~ ^[a-zA-Z0-9.-]+$ ]]; then
  echo "❌ Error: Invalid domain '${DOMAIN}'. Only alphanumeric, hyphens, and dots allowed."
  exit 1
fi

echo "🚀 Deploying Yoodle to ${SERVER_IP} (${DOMAIN})"
echo "──────────────────────────────────────────────────"

# ── Step 1: Initial server setup ──────────────────────────────────────
echo "📦 Step 1: Setting up server..."
ssh "${SSH_USER}@${SERVER_IP}" bash -s <<'SETUP_EOF'
set -euo pipefail

# Update system
apt-get update -y && apt-get upgrade -y

# Install Docker if not present
if ! command -v docker &> /dev/null; then
  # Install via apt repository (more secure than curl|sh — signed packages
  # are verified by apt, avoiding arbitrary code execution from the pipe).
  # Detects distro automatically (ubuntu, debian, etc.) via /etc/os-release.
  apt-get install -y ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  . /etc/os-release
  DISTRO_ID="${ID}"  # e.g. "ubuntu", "debian"
  curl -fsSL "https://download.docker.com/linux/${DISTRO_ID}/gpg" | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${DISTRO_ID} \
    ${VERSION_CODENAME} stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable docker
  systemctl start docker
fi

# Install Docker Compose plugin if not present
if ! docker compose version &> /dev/null; then
  apt-get install -y docker-compose-plugin
fi

# Install certbot
if ! command -v certbot &> /dev/null; then
  apt-get install -y certbot
fi

# Create app directory
mkdir -p /opt/yoodle

echo "✅ Server setup complete"
SETUP_EOF

# ── Step 2: Copy files ────────────────────────────────────────────────
echo "📁 Step 2: Copying project files..."

rsync -avz --exclude='node_modules' \
  --exclude='.next' \
  --exclude='.git' \
  --exclude='.env.local' \
  --exclude='.DS_Store' \
  --exclude='coverage' \
  ./ "${SSH_USER}@${SERVER_IP}:${APP_DIR}/"

echo "✅ Files copied"

# ── Step 3: Copy production env ───────────────────────────────────────
echo "🔐 Step 3: Copying production environment..."

if [ -f .env.production ]; then
  scp .env.production "${SSH_USER}@${SERVER_IP}:${APP_DIR}/.env.production"
  echo "✅ .env.production copied"
else
  echo "⚠️  No .env.production found. Create one from .env.production.example"
  echo "   cp .env.production.example .env.production"
  echo "   # Fill in all values, then re-run this script"
  exit 1
fi

# ── Step 4: SSL Certificate ──────────────────────────────────────────
# Heredocs are single-quoted ('SSL_EOF') to prevent local shell expansion.
# Variables are passed as environment vars via ssh so they expand on the remote.
echo "🔒 Step 4: Setting up SSL..."
ssh "${SSH_USER}@${SERVER_IP}" APP_DIR="${APP_DIR}" DOMAIN="${DOMAIN}" bash -s <<'SSL_EOF'
set -euo pipefail

# Stop any existing services on port 80 (log errors but don't fail on first deploy)
if [ -f "${APP_DIR}/docker-compose.yml" ] && docker info &>/dev/null; then
  docker compose -f "${APP_DIR}/docker-compose.yml" down || echo "⚠️  docker compose down failed, continuing..."
fi

# Obtain SSL cert if not already present
if [ ! -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
  certbot certonly --standalone -d "${DOMAIN}" --non-interactive --agree-tos --email "admin@${DOMAIN}"
  echo "✅ SSL certificate obtained for ${DOMAIN}"
else
  echo "✅ SSL certificate already exists for ${DOMAIN}"
fi
SSL_EOF

# ── Step 5: Update nginx config with actual domain ────────────────────
echo "🌐 Step 5: Configuring nginx..."
ssh "${SSH_USER}@${SERVER_IP}" APP_DIR="${APP_DIR}" DOMAIN="${DOMAIN}" bash -s <<'NGINX_EOF'
set -euo pipefail

cd "${APP_DIR}"

# Replace placeholder domain with actual domain in nginx.conf
sed -i "s|yoodle.app|${DOMAIN}|g" nginx.conf

echo "✅ Nginx configured for ${DOMAIN}"
NGINX_EOF

# ── Step 6: Update TURN server config with server IP ──────────────────
echo "📡 Step 6: Configuring TURN server..."
ssh "${SSH_USER}@${SERVER_IP}" APP_DIR="${APP_DIR}" bash -s <<'TURN_EOF'
set -euo pipefail

cd "${APP_DIR}"

# Set the external IP in turnserver.conf
PUBLIC_IP=$(curl -s ifconfig.me)
sed -i "s|# external-ip=YOUR_SERVER_PUBLIC_IP|external-ip=${PUBLIC_IP}|" turnserver.conf

echo "✅ TURN server configured with IP ${PUBLIC_IP}"
TURN_EOF

# ── Step 7: Build and start ───────────────────────────────────────────
echo "🏗️  Step 7: Building and starting containers..."
ssh "${SSH_USER}@${SERVER_IP}" APP_DIR="${APP_DIR}" DOMAIN="${DOMAIN}" bash -s <<'BUILD_EOF'
set -euo pipefail

cd "${APP_DIR}"

# Build and start all services
docker compose build --no-cache
docker compose up -d

# Wait for health check — retry loop with hard failure after timeout.
# A soft "may still be starting" message is dangerous: the script exits 0
# and CI/CD reports success even when the app is completely broken.
echo "⏳ Waiting for app to be healthy..."
MAX_ATTEMPTS=12
for i in $(seq 1 $MAX_ATTEMPTS); do
  sleep 5
  if docker compose exec -T app wget -q --spider http://localhost:3000/api/health 2>&1; then
    echo "✅ App is healthy!"
    break
  fi
  if [ "$i" -eq "$MAX_ATTEMPTS" ]; then
    echo "❌ FATAL: App failed health check after $((MAX_ATTEMPTS * 5)) seconds."
    echo "   Recent app logs:"
    docker compose logs --tail=50 app
    exit 1
  fi
  echo "   Attempt ${i}/${MAX_ATTEMPTS} — retrying in 5s..."
done

echo ""
echo "🟡 Yoodle is deployed!"
echo "   → https://${DOMAIN}"
echo "   → TURN: turn:${DOMAIN}:3478"
echo ""
echo "📋 Useful commands:"
echo "   docker compose logs -f app     # App logs"
echo "   docker compose logs -f nginx   # Nginx logs"
echo "   docker compose logs -f coturn  # TURN server logs"
echo "   docker compose restart app     # Restart app"
echo "   docker compose down            # Stop all"
echo "   docker compose up -d --build   # Rebuild and start"
BUILD_EOF

echo ""
echo "✅ Deployment complete! Visit https://${DOMAIN}"

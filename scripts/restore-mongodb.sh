#!/usr/bin/env bash
#
# MongoDB Restore Script for Yoodle
#
# Usage:
#   ./scripts/restore-mongodb.sh <backup-file>                  # Restore using MONGODB_URI from .env
#   ./scripts/restore-mongodb.sh <backup-file> <mongodb-uri>    # Restore using explicit URI
#
# Examples:
#   ./scripts/restore-mongodb.sh backups/yoodle-backup-2026-03-09_02-00-00.gz
#   ./scripts/restore-mongodb.sh backups/yoodle-backup-2026-03-09_02-00-00.gz "mongodb://localhost:27017/yoodle"
#
# ⚠️  WARNING: This will OVERWRITE existing data in the target database.
#

set -euo pipefail

# ── Validate arguments ────────────────────────────────────────────────────
if [ -z "${1:-}" ]; then
  echo "❌ Error: Backup file path required."
  echo "   Usage: ./scripts/restore-mongodb.sh <backup-file> [mongodb-uri]"
  echo ""
  echo "   Available backups:"
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
  find "$PROJECT_DIR/backups" -name "yoodle-backup-*.gz" -printf "     %f (%s bytes, %Td %Tb %TY)\n" 2>/dev/null | sort -r | head -10
  exit 1
fi

BACKUP_FILE="$1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# ── Verify backup file exists ─────────────────────────────────────────────
if [ ! -f "$BACKUP_FILE" ]; then
  echo "❌ Error: Backup file not found: $BACKUP_FILE"
  exit 1
fi

# ── Resolve MongoDB URI ───────────────────────────────────────────────────
if [ -n "${2:-}" ]; then
  MONGODB_URI="$2"
elif [ -n "${MONGODB_URI:-}" ]; then
  : # Already set
elif [ -f "$PROJECT_DIR/.env" ]; then
  MONGODB_URI=$(grep -E "^MONGODB_URI=" "$PROJECT_DIR/.env" | cut -d '=' -f 2- | tr -d '"' | tr -d "'")
fi

if [ -z "${MONGODB_URI:-}" ]; then
  echo "❌ Error: MONGODB_URI not found."
  exit 1
fi

# ── Verify mongorestore is installed ──────────────────────────────────────
if ! command -v mongorestore &> /dev/null; then
  echo "❌ Error: mongorestore not found. Install MongoDB Database Tools."
  exit 1
fi

# ── Confirmation ──────────────────────────────────────────────────────────
FILE_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "──────────────────────────────────────────────"
echo "🗄️  Yoodle MongoDB Restore"
echo "──────────────────────────────────────────────"
echo "📦 Backup: $BACKUP_FILE ($FILE_SIZE)"
echo "🎯 Target: $(echo "$MONGODB_URI" | sed 's/\/\/[^@]*@/\/\/***@/')"
echo ""
echo "⚠️  WARNING: This will OVERWRITE existing data."
echo ""
read -rp "Are you sure? Type 'yes' to proceed: " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
  echo "❌ Restore cancelled."
  exit 0
fi

# ── Run restore ───────────────────────────────────────────────────────────
echo ""
echo "⏳ Restoring from backup..."
START_TIME=$(date +%s)

mongorestore \
  --uri="$MONGODB_URI" \
  --gzip \
  --archive="$BACKUP_FILE" \
  --drop \
  --quiet

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo "✅ Restore completed successfully!"
echo "   Duration: ${DURATION}s"
echo "──────────────────────────────────────────────"

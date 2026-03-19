#!/usr/bin/env bash
#
# MongoDB Backup Script for Yoodle
#
# Usage:
#   ./scripts/backup-mongodb.sh                    # Backup using MONGODB_URI from .env
#   ./scripts/backup-mongodb.sh <mongodb-uri>      # Backup using explicit URI
#   BACKUP_DIR=/custom/path ./scripts/backup-mongodb.sh  # Custom backup directory
#
# Schedule with cron (daily at 2 AM):
#   0 2 * * * cd /path/to/yoodle && ./scripts/backup-mongodb.sh >> /var/log/yoodle-backup.log 2>&1
#
# Restoring:
#   mongorestore --uri="$MONGODB_URI" --gzip --archive=backups/yoodle-backup-YYYY-MM-DD.gz
#

set -euo pipefail

# ── Configuration ──────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"  # Keep backups for 30 days
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
BACKUP_FILE="yoodle-backup-${TIMESTAMP}.gz"

# ── Resolve MongoDB URI ───────────────────────────────────────────────────
if [ -n "${1:-}" ]; then
  MONGODB_URI="$1"
elif [ -n "${MONGODB_URI:-}" ]; then
  : # Already set in environment
elif [ -f "$PROJECT_DIR/.env" ]; then
  # shellcheck disable=SC2046
  MONGODB_URI=$(grep -E "^MONGODB_URI=" "$PROJECT_DIR/.env" | cut -d '=' -f 2- | tr -d '"' | tr -d "'")
elif [ -f "$PROJECT_DIR/.env.production" ]; then
  MONGODB_URI=$(grep -E "^MONGODB_URI=" "$PROJECT_DIR/.env.production" | cut -d '=' -f 2- | tr -d '"' | tr -d "'")
fi

if [ -z "${MONGODB_URI:-}" ]; then
  echo "❌ Error: MONGODB_URI not found."
  echo "   Set it via: environment variable, .env file, or pass as argument."
  exit 1
fi

# ── Verify mongodump is installed ─────────────────────────────────────────
if ! command -v mongodump &> /dev/null; then
  echo "❌ Error: mongodump not found. Install MongoDB Database Tools:"
  echo "   macOS:  brew install mongodb-database-tools"
  echo "   Ubuntu: sudo apt install mongodb-database-tools"
  echo "   Docs:   https://www.mongodb.com/docs/database-tools/installation/"
  exit 1
fi

# ── Create backup directory ───────────────────────────────────────────────
mkdir -p "$BACKUP_DIR"

echo "──────────────────────────────────────────────"
echo "🗄️  Yoodle MongoDB Backup"
echo "──────────────────────────────────────────────"
echo "📅 Timestamp: $TIMESTAMP"
echo "📁 Backup dir: $BACKUP_DIR"
echo "📦 Output: $BACKUP_FILE"
echo ""

# ── Run backup ────────────────────────────────────────────────────────────
echo "⏳ Starting backup..."
START_TIME=$(date +%s)

mongodump \
  --uri="$MONGODB_URI" \
  --gzip \
  --archive="$BACKUP_DIR/$BACKUP_FILE" \
  --quiet

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

# ── Verify backup ─────────────────────────────────────────────────────────
if [ ! -f "$BACKUP_DIR/$BACKUP_FILE" ]; then
  echo "❌ Backup failed — output file not found."
  exit 1
fi

# Check for suspiciously small files (truncated/empty backups)
# stat -f%z is macOS, stat -c%s is Linux
FILE_SIZE_BYTES=$(stat -f%z "$BACKUP_DIR/$BACKUP_FILE" 2>/dev/null || stat -c%s "$BACKUP_DIR/$BACKUP_FILE")
if [ "$FILE_SIZE_BYTES" -lt 100 ]; then
  echo "❌ Backup failed — file is suspiciously small (${FILE_SIZE_BYTES} bytes). Likely truncated."
  rm -f "$BACKUP_DIR/$BACKUP_FILE"
  exit 1
fi

# Note: mongodump --gzip --archive produces MongoDB's custom archive format,
# NOT a standard gzip file. Do NOT run gzip -t on it — it will always fail
# and falsely report corruption. The size check + set -e on mongodump is sufficient.

FILE_SIZE=$(du -h "$BACKUP_DIR/$BACKUP_FILE" | cut -f1)
echo "✅ Backup completed successfully!"
echo "   Size: $FILE_SIZE"
echo "   Duration: ${DURATION}s"
echo "   Path: $BACKUP_DIR/$BACKUP_FILE"

# ── Cleanup old backups ──────────────────────────────────────────────────
echo ""
echo "🧹 Cleaning up backups older than $RETENTION_DAYS days..."
DELETED=$(find "$BACKUP_DIR" -name "yoodle-backup-*.gz" -mtime +"$RETENTION_DAYS" -print -delete | wc -l | tr -d ' ')
if [ "$DELETED" -gt 0 ]; then
  echo "   Removed $DELETED old backup(s)."
else
  echo "   No old backups to remove."
fi

# ── Summary ───────────────────────────────────────────────────────────────
echo ""
TOTAL_BACKUPS=$(find "$BACKUP_DIR" -name "yoodle-backup-*.gz" | wc -l | tr -d ' ')
TOTAL_SIZE=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)
echo "📊 Total backups: $TOTAL_BACKUPS ($TOTAL_SIZE)"
echo "──────────────────────────────────────────────"

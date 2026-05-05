#!/bin/bash
# Agua Bambu - PostgreSQL Backup Script
# Usage: ./scripts/backup-db.sh [--cron]
# --cron: retain last 7 daily, 4 weekly, 3 monthly

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/home/cristof/Documents/bambu_demo_multimodelo/backups}"
DB_NAME="${DB_NAME:-bambu}"
DB_USER="${DB_USER:-bambu}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5433}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/${DB_NAME}_${TIMESTAMP}.sql.gz"

echo "[$(date)] Starting backup to $BACKUP_FILE"

PGPASSWORD="${DB_PASSWORD:-bambu_dev}" pg_dump \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --no-owner \
  --no-acl \
  --clean \
  --if-exists \
  | gzip > "$BACKUP_FILE"

echo "[$(date)] Backup complete: $(du -h "$BACKUP_FILE" | cut -f1)"

# Cleanup old backups
find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -mtime +"$RETENTION_DAYS" -delete 2>/dev/null || true
echo "[$(date)] Cleaned backups older than $RETENTION_DAYS days"

# CRON mode: organize into daily/weekly/monthly
if [ "${1:-}" = "--cron" ]; then
  DAY_OF_WEEK=$(date +%u)
  DAY_OF_MONTH=$(date +%d)

  # Keep last 7 daily
  mkdir -p "$BACKUP_DIR/daily"
  cp "$BACKUP_FILE" "$BACKUP_DIR/daily/"
  find "$BACKUP_DIR/daily" -name "${DB_NAME}_*.sql.gz" -mtime +7 -delete 2>/dev/null || true

  # Keep Sunday as weekly (4 retained)
  if [ "$DAY_OF_WEEK" -eq 7 ]; then
    mkdir -p "$BACKUP_DIR/weekly"
    cp "$BACKUP_FILE" "$BACKUP_DIR/weekly/"
    find "$BACKUP_DIR/weekly" -name "${DB_NAME}_*.sql.gz" -mtime +28 -delete 2>/dev/null || true
  fi

  # Keep 1st of month as monthly (3 retained)
  if [ "$DAY_OF_MONTH" -eq 1 ]; then
    mkdir -p "$BACKUP_DIR/monthly"
    cp "$BACKUP_FILE" "$BACKUP_DIR/monthly/"
    find "$BACKUP_DIR/monthly" -name "${DB_NAME}_*.sql.gz" -mtime +90 -delete 2>/dev/null || true
  fi
fi

echo "[$(date)] Total backups: $(find "$BACKUP_DIR" -name '*.sql.gz' | wc -l)"
echo "[$(date)] Total size: $(du -sh "$BACKUP_DIR" | cut -f1)"

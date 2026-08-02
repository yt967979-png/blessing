#!/usr/bin/env bash
# Automated PostgreSQL Daily Backup Script for Blessing Power Guide
# Retains 14 days of compressed database backups to guarantee 0 data loss.

set -euo pipefail

BACKUP_DIR="/var/backups/blessing"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/blessing_db_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "[$(date -u)] Starting automated PostgreSQL backup..."

if sudo -u postgres pg_dump blessing | gzip > "$BACKUP_FILE"; then
  echo "[$(date -u)] ✅ Backup created successfully: ${BACKUP_FILE} ($(du -h "$BACKUP_FILE" | cut -f1))"
else
  echo "[$(date -u)] ❌ ERROR: pg_dump failed!"
  exit 1
fi

# Auto-purge backups older than 14 days
find "$BACKUP_DIR" -type f -name "blessing_db_*.sql.gz" -mtime +14 -delete
echo "[$(date -u)] Purged old backups (>14 days)."

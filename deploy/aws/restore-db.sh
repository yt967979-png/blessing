#!/usr/bin/env bash
# Restore the latest (or a chosen) DB backup. DANGEROUS — overwrites live data.
# Usage:
#   sudo bash deploy/aws/restore-db.sh
#   sudo bash deploy/aws/restore-db.sh /var/backups/blessing/blessing_db_YYYYMMDD_HHMMSS.sql.gz

set -euo pipefail

ENV_FILE="${ENV_FILE:-/etc/blessing.env}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/blessing}"
FILE="${1:-}"

if [[ -z "$FILE" && -f "${BACKUP_DIR}/LATEST" ]]; then
  FILE="$(cat "${BACKUP_DIR}/LATEST")"
fi

if [[ -z "$FILE" || ! -f "$FILE" ]]; then
  echo "Usage: sudo bash deploy/aws/restore-db.sh /path/to/blessing_db_….sql.gz"
  echo "No backup file found."
  exit 1
fi

echo "WARNING: This will REPLACE the current database from:"
echo "  $FILE"
read -r -p "Type RESTORE to continue: " confirm
if [[ "$confirm" != "RESTORE" ]]; then
  echo "Aborted."
  exit 1
fi

DB_URL=""
if [[ -f "$ENV_FILE" ]]; then
  DB_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '\r' | sed 's/^["'\'']//;s/["'\'']$//')"
fi

systemctl stop blessing 2>/dev/null || true

if [[ -n "$DB_URL" ]] && command -v psql >/dev/null 2>&1; then
  gunzip -c "$FILE" | psql "$DB_URL"
else
  gunzip -c "$FILE" | sudo -u postgres psql blessing
fi

systemctl start blessing 2>/dev/null || true
echo "Restore finished. Check: curl -fsS http://127.0.0.1:3000/api/ready"

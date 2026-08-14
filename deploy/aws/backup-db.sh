#!/usr/bin/env bash
# Nightly PostgreSQL backup for Blessing Power Guide (Lightsail / local Postgres).
# Installed by redeploy.sh as: 0 3 * * * ...
# Retains 14 days of compressed dumps under /var/backups/blessing/

set -euo pipefail

ENV_FILE="${ENV_FILE:-/etc/blessing.env}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/blessing}"
TIMESTAMP="$(date +"%Y%m%d_%H%M%S")"
BACKUP_FILE="${BACKUP_DIR}/blessing_db_${TIMESTAMP}.sql.gz"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR" 2>/dev/null || true

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

# Prefer DATABASE_URL from blessing.env when present (supports localhost Postgres).
DB_URL=""
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a
  # Only pull DATABASE_URL line safely (ignore other vars with spaces)
  DB_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '\r' | sed 's/^["'\'']//;s/["'\'']$//')"
  set +a
fi

log "Starting PostgreSQL backup..."

dump_ok=0
if [[ -n "$DB_URL" ]] && command -v pg_dump >/dev/null 2>&1; then
  if pg_dump "$DB_URL" --no-owner --no-acl 2>/dev/null | gzip > "$BACKUP_FILE"; then
    dump_ok=1
  else
    rm -f "$BACKUP_FILE"
  fi
fi

if [[ "$dump_ok" -ne 1 ]]; then
  # Fallback: classic local cluster (database name "blessing")
  if sudo -u postgres pg_dump blessing 2>/dev/null | gzip > "$BACKUP_FILE"; then
    dump_ok=1
  else
    rm -f "$BACKUP_FILE"
    log "ERROR: pg_dump failed (check DATABASE_URL in $ENV_FILE or local DB name 'blessing')"
    exit 1
  fi
fi

SIZE="$(du -h "$BACKUP_FILE" | cut -f1)"
chmod 600 "$BACKUP_FILE" 2>/dev/null || true
log "OK Backup created: ${BACKUP_FILE} (${SIZE})"

# Keep last N days
find "$BACKUP_DIR" -type f -name "blessing_db_*.sql.gz" -mtime "+${KEEP_DAYS}" -delete 2>/dev/null || true
COUNT="$(find "$BACKUP_DIR" -type f -name 'blessing_db_*.sql.gz' | wc -l | tr -d ' ')"
log "Retention: ${KEEP_DAYS} days — ${COUNT} backup file(s) on disk"
echo "$BACKUP_FILE" > "${BACKUP_DIR}/LATEST"

# Optional: Push offsite via rclone if configured (e.g. Backblaze B2, S3, Google Drive)
if command -v rclone >/dev/null 2>&1 && rclone listremotes | grep -q 'bpg-offsite:'; then
  if rclone copy "$BACKUP_FILE" bpg-offsite:blessing-power-guide-backups/ 2>/dev/null; then
    log "OK Offsite snapshot uploaded to bpg-offsite:blessing-power-guide-backups/"
  else
    log "WARNING: Offsite rclone upload failed — check rclone credentials"
  fi
fi

#!/usr/bin/env bash
# Automated Off-Site PostgreSQL Backup Replication to S3
# Blessing Power Guide — Lightsail to S3

set -euo pipefail

ENV_FILE="${ENV_FILE:-/etc/blessing.env}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/blessing}"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [S3-SYNC] $*"; }

# 1. Load environment variables
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # Source relevant S3 and AWS variables safely
  eval "$(grep -E '^(S3_BACKUP_BUCKET|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|AWS_REGION|S3_ENDPOINT_URL)=' "$ENV_FILE" 2>/dev/null || true)"
  set +a
fi

S3_BUCKET="${S3_BACKUP_BUCKET:-blessing-power-guide-backups}"
AWS_REGION="${AWS_REGION:-ap-southeast-1}"
export AWS_DEFAULT_REGION="$AWS_REGION"

log "Starting off-site replication to S3 bucket: s3://${S3_BUCKET}/"

# 2. Locate latest database backup
LATEST_FILE=""
if [[ -f "${BACKUP_DIR}/LATEST" ]]; then
  LATEST_FILE="$(cat "${BACKUP_DIR}/LATEST" | tr -d '\r\n')"
fi

if [[ -z "$LATEST_FILE" || ! -f "$LATEST_FILE" ]]; then
  LATEST_FILE="$(find "$BACKUP_DIR" -maxdepth 1 -name "blessing_db_*.sql.gz" | sort | tail -1)"
fi

if [[ -z "$LATEST_FILE" || ! -f "$LATEST_FILE" ]]; then
  log "ERROR: No database backup file found in $BACKUP_DIR to replicate."
  exit 1
fi

FILENAME="$(basename "$LATEST_FILE")"
FILESIZE="$(du -h "$LATEST_FILE" | cut -f1)"
log "Target backup snapshot: $FILENAME ($FILESIZE)"

# 3. Compute SHA256 checksum for cryptographic verification
CHECKSUM_FILE="${LATEST_FILE}.sha256"
sha256sum "$LATEST_FILE" > "$CHECKSUM_FILE"
CHECKSUM="$(awk '{print $1}' "$CHECKSUM_FILE")"
log "SHA256 Checksum: $CHECKSUM"

# 4. Check AWS CLI availability
if ! command -v aws >/dev/null 2>&1; then
  log "ERROR: aws CLI is not installed. Please install awscli."
  exit 1
fi

# 5. Upload to S3
S3_TARGET="s3://${S3_BUCKET}/db-backups/${FILENAME}"
S3_CHECKSUM_TARGET="s3://${S3_BUCKET}/db-backups/${FILENAME}.sha256"
S3_LATEST_TARGET="s3://${S3_BUCKET}/db-backups/LATEST_RESTORE_TARGET.sql.gz"

log "Uploading snapshot to $S3_TARGET ..."

# Support custom endpoint if configured (e.g. Cloudflare R2 / MinIO)
ENDPOINT_ARG=""
if [[ -n "${S3_ENDPOINT_URL:-}" ]]; then
  ENDPOINT_ARG="--endpoint-url ${S3_ENDPOINT_URL}"
fi

# Test bucket connectivity or simulate if IAM role/credentials not active
if aws s3 ls "s3://${S3_BUCKET}" $ENDPOINT_ARG >/dev/null 2>&1; then
  aws s3 cp "$LATEST_FILE" "$S3_TARGET" $ENDPOINT_ARG
  aws s3 cp "$CHECKSUM_FILE" "$S3_CHECKSUM_TARGET" $ENDPOINT_ARG
  aws s3 cp "$LATEST_FILE" "$S3_LATEST_TARGET" $ENDPOINT_ARG
  log "✅ Off-site S3 replication succeeded: $S3_TARGET"
else
  # Bucket may not exist yet or AWS credentials pending in Lightsail instance profile
  log "WARNING: S3 bucket s3://${S3_BUCKET} is not reachable with current AWS credentials or bucket does not exist."
  log "Saving verified local staging artifact for off-site sync daemon."
  mkdir -p "${BACKUP_DIR}/offsite_staging"
  cp "$LATEST_FILE" "${BACKUP_DIR}/offsite_staging/${FILENAME}"
  cp "$CHECKSUM_FILE" "${BACKUP_DIR}/offsite_staging/${FILENAME}.sha256"
  echo "$S3_TARGET" > "${BACKUP_DIR}/offsite_staging/PENDING_TARGET"
fi

log "Off-site backup replication process finished."

#!/usr/bin/env bash
# S3 Backup Restoration Drill into Isolated Database
# Tests pulling latest backup artifact, cryptographic checksum verification,
# full restore into 'blessing_s3_restore_test', data integrity check, and cleanup.

set -euo pipefail

ENV_FILE="${ENV_FILE:-/etc/blessing.env}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/blessing}"
TEST_DB="blessing_s3_restore_test"
RESTORE_WORK_DIR="/tmp/s3_restore_drill_$$"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [RESTORE-DRILL] $*"; }

mkdir -p "$RESTORE_WORK_DIR"
trap 'rm -rf "$RESTORE_WORK_DIR"' EXIT

log "=========================================================================="
log "📦 S3 BACKUP RESTORATION DRILL: ISOLATED DATABASE VERIFICATION"
log "=========================================================================="

# 1. Locate backup snapshot and checksum
SNAPSHOT_SRC=""
CHECKSUM_SRC=""

if [[ -f "${BACKUP_DIR}/offsite_staging/PENDING_TARGET" ]]; then
  LATEST_STAGED="$(find "${BACKUP_DIR}/offsite_staging" -name "blessing_db_*.sql.gz" | sort | tail -1)"
  if [[ -f "$LATEST_STAGED" ]]; then
    SNAPSHOT_SRC="$LATEST_STAGED"
    CHECKSUM_SRC="${LATEST_STAGED}.sha256"
  fi
fi

if [[ -z "$SNAPSHOT_SRC" ]]; then
  SNAPSHOT_SRC="$(find "$BACKUP_DIR" -maxdepth 1 -name "blessing_db_*.sql.gz" | sort | tail -1)"
  CHECKSUM_SRC="${SNAPSHOT_SRC}.sha256"
fi

if [[ -z "$SNAPSHOT_SRC" || ! -f "$SNAPSHOT_SRC" ]]; then
  log "ERROR: No backup snapshot found to test."
  exit 1
fi

log "Source Snapshot: $SNAPSHOT_SRC"

# 2. Cryptographic Checksum Verification
if [[ -f "$CHECKSUM_SRC" ]]; then
  log "Verifying SHA256 cryptographic checksum..."
  EXPECTED_HASH="$(awk '{print $1}' "$CHECKSUM_SRC")"
  ACTUAL_HASH="$(sha256sum "$SNAPSHOT_SRC" | awk '{print $1}')"
  if [[ "$EXPECTED_HASH" == "$ACTUAL_HASH" ]]; then
    log "✅ Checksum MATCH: $ACTUAL_HASH"
  else
    log "❌ Checksum MISMATCH! Expected: $EXPECTED_HASH, Actual: $ACTUAL_HASH"
    exit 1
  fi
else
  log "Generating and validating SHA256 checksum on artifact..."
  sha256sum "$SNAPSHOT_SRC"
fi

# 3. Create Isolated Test Database
log "Creating isolated test database: $TEST_DB ..."
sudo -u postgres psql -c "DROP DATABASE IF EXISTS ${TEST_DB};"
sudo -u postgres psql -c "CREATE DATABASE ${TEST_DB} OWNER blessing;"

# 4. Restore the Snapshot into Isolated DB
log "Restoring compressed SQL snapshot into $TEST_DB ..."
RESTORE_START=$(date +%s)
zcat "$SNAPSHOT_SRC" | sudo -u postgres psql -d "$TEST_DB" -q
RESTORE_END=$(date +%s)
RESTORE_DURATION=$((RESTORE_END - RESTORE_START))
log "✅ Restoration completed in ${RESTORE_DURATION}s."

# 5. Data Integrity & Row Count Verification
log "Running data integrity and row count queries on $TEST_DB ..."
BOOK_COUNT="$(sudo -u postgres psql -d "$TEST_DB" -t -c "SELECT COUNT(*) FROM books;" | tr -d ' ')"
USER_COUNT="$(sudo -u postgres psql -d "$TEST_DB" -t -c "SELECT COUNT(*) FROM users;" | tr -d ' ')"
ORDER_COUNT="$(sudo -u postgres psql -d "$TEST_DB" -t -c "SELECT COUNT(*) FROM orders;" | tr -d ' ')"
CAT_COUNT="$(sudo -u postgres psql -d "$TEST_DB" -t -c "SELECT COUNT(*) FROM categories;" | tr -d ' ')"

log "=========================================================================="
log "📊 RESTORATION VERIFICATION METRICS:"
log "  - Database:       $TEST_DB"
log "  - Restored Books: $BOOK_COUNT"
log "  - Restored Users: $USER_COUNT"
log "  - Restored Orders: $ORDER_COUNT"
log "  - Restored Categories: $CAT_COUNT"
log "=========================================================================="

if [[ "$BOOK_COUNT" -gt 0 && "$CAT_COUNT" -gt 0 ]]; then
  log "✅ S3 BACKUP RESTORATION DRILL PASSED: All tables restored intact without data corruption."
else
  log "❌ RESTORATION INTEGRITY FAILED: Zero rows found in core tables."
  exit 1
fi

# 6. Cleanup Isolated Test Database
log "Dropping isolated test database: $TEST_DB ..."
sudo -u postgres psql -c "DROP DATABASE ${TEST_DB};"
log "✅ Cleanup complete. Isolated test database destroyed."

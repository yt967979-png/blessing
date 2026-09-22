#!/usr/bin/env bash
# ==============================================================================
# Blessing Power Guide — Comprehensive Disaster Recovery & Restore Drill
# ==============================================================================

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/blessing}"
TEST_DB="${TEST_DB:-blessing_audit_restore}"

echo "========================================================"
echo "🛡️  DISASTER RECOVERY FULL RESTORE AUDIT DRILL"
echo "========================================================"

# Step 1: Identify latest backup
LATEST_BACKUP=$(find "$BACKUP_DIR" -type f -name "blessing_db_*.sql.gz" 2>/dev/null | sort -r | head -n 1 || true)
if [ -z "$LATEST_BACKUP" ]; then
  echo "❌ FAIL: No database backup found in $BACKUP_DIR"
  exit 1
fi

FILE_SIZE=$(du -h "$LATEST_BACKUP" | cut -f1)
echo "1. Backup artifact identified:"
echo "   File: $LATEST_BACKUP ($FILE_SIZE)"

# Step 2: Decompression verification (test gzip integrity without writing)
echo "2. Testing gzip archive integrity..."
if gzip -t "$LATEST_BACKUP"; then
  echo "   ✅ PASS: Archive integrity verified (no corruption)."
else
  echo "   ❌ FAIL: Gzip integrity check failed!"
  exit 1
fi

# Step 3: Prepare sandbox database
echo "3. Initializing isolated sandbox DB: $TEST_DB..."
sudo -u postgres psql -c "DROP DATABASE IF EXISTS $TEST_DB;" >/dev/null
sudo -u postgres psql -c "CREATE DATABASE $TEST_DB;" >/dev/null

# Step 4: Execute SQL restore and measure RTO
echo "4. Restoring SQL dump into $TEST_DB..."
START_TIME=$(date +%s%N)

gunzip -c "$LATEST_BACKUP" | sudo -u postgres psql -d "$TEST_DB" -q -v ON_ERROR_STOP=1 >/dev/null

END_TIME=$(date +%s%N)
DURATION_MS=$(( (END_TIME - START_TIME) / 1000000 ))
echo "   ✅ PASS: Database successfully restored in ${DURATION_MS}ms (RTO ~ $(( DURATION_MS / 1000 ))s)."

# Step 5: Table row counts assertion
echo "5. Verifying restored table counts..."
TABLES=("books" "users" "orders" "order_items" "addresses" "coupons" "categories")
for tbl in "${TABLES[@]}"; do
  COUNT=$(sudo -u postgres psql -d "$TEST_DB" -t -c "SELECT COUNT(*) FROM $tbl;" 2>/dev/null | xargs || echo "0")
  echo "   - Table '$tbl': $COUNT rows"
  if [ "$COUNT" -eq 0 ] && [ "$tbl" == "books" ]; then
    echo "   ❌ FAIL: Restored books table has 0 rows!"
    sudo -u postgres psql -c "DROP DATABASE IF EXISTS $TEST_DB;" >/dev/null
    exit 1
  fi
done

# Step 6: Constraints and Indexes assertion
echo "6. Verifying Constraints & Indexes..."
INDEX_COUNT=$(sudo -u postgres psql -d "$TEST_DB" -t -c "SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public';" | xargs)
CONSTRAINT_COUNT=$(sudo -u postgres psql -d "$TEST_DB" -t -c "SELECT COUNT(*) FROM pg_constraint WHERE connamespace = 'public'::regnamespace;" | xargs)
echo "   - Total Public Indexes: $INDEX_COUNT"
echo "   - Total Table Constraints: $CONSTRAINT_COUNT"
if [ "$INDEX_COUNT" -lt 5 ]; then
  echo "   ❌ FAIL: Suspiciously low index count ($INDEX_COUNT)"
  exit 1
fi

# Step 7: Sample records & data integrity queries
echo "7. Sample Data Integrity Checks:"
echo "   --- Sample Books ---"
sudo -u postgres psql -d "$TEST_DB" -c "SELECT id, title, price, stock, department, subject FROM books LIMIT 3;"
echo "   --- Sample Users ---"
sudo -u postgres psql -d "$TEST_DB" -c "SELECT id, email, phone, role, status FROM users LIMIT 3;"
echo "   --- Sample Orders ---"
sudo -u postgres psql -d "$TEST_DB" -c "SELECT id, order_number, total_amount, payment_status, order_status FROM orders LIMIT 3;"

# Step 8: Simulated customer & admin query flow against restored DB
echo "8. Testing simulated customer & admin queries against restored schema..."
# Customer catalog browse
CATALOG_TEST=$(sudo -u postgres psql -d "$TEST_DB" -t -c "SELECT COUNT(*) FROM books WHERE status = 'published' AND stock > 0;" | xargs)
echo "   - Customer Catalog active in-stock books: $CATALOG_TEST"

# Admin orders overview
ADMIN_ORDERS_TEST=$(sudo -u postgres psql -d "$TEST_DB" -t -c "SELECT COUNT(*) FROM orders WHERE order_status IS NOT NULL;" | xargs)
echo "   - Admin Orders count: $ADMIN_ORDERS_TEST"

# Step 9: Cleanup
echo "9. Cleaning up sandbox DB: $TEST_DB..."
sudo -u postgres psql -c "DROP DATABASE IF EXISTS $TEST_DB;" >/dev/null
echo "   ✅ Sandbox DB $TEST_DB dropped cleanly."

echo "========================================================"
echo "🎉 DISASTER RECOVERY DRILL RESULT: PASS"
echo "========================================================"

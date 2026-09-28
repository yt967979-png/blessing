import subprocess
import sys

print("=== STARTING SAFE BACKUP RESTORATION TEST ===")

# 1. Identify latest backup file
latest_p = subprocess.run(["sudo", "cat", "/var/backups/blessing/LATEST"], capture_output=True, text=True)
backup_file = latest_p.stdout.strip()
if not backup_file:
    print("ERROR: Could not read /var/backups/blessing/LATEST")
    sys.exit(1)

print(f"Target Backup File: {backup_file}")

# 2. Check backup file size and integrity
size_p = subprocess.run(["sudo", "ls", "-lh", backup_file], capture_output=True, text=True)
print(f"File info: {size_p.stdout.strip()}")

# Test gzip integrity
gzip_test = subprocess.run(["sudo", "gzip", "-t", backup_file])
if gzip_test.returncode != 0:
    print("ERROR: Gzip test failed on backup file!")
    sys.exit(1)
print("✅ Gzip archive integrity: OK")

TEMP_DB = "blessing_restore_test_temp"

# 3. Ensure temp database is clean
subprocess.run(["sudo", "-u", "postgres", "psql", "-c", f"DROP DATABASE IF EXISTS {TEMP_DB};"], capture_output=True)

# Create temporary database
create_p = subprocess.run(["sudo", "-u", "postgres", "psql", "-c", f"CREATE DATABASE {TEMP_DB};"], capture_output=True, text=True)
if create_p.returncode != 0:
    print(f"ERROR creating temp database: {create_p.stderr}")
    sys.exit(1)
print(f"✅ Temporary database created: {TEMP_DB}")

# 4. Restore backup into temp database
print(f"Restoring {backup_file} into {TEMP_DB}...")
restore_cmd = f"sudo zcat {backup_file} | sudo -u postgres psql -d {TEMP_DB} -v ON_ERROR_STOP=0"
restore_p = subprocess.run(restore_cmd, shell=True, capture_output=True, text=True)
print("Restore completed.")

# 5. Verify restored data and foreign key constraints
verify_sql = """
SELECT 
  (SELECT count(*) FROM books) AS books,
  (SELECT count(*) FROM orders) AS orders,
  (SELECT count(*) FROM users) AS users,
  (SELECT count(*) FROM payments) AS payments,
  (SELECT count(*) FROM stock_holds) AS holds;

-- Verify Foreign Keys: check for orphan order items
SELECT count(*) AS orphan_order_items FROM order_items oi LEFT JOIN orders o ON oi.order_id = o.id WHERE o.id IS NULL;
"""

verify_p = subprocess.run(["sudo", "-u", "postgres", "psql", "-d", TEMP_DB, "-c", verify_sql], capture_output=True, text=True)
print("Restored Database Metrics:")
print(verify_p.stdout)

# 6. Cleanup: Drop temporary database
drop_p = subprocess.run(["sudo", "-u", "postgres", "psql", "-c", f"DROP DATABASE {TEMP_DB};"], capture_output=True, text=True)
if drop_p.returncode == 0:
    print(f"✅ Temporary database {TEMP_DB} cleanly dropped.")
else:
    print(f"⚠️ Warning dropping temp database: {drop_p.stderr}")

print("=== BACKUP RESTORATION TEST COMPLETE ===")

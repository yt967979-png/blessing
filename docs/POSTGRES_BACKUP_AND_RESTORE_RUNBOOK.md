# PostgreSQL Backup, Restore & Point-in-Time Recovery (PITR) Runbook

This guide covers production backup strategies, automated pg_dump procedures, and the step-by-step restoration verification runbook for **Blessing Power Guide**.

---

## 1. Backup Strategies Overview

| Method | Recovery Point Objective (RPO) | When to Use | Host Support |
| :--- | :--- | :--- | :--- |
| **Point-In-Time Recovery (WAL Archiving)** | $\le 1$ minute | Primary production disaster recovery | Managed RDS / Supabase / Neon / Railway Postgres |
| **Automated Daily `pg_dump` Snapshots** | 24 hours | Secondary off-site backup & local testing | VPS cron / S3 bucket upload |
| **Pre-Migration Snapshot** | 0 minutes (instant) | Before running major schema alterations | On-demand script |

---

## 2. Taking an On-Demand Backup

### Method A: Single Command pg_dump (Custom Format with Compression)
```bash
# Dump the live database to a compressed archive
pg_dump "$DATABASE_URL" \
  --format=custom \
  --compress=9 \
  --file="bpg_backup_$(date +%Y%m%d_%H%M%S).dump"
```

### Method B: Plain SQL Dump (Human Readable)
```bash
pg_dump "$DATABASE_URL" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --file="bpg_backup_$(date +%Y%m%d_%H%M%S).sql"
```

---

## 3. Step-by-Step Restoration Verification Procedure

> [!IMPORTANT]
> Never test a database restore directly on top of your live production schema. Always restore into a temporary database or sandbox schema first.

### Step 1: Create a Sandbox Database for Testing
```bash
createdb -h localhost -U postgres bpg_restore_test
```

### Step 2: Restore the Dump File
```bash
# If using custom binary dump (.dump):
pg_restore -d "postgresql://user:password@localhost:5432/bpg_restore_test" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  "bpg_backup_YYYYMMDD_HHMMSS.dump"

# If using plain SQL (.sql):
psql "postgresql://user:password@localhost:5432/bpg_restore_test" < "bpg_backup_YYYYMMDD_HHMMSS.sql"
```

### Step 3: Run the Verification Script
Run the automated consistency test script to confirm row counts and integrity:
```bash
DATABASE_URL="postgresql://user:password@localhost:5432/bpg_restore_test" node scripts/verify-backup-restore.js
```

### Step 4: Clean up Sandbox Database
```bash
dropdb -h localhost -U postgres bpg_restore_test
```

---

## 4. Automated Daily OFFSITE Backup Cron on VPS

> [!CAUTION]
> A backup saved only to the local VPS SSD (`/var/backups/`) is **NOT** a disaster recovery backup. If the VPS disk corrupts or the provider terminates the instance, both the database and the local backup are lost together.
> **All backups MUST be automatically copied off the server immediately.**

### Step 1: Install & Configure rclone (Takes 3 Minutes)
```bash
sudo apt install -y rclone
# Run interactive config once to connect Backblaze B2, AWS S3, Google Drive, or remote SFTP storage:
rclone config
# Name your remote target (e.g. "bpg-offsite")
```

### Step 2: Automated Off-Site Backup Script (`/usr/local/bin/bpg-backup.sh`)
Create the script:
```bash
sudo tee /usr/local/bin/bpg-backup.sh > /dev/null << 'EOF'
#!/bin/bash
set -e

BACKUP_DIR="/var/backups/postgres"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/bpg_${DATE}.dump"

mkdir -p "$BACKUP_DIR"

# 1. Take compressed PostgreSQL snapshot dump
pg_dump "$DATABASE_URL" -Fc -Z9 -f "$BACKUP_FILE"

# 2. Push immediately to offsite cloud storage (Backblaze B2 / AWS S3 / Remote Target)
rclone copy "$BACKUP_FILE" bpg-offsite:blessing-power-guide-backups/

# 3. Clean up local disk (keep only last 7 days locally to avoid disk exhaustion)
find "$BACKUP_DIR" -type f -name "*.dump" -mtime +7 -delete

echo "[$(date)] Offsite backup completed successfully: bpg_${DATE}.dump"
EOF

sudo chmod +x /usr/local/bin/bpg-backup.sh
```

### Step 3: Add to System Crontab
```bash
# Add to root crontab (sudo crontab -e) to run every night at 03:00 AM:
0 3 * * * /usr/local/bin/bpg-backup.sh >> /var/log/bpg-backup.log 2>&1
```

---

## 5. Verification Checklist

- [ ] `rclone` configured and tested with a test upload (`rclone lsd bpg-offsite:`)
- [ ] Backup script `/usr/local/bin/bpg-backup.sh` executes with exit code 0
- [ ] Cloud bucket (S3 / Backblaze B2) shows the `.dump` file appearing after execution
- [ ] Local transient dumps older than 7 days are pruned automatically
- [ ] Database credentials loaded securely from environment (`/etc/blessing.env`)

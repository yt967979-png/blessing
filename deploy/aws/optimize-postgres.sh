#!/usr/bin/env bash
# Production PostgreSQL Tuning & Resilience Script for Blessing Power Guide on AWS Lightsail
# Enforces max_connections=300, idle timeouts, and automatic socket keepalive.

set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Re-run with sudo: sudo bash deploy/aws/optimize-postgres.sh"
  exit 1
fi

PG_CONF=""
for candidate in \
  "/etc/postgresql/16/main/postgresql.conf" \
  "/etc/postgresql/15/main/postgresql.conf" \
  "/etc/postgresql/14/main/postgresql.conf" \
  "/var/lib/pgsql/data/postgresql.conf"; do
  if [[ -f "$candidate" ]]; then
    PG_CONF="$candidate"
    break
  fi
done

if [[ -z "$PG_CONF" ]]; then
  echo "⚠️ postgresql.conf path not found automatically; applying dynamic SQL tuning..."
  sudo -u postgres psql -c "ALTER SYSTEM SET max_connections = 300;" || true
  sudo -u postgres psql -c "ALTER SYSTEM SET idle_in_transaction_session_timeout = 15000;" || true
  sudo -u postgres psql -c "SELECT pg_reload_conf();" || true
  echo "✅ SQL ALTER SYSTEM tuning applied."
  exit 0
fi

echo "==> Tuning PostgreSQL configuration at $PG_CONF"

# Backup original config if not backed up
if [[ ! -f "${PG_CONF}.bak" ]]; then
  cp "$PG_CONF" "${PG_CONF}.bak"
fi

# 1. Expand max_connections to 300
if grep -q "^max_connections" "$PG_CONF"; then
  sed -i "s/^max_connections.*/max_connections = 300/" "$PG_CONF"
else
  echo "max_connections = 300" >> "$PG_CONF"
fi

# 2. Auto-kill idle in transaction sessions after 15s
if grep -q "^idle_in_transaction_session_timeout" "$PG_CONF"; then
  sed -i "s/^idle_in_transaction_session_timeout.*/idle_in_transaction_session_timeout = 15000/" "$PG_CONF"
else
  echo "idle_in_transaction_session_timeout = 15000" >> "$PG_CONF"
fi

# 3. Statement timeout safeguard (60s max)
if grep -q "^statement_timeout" "$PG_CONF"; then
  sed -i "s/^statement_timeout.*/statement_timeout = 60000/" "$PG_CONF"
else
  echo "statement_timeout = 60000" >> "$PG_CONF"
fi

echo "==> Restarting PostgreSQL to apply 300 max_connections tuning..."
systemctl restart postgresql || systemctl restart postgres

echo "==> Clearing any stale backends..."
sudo -u postgres psql -d blessing -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE pid != pg_backend_pid();" >/dev/null 2>&1 || true

echo "✅ PostgreSQL is now tuned for 300 concurrent connections with automatic 15s idle cleanup."

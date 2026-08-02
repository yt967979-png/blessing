#!/usr/bin/env bash
# 24/7 Self-Healing Watchdog & Proactive Monitor for Blessing Power Guide
# Checks app health, DB connections, and automatically recovers from failures.

set -euo pipefail

LOG_FILE="/var/log/blessing-watchdog.log"
exec >> "$LOG_FILE" 2>&1

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# 1. Probe local app health
HEALTH_HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://127.0.0.1:3000/api/health" || echo "000")
READY_HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://127.0.0.1:3000/api/ready" || echo "000")

if [[ "$HEALTH_HTTP" -ne 200 || "$READY_HTTP" -ne 200 ]]; then
  echo "[$TIMESTAMP] ⚠️ UNHEALTHY DETECTED — Health: $HEALTH_HTTP, Ready: $READY_HTTP. Self-healing restart in progress..."
  
  # Terminate idle PG connections if DB pool was stuck
  sudo -u postgres psql -d blessing -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='blessing' AND state='idle' AND pid != pg_backend_pid();" >/dev/null 2>&1 || true
  
  # Restart service
  systemctl restart blessing
  echo "[$TIMESTAMP] ✅ Self-healing restart complete."
  exit 0
fi

# 2. Monitor PostgreSQL Connection Count
PG_CONNS=$(sudo -u postgres psql -t -A -c "SELECT count(*) FROM pg_stat_activity WHERE datname='blessing';" 2>/dev/null || echo "0")

if [[ "$PG_CONNS" -gt 60 ]]; then
  echo "[$TIMESTAMP] ⚠️ HIGH DB CONNS ($PG_CONNS) — Clearing idle backends..."
  sudo -u postgres psql -d blessing -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='blessing' AND state='idle' AND pid != pg_backend_pid();" >/dev/null 2>&1 || true
fi

# 3. All OK
echo "[$TIMESTAMP] OK — Health: 200, Ready: 200, DB Conns: $PG_CONNS"

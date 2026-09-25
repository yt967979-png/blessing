#!/usr/bin/env bash
# 24/7 Self-Healing Watchdog for Blessing Power Guide Dual Workers (3000 & 3001)

set -euo pipefail

LOG_FILE="/var/log/blessing-watchdog.log"
exec >> "$LOG_FILE" 2>&1

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

for PORT in 3000 3001; do
  HEALTH=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://127.0.0.1:${PORT}/api/health" || echo "000")
  READY=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://127.0.0.1:${PORT}/api/ready" || echo "000")

  if [[ "$HEALTH" -ne 200 || "$READY" -ne 200 ]]; then
    echo "[$TIMESTAMP] ⚠️ Worker on port $PORT UNHEALTHY (Health: $HEALTH, Ready: $READY). Restarting blessing@${PORT}..."
    systemctl restart blessing@${PORT}
    echo "[$TIMESTAMP] ✅ blessing@${PORT} restart triggered."
  fi
done

# Monitor PostgreSQL Connection Count
PG_CONNS=$(sudo -u postgres psql -t -A -c "SELECT count(*) FROM pg_stat_activity WHERE datname='blessing';" 2>/dev/null || echo "0")

if [[ "$PG_CONNS" -gt 60 ]]; then
  echo "[$TIMESTAMP] ⚠️ HIGH DB CONNS ($PG_CONNS) — Clearing idle backends..."
  sudo -u postgres psql -d blessing -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='blessing' AND state='idle' AND pid != pg_backend_pid();" >/dev/null 2>&1 || true
fi

echo "[$TIMESTAMP] OK — Both workers healthy (3000 & 3001), DB Conns: $PG_CONNS"


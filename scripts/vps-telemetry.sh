#!/usr/bin/env bash
OUTPUT="${1:-/tmp/telemetry.json}"
SAMPLES="${2:-30}"

echo "[" > "$OUTPUT"
FIRST=1

for i in $(seq 1 "$SAMPLES"); do
  CPU=$(top -bn 2 -d 1 | grep 'Cpu(s)' | tail -n 1 | awk '{print $2+$4}')
  RAM_USED=$(free -m | awk '/Mem:/ {print $3}')
  RAM_AVAIL=$(free -m | awk '/Mem:/ {print $7}')
  PG_CONNS=$(sudo -u postgres psql -t -c 'SELECT count(*) FROM pg_stat_activity;' 2>/dev/null | tr -d ' \n')
  REDIS_CONNS=$(redis-cli info clients 2>/dev/null | grep connected_clients | cut -d: -f2 | tr -d '\r\n ')
  [ -z "$CPU" ] && CPU=0
  [ -z "$PG_CONNS" ] && PG_CONNS=0
  [ -z "$REDIS_CONNS" ] && REDIS_CONNS=0
  
  if [ "$FIRST" -eq 1 ]; then
    FIRST=0
  else
    echo "," >> "$OUTPUT"
  fi
  echo "  {\"time\":\"$(date -u +%FT%TZ)\", \"cpuPercent\":$CPU, \"ramUsedMb\":$RAM_USED, \"ramAvailMb\":$RAM_AVAIL, \"pgConns\":$PG_CONNS, \"redisConns\":$REDIS_CONNS}" >> "$OUTPUT"
done

echo "]" >> "$OUTPUT"

#!/bin/bash
echo "=================================================="
echo "TELEMETRY SNAPSHOT AT $(date)"
echo "=================================================="

echo "--- 1. SYSTEM CPU & I/O (vmstat) ---"
vmstat 1 2

echo ""
echo "--- 2. NODE WORKER PROCESSES (PID, Core, %CPU, %MEM, RSS) ---"
PIDS=$(pgrep -d, -f 'next-server')
ps -p $PIDS -o pid,psr,%cpu,%mem,rss,cmd --no-headers

echo ""
echo "--- 3. TOP PROCESSES BY CPU ---"
ps -eo pid,psr,%cpu,%mem,cmd --sort=-%cpu | head -n 10

echo ""
echo "--- 4. POSTGRESQL CONNECTIONS & WAIT EVENTS ---"
sudo -u postgres psql blessing -c "SELECT count(*), state, wait_event_type, wait_event FROM pg_stat_activity GROUP BY state, wait_event_type, wait_event;" 2>/dev/null

echo ""
echo "--- 5. POSTGRESQL WAITING / ACTIVE LOCKS ---"
sudo -u postgres psql blessing -c "SELECT pid, mode, granted FROM pg_locks WHERE NOT granted;" 2>/dev/null

echo ""
echo "--- 6. REDIS METRICS ---"
redis-cli info stats | grep -E 'instantaneous_ops_per_sec|total_commands_processed'
redis-cli latency latest 2>/dev/null

echo "=================================================="

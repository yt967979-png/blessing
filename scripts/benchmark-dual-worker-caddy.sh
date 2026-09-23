#!/usr/bin/env bash
# True Dual-Worker Origin Benchmark Through Caddy
# Concurrency: 100 -> 250 -> 500 -> 750 -> 1000 -> 1500 -> 2000

set -euo pipefail

TARGET_BASE="https://blessingpowerguide.in"
CONCURRENCY_LEVELS=(100 250 500 750 1000 1500 2000)
DURATION="10s"
THREADS=8

echo "=========================================================================="
echo "🚀 TRUE DUAL-WORKER ORIGIN BENCHMARK THROUGH CADDY"
echo "Target Base: $TARGET_BASE"
echo "Workers: 127.0.0.1:3000 & 127.0.0.1:3001 (Round-Robin via Caddy)"
echo "Duration per stage: $DURATION"
echo "Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "=========================================================================="
echo ""

# Stage A: Benchmark /api/health (Raw Origin + Caddy proxy throughput)
echo "--------------------------------------------------------------------------"
echo "STAGE A: /api/health (Origin Proxy & Event Loop Baseline)"
echo "--------------------------------------------------------------------------"

for c in "${CONCURRENCY_LEVELS[@]}"; do
  echo ""
  echo ">>> Testing Concurrency: $c concurrent connections..."
  # Use threads proportional to connections, max 8
  t=$THREADS
  if [ "$c" -lt 8 ]; then t=$c; fi

  wrk -t"$t" -c"$c" -d"$DURATION" --latency "$TARGET_BASE/api/health"
  sleep 2
done

# Stage B: Benchmark /api/products (Realistic Catalog API under Scale)
echo ""
echo "--------------------------------------------------------------------------"
echo "STAGE B: /api/products (Realistic Database + Catalog Endpoint)"
echo "--------------------------------------------------------------------------"

for c in "${CONCURRENCY_LEVELS[@]}"; do
  echo ""
  echo ">>> Testing Concurrency: $c concurrent connections..."
  t=$THREADS
  if [ "$c" -lt 8 ]; then t=$c; fi

  wrk -t"$t" -c"$c" -d"$DURATION" --latency "$TARGET_BASE/api/products"
  sleep 2
done

echo ""
echo "=========================================================================="
echo "✅ DUAL-WORKER ORIGIN BENCHMARK COMPLETE"
echo "=========================================================================="

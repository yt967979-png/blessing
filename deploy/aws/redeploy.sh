#!/usr/bin/env bash
# Safe production redeploy for Blessing Power Guide on Lightsail/EC2.
# Run as root or with sudo. Stops the app first so mid-build never serves a broken .next.
#
#   sudo bash deploy/aws/redeploy.sh
#   sudo bash deploy/aws/redeploy.sh /home/ubuntu/blessing-src
#   sudo bash /home/ubuntu/blessing-src/deploy/aws/redeploy.sh ~/blessing-src
#
# CRITICAL: never source /etc/blessing.env before npm ci.
# blessing.env sets NODE_ENV=production → npm omits @tailwindcss/postcss →
# incomplete .next → middleware-manifest missing → 500 on every route.

set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Re-run with sudo: sudo bash deploy/aws/redeploy.sh [clone-path]"
  exit 1
fi

APP_USER="${APP_USER:-ubuntu}"
APP_DIR="${APP_DIR:-/opt/blessing}"
ENV_FILE="${ENV_FILE:-/etc/blessing.env}"
CLONE_PATH="${1:-${CLONE_PATH:-/home/${APP_USER}/blessing-src}}"

# Expand ~ if passed literally
CLONE_PATH="${CLONE_PATH/#\~/$HOME}"
if [[ "$CLONE_PATH" == ~* ]]; then
  CLONE_PATH="/home/${APP_USER}/${CLONE_PATH#~/}"
fi

if [[ ! -d "$CLONE_PATH" ]]; then
  # Common Lightsail layout from AWS.md: ~/blessing/blessing
  for candidate in \
    "/home/${APP_USER}/blessing/blessing" \
    "/home/${APP_USER}/blessing" \
    "$(cd "$(dirname "$0")/../.." 2>/dev/null && pwd)"; do
    if [[ -d "$candidate" && -f "$candidate/package.json" ]]; then
      CLONE_PATH="$candidate"
      break
    fi
  done
fi

if [[ ! -f "$CLONE_PATH/package.json" ]]; then
  echo "ERROR: clone path missing package.json: $CLONE_PATH"
  echo "Usage: sudo bash deploy/aws/redeploy.sh /path/to/repo-clone"
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE missing — create secrets first (see AWS.md §3)"
  exit 1
fi

# systemd EnvironmentFile breaks on Windows CRLF
sed -i 's/\r$//' "$ENV_FILE"

echo "==> Stop blessing (avoid serving incomplete .next)"
systemctl stop blessing || true
if [[ -f "$CLONE_PATH/deploy/aws/optimize-postgres.sh" ]]; then
  echo "==> Enforce 300 PG max_connections & idle timeouts"
  bash "$CLONE_PATH/deploy/aws/optimize-postgres.sh" || true
fi
sudo -u postgres psql -d blessing -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='blessing' AND pid != pg_backend_pid();" >/dev/null 2>&1 || true

echo "==> Rsync $CLONE_PATH → $APP_DIR"
mkdir -p "$APP_DIR"
rsync -a --delete \
  --exclude node_modules \
  --exclude .next \
  --exclude .git \
  --exclude whatsapp_session \
  --exclude 'whatsapp_session_*' \
  "$CLONE_PATH"/ "$APP_DIR"/

# Bad rsync source (e.g. parent of clone) nests a second tree — remove junk
if [[ -d "$APP_DIR/blessing" ]]; then
  echo "==> Removing nested junk: $APP_DIR/blessing"
  rm -rf "$APP_DIR/blessing"
fi

chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# CRITICAL: npm ci WITHOUT sourcing env (keeps @tailwindcss/postcss + typescript)
echo "==> npm ci --include=dev (clean env — do NOT source $ENV_FILE)"
sudo -u "$APP_USER" bash -lc "cd '$APP_DIR' && npm ci --include=dev"

echo "==> npm run build (with $ENV_FILE for NEXT_PUBLIC_* / DATABASE_URL)"
sudo -u "$APP_USER" bash -lc "set -a; source '$ENV_FILE'; set +a; cd '$APP_DIR' && npm run build"

MANIFEST_OK=0
if [[ -f "$APP_DIR/.next/server/middleware-manifest.json" ]] \
  || [[ -f "$APP_DIR/.next/middleware-manifest.json" ]]; then
  MANIFEST_OK=1
fi
if [[ "$MANIFEST_OK" -ne 1 ]]; then
  echo "ERROR: middleware-manifest.json missing after build — aborting start (broken CSS/500 risk)."
  echo "Hint: npm ci must run with --include=dev and WITHOUT sourcing $ENV_FILE first."
  exit 1
fi
test -d "$APP_DIR/.next" || { echo "ERROR: .next missing"; exit 1; }

echo "==> Install systemd unit + start"
cp "$APP_DIR/deploy/aws/blessing.service" /etc/systemd/system/blessing.service
sed -i "s/^User=.*/User=$APP_USER/" /etc/systemd/system/blessing.service
sed -i "s/^Group=.*/Group=$APP_USER/" /etc/systemd/system/blessing.service
sed -i "s|^WorkingDirectory=.*|WorkingDirectory=$APP_DIR|" /etc/systemd/system/blessing.service
# Keep ExecStartPre path aligned if APP_DIR customized
sed -i "s|/opt/blessing|$APP_DIR|g" /etc/systemd/system/blessing.service
systemctl daemon-reload
systemctl start blessing

echo "==> Health probes (localhost)"
sleep 3
HEALTH_OK=0
READY_OK=0
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS --max-time 8 "http://127.0.0.1:3000/api/health" >/dev/null 2>&1; then
    HEALTH_OK=1
  fi
  if curl -fsS --max-time 15 "http://127.0.0.1:3000/api/ready" >/dev/null 2>&1; then
    READY_OK=1
  fi
  if [[ "$HEALTH_OK" -eq 1 && "$READY_OK" -eq 1 ]]; then
    break
  fi
  sleep 2
done

echo "--- /api/health ---"
curl -fsS --max-time 8 "http://127.0.0.1:3000/api/health" || {
  echo "ERROR: /api/health failed"
  journalctl -u blessing -n 40 --no-pager || true
  exit 1
}
echo ""
echo "--- /api/ready ---"
curl -fsS --max-time 15 "http://127.0.0.1:3000/api/ready" || {
  echo "ERROR: /api/ready failed"
  journalctl -u blessing -n 40 --no-pager || true
  exit 1
}
echo ""

echo "==> Running Automated Route Test Suite (14 Core Pages & APIs)"
node "$APP_DIR/scripts/test-all-routes.js" "http://127.0.0.1:3000" || {
  echo "ERROR: Automated route testing suite detected a failure!"
  journalctl -u blessing -n 30 --no-pager || true
  exit 1
}

echo ""
echo "OK: redeploy complete — blessing is up with 100% verified health + all 14 routes passing."

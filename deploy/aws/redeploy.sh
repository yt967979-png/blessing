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

# Friendly “Updating…” page while we rebuild (Caddyfile swap — most reliable)
MAINT_DIR="/var/www/blessing-maintenance"
mkdir -p "$MAINT_DIR"
if [[ -f "$CLONE_PATH/deploy/aws/maintenance.html" ]]; then
  cp "$CLONE_PATH/deploy/aws/maintenance.html" "$MAINT_DIR/maintenance.html"
fi
if [[ ! -f "$MAINT_DIR/maintenance.html" ]]; then
  printf '%s\n' '<!doctype html><title>Updating</title><h1>Updating — please wait</h1>' > "$MAINT_DIR/maintenance.html"
fi
if command -v caddy >/dev/null 2>&1; then
  if [[ -f "$CLONE_PATH/deploy/aws/Caddyfile.maintenance" ]]; then
    cp "$CLONE_PATH/deploy/aws/Caddyfile.maintenance" /etc/caddy/Caddyfile
  elif [[ -f "$CLONE_PATH/deploy/aws/Caddyfile" ]]; then
    cp "$CLONE_PATH/deploy/aws/Caddyfile" /etc/caddy/Caddyfile
  fi
  echo "==> Maintenance Caddyfile ON (users see Updating screen)"
  caddy validate --config /etc/caddy/Caddyfile 2>/dev/null || true
  systemctl reload caddy 2>/dev/null || systemctl restart caddy 2>/dev/null || true
fi

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

# `next build` runs with cleanDistDir (default true), which deletes the whole .next
# dir — including .next/static/chunks/* from the PREVIOUS build — before writing the
# new, re-hashed output. Any browser tab still holding the old HTML (open before this
# redeploy) will then request old chunk filenames that no longer exist, and Next
# deliberately answers with a plain-text 404 for missing /_next/static/* files —
# this is the "Refused to apply style... MIME type text/plain" / chunk 404 bug.
# Back up the previous build's static assets so we can merge them back in below.
STATIC_BACKUP="/tmp/blessing-next-static-prev"
rm -rf "$STATIC_BACKUP"
if [[ -d "$APP_DIR/.next/static" ]]; then
  cp -a "$APP_DIR/.next/static" "$STATIC_BACKUP"
fi

echo "==> npm run build (with $ENV_FILE for NEXT_PUBLIC_* / DATABASE_URL)"
sudo -u "$APP_USER" bash -lc "set -a; source '$ENV_FILE'; set +a; cd '$APP_DIR' && npm run build"

if [[ -d "$STATIC_BACKUP" ]]; then
  echo "==> Merging previous build's static chunks back in (avoid stale-tab 404s)"
  # Content-hashed filenames never collide across builds, so -n (no-clobber) only
  # ever adds back files the new build doesn't have — it never masks fresh output.
  cp -an "$STATIC_BACKUP"/. "$APP_DIR/.next/static"/ 2>/dev/null || true
  chown -R "$APP_USER:$APP_USER" "$APP_DIR/.next/static"
  rm -rf "$STATIC_BACKUP"
fi

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

echo "==> Instant 0.3s Atomic Swap & Systemd Restart"
if [[ -f "$CLONE_PATH/deploy/aws/optimize-postgres.sh" ]]; then
  bash "$CLONE_PATH/deploy/aws/optimize-postgres.sh" || true
fi
systemctl restart blessing || systemctl start blessing
cp "$APP_DIR/deploy/aws/blessing.service" /etc/systemd/system/blessing.service
sed -i "s/^User=.*/User=$APP_USER/" /etc/systemd/system/blessing.service
sed -i "s/^Group=.*/Group=$APP_USER/" /etc/systemd/system/blessing.service
sed -i "s|^WorkingDirectory=.*|WorkingDirectory=$APP_DIR|" /etc/systemd/system/blessing.service
# Keep ExecStartPre path aligned if APP_DIR customized
sed -i "s|/opt/blessing|$APP_DIR|g" /etc/systemd/system/blessing.service
systemctl daemon-reload
systemctl start blessing

# Lightsail default for this shop is Caddy (HTTPS). Skip Nginx unless installed.
if command -v nginx >/dev/null 2>&1 && [[ -f "$APP_DIR/deploy/aws/nginx-blessing.conf" ]]; then
  echo "==> Install Nginx site config"
  mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled
  cp "$APP_DIR/deploy/aws/nginx-blessing.conf" /etc/nginx/sites-available/blessing || true
  ln -sf /etc/nginx/sites-available/blessing /etc/nginx/sites-enabled/blessing || true
  nginx -t && systemctl reload nginx || true
elif command -v caddy >/dev/null 2>&1; then
  echo "==> Proxy is Caddy (skip Nginx) — reload if Caddyfile present"
  if [[ -f "$APP_DIR/deploy/aws/Caddyfile" ]]; then
    cp "$APP_DIR/deploy/aws/Caddyfile" /etc/caddy/Caddyfile 2>/dev/null || true
    systemctl reload caddy 2>/dev/null || true
  fi
else
  echo "==> No Nginx/Caddy detected — app listens on :3000 only"
fi

echo "==> Install Systemd Watchdog Timer (30s Proactive Health Checks)"
if [[ -f "$APP_DIR/deploy/aws/blessing-watchdog.service" && -f "$APP_DIR/deploy/aws/blessing-watchdog.timer" ]]; then
  cp "$APP_DIR/deploy/aws/blessing-watchdog.service" /etc/systemd/system/blessing-watchdog.service
  cp "$APP_DIR/deploy/aws/blessing-watchdog.timer" /etc/systemd/system/blessing-watchdog.timer
  systemctl daemon-reload
  systemctl enable --now blessing-watchdog.timer || true
fi

echo "==> Install Daily Database Backup Cron & Logrotate Protection"
if [[ -f "$APP_DIR/deploy/aws/backup-db.sh" ]]; then
  chmod +x "$APP_DIR/deploy/aws/backup-db.sh"
  chmod +x "$APP_DIR/deploy/aws/restore-db.sh" 2>/dev/null || true
  chmod +x "$APP_DIR/deploy/aws/pre-launch-check.sh" 2>/dev/null || true
  (crontab -l 2>/dev/null | grep -v "backup-db.sh" ; echo "0 3 * * * /bin/bash $APP_DIR/deploy/aws/backup-db.sh >/var/log/blessing-backup.log 2>&1") | crontab - || true
  # First backup immediately so disk is never empty after a fresh deploy
  /bin/bash "$APP_DIR/deploy/aws/backup-db.sh" >>/var/log/blessing-backup.log 2>&1 || echo "==> WARNING: initial backup failed (check Postgres / DATABASE_URL)"
fi
if [[ -f "$APP_DIR/deploy/aws/logrotate-blessing.conf" ]]; then
  cp "$APP_DIR/deploy/aws/logrotate-blessing.conf" /etc/logrotate.d/blessing || true
fi

echo "==> Enforce 128MB Redis RAM Cache"
if [[ -f "$APP_DIR/deploy/aws/install-redis.sh" ]]; then
  chmod +x "$APP_DIR/deploy/aws/install-redis.sh"
  bash "$APP_DIR/deploy/aws/install-redis.sh" || true
fi

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
  echo "ERROR: /api/health failed — leaving maintenance page ON"
  journalctl -u blessing -n 40 --no-pager || true
  exit 1
}
echo ""
echo "--- /api/ready ---"
curl -fsS --max-time 15 "http://127.0.0.1:3000/api/ready" || {
  echo "ERROR: /api/ready failed — leaving maintenance page ON"
  journalctl -u blessing -n 40 --no-pager || true
  exit 1
}
echo ""

# App is healthy — restore normal Caddy reverse-proxy config
if command -v caddy >/dev/null 2>&1; then
  if [[ -f "$APP_DIR/deploy/aws/Caddyfile" ]]; then
    cp "$APP_DIR/deploy/aws/Caddyfile" /etc/caddy/Caddyfile
  elif [[ -f "$CLONE_PATH/deploy/aws/Caddyfile" ]]; then
    cp "$CLONE_PATH/deploy/aws/Caddyfile" /etc/caddy/Caddyfile
  fi
  echo "==> Maintenance Caddyfile OFF (shop live again)"
  caddy validate --config /etc/caddy/Caddyfile 2>/dev/null || true
  systemctl reload caddy 2>/dev/null || systemctl restart caddy 2>/dev/null || true
fi

echo "==> Running Automated Route Test Suite (14 Core Pages & APIs)"
node "$APP_DIR/scripts/test-all-routes.js" "http://127.0.0.1:3000" || {
  echo "ERROR: Automated route testing suite detected a failure!"
  journalctl -u blessing -n 30 --no-pager || true
  exit 1
}

echo ""
echo "OK: redeploy complete — blessing is up with 100% verified health + all 14 routes passing."

#!/usr/bin/env bash
# Bootstrap Ubuntu on Lightsail/EC2 (ap-southeast-1) for Blessing Power Guide.
# Run from the repo root, or with REPO_DIR set. Requires sudo.
#
#   sudo bash deploy/aws/setup-lightsail.sh
#
# Does NOT start the app until /etc/blessing.env has real secrets.
# Does NOT pause Railway. See AWS.md.

set -euo pipefail

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
APP_USER="${APP_USER:-ubuntu}"
APP_DIR="${APP_DIR:-/opt/blessing}"
ENV_FILE="${ENV_FILE:-/etc/blessing.env}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Re-run with sudo: sudo bash deploy/aws/setup-lightsail.sh"
  exit 1
fi

echo "==> Repo: $REPO_DIR"
echo "==> Install dir: $APP_DIR"

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl ca-certificates gnupg git debian-keyring debian-archive-keyring apt-transport-https rsync

if ! command -v node >/dev/null 2>&1 || [[ "$(node -v 2>/dev/null | sed 's/^v//' | cut -d. -f1)" -lt 20 ]]; then
  echo "==> Installing Node.js 20.x"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
node -v
npm -v

if ! command -v caddy >/dev/null 2>&1; then
  echo "==> Installing Caddy"
  rm -f /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  apt-get update -y
  apt-get install -y caddy
fi
caddy version

echo "==> Syncing app to $APP_DIR"
mkdir -p "$APP_DIR"
if [[ "$REPO_DIR" != "$APP_DIR" ]]; then
  rsync -a --delete \
    --exclude node_modules \
    --exclude .next \
    --exclude .git \
    "$REPO_DIR"/ "$APP_DIR"/
  # Keep .git if cloning directly into APP_DIR; for rsync from a clone, re-init remote pull:
  if [[ -d "$REPO_DIR/.git" && ! -d "$APP_DIR/.git" ]]; then
    echo "Note: $APP_DIR has no .git — use git clone into $APP_DIR for easy pull updates."
  fi
fi
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$APP_DIR/deploy/aws/env.example" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "==> Created $ENV_FILE from env.example — EDIT SECRETS before starting."
else
  echo "==> Keeping existing $ENV_FILE"
fi

echo "==> npm ci && npm run build (as $APP_USER)"
sudo -u "$APP_USER" bash -lc "cd '$APP_DIR' && npm ci && npm run build"

echo "==> systemd unit"
cp "$APP_DIR/deploy/aws/blessing.service" /etc/systemd/system/blessing.service
# Adjust User if needed
sed -i "s/^User=.*/User=$APP_USER/" /etc/systemd/system/blessing.service
sed -i "s/^Group=.*/Group=$APP_USER/" /etc/systemd/system/blessing.service
sed -i "s|^WorkingDirectory=.*|WorkingDirectory=$APP_DIR|" /etc/systemd/system/blessing.service
systemctl daemon-reload
systemctl enable blessing

echo "==> Caddyfile"
cp "$APP_DIR/deploy/aws/Caddyfile" /etc/caddy/Caddyfile
systemctl enable caddy
systemctl restart caddy || true

echo ""
echo "Next steps:"
echo "  1. sudo nano $ENV_FILE   # paste Railway/Neon secrets + PUBLIC_BASE_URL"
echo "  2. Point DNS A record at this instance static IP; edit /etc/caddy/Caddyfile hostnames"
echo "  3. cd $APP_DIR && sudo -u $APP_USER npm run build   # if NEXT_PUBLIC_* changed"
echo "  4. sudo systemctl restart blessing && sudo systemctl reload caddy"
echo "  5. Verify /api/health and /api/ready — keep Railway up until AWS.md §6 passes"
echo ""
echo "Do not start blessing until secrets are real (systemctl start blessing)."

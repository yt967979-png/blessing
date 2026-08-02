#!/usr/bin/env bash
# 🚀 1-Command Automated Master Setup for New Ubuntu VPS (AWS Lightsail / Hetzner / DigitalOcean)
# Prepares Node.js 20, PostgreSQL 16, Nginx, Redis, Systemd, Logrotate, and Security in 3 Minutes!

set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Re-run with sudo: sudo bash deploy/aws/setup-new-vps.sh"
  exit 1
fi

echo "=================================================================="
echo "🚀 BLESSING POWER GUIDE — NEW VPS AUTOMATED INFRASTRUCTURE SETUP"
echo "=================================================================="

echo "==> Step 1: Update OS packages & install essential utilities"
apt-get update -qq
apt-get install -y -qq curl git rsync unzip build-essential ufw logrotate

echo "==> Step 2: Install Node.js 20 LTS"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi

echo "==> Step 3: Install & Configure PostgreSQL 16"
if ! command -v psql >/dev/null 2>&1; then
  apt-get install -y -qq postgresql postgresql-contrib
fi

systemctl enable --now postgresql

echo "==> Step 4: Setup PostgreSQL Database & User"
sudo -u postgres psql -c "CREATE USER blessing WITH PASSWORD 'blessing2025';" 2>/dev/null || true
sudo -u postgres psql -c "CREATE DATABASE blessing OWNER blessing;" 2>/dev/null || true
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE blessing TO blessing;" 2>/dev/null || true

echo "==> Step 5: Install & Configure Redis"
if [[ -f "$(dirname "$0")/install-redis.sh" ]]; then
  bash "$(dirname "$0")/install-redis.sh"
fi

echo "==> Step 6: Optimize PostgreSQL (300 Max Connections)"
if [[ -f "$(dirname "$0")/optimize-postgres.sh" ]]; then
  bash "$(dirname "$0")/optimize-postgres.sh"
fi

echo "==> Step 7: Install & Configure Nginx"
if ! command -v nginx >/dev/null 2>&1; then
  apt-get install -y -qq nginx
fi
systemctl enable --now nginx

echo "==> Step 8: Configure Firewall (UFW)"
ufw allow OpenSSH || true
ufw allow 'Nginx Full' || true
echo "y" | ufw enable || true

echo ""
echo "=================================================================="
echo "✅ NEW VPS SETUP COMPLETE!"
echo " Next Step: Create /etc/blessing.env with secrets & run:"
echo " sudo bash deploy/aws/redeploy.sh"
echo "=================================================================="

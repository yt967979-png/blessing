#!/bin/bash
# ==============================================================================
# Blessing Power Guide — 1-Click Production Setup Script for 4GB RAM / 2 CPU VPS
# ==============================================================================

set -e

echo "🚀 Starting Blessing Power Guide VPS Production Setup..."

# 1. System Updates & Essential Packages
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y curl git build-essential nginx certbot python3-certbot-nginx postgresql postgresql-contrib

# 2. Install Node.js 20 LTS & PM2
if ! command -v node &> /dev/null; then
  echo "📦 Installing Node.js 20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

sudo npm install -g pm2

# 3. Configure Swap Space (2GB Swap for extra stability under peak load)
if [ $(sudo swapon --show | wc -l) -eq 0 ]; then
  echo "💾 Creating 2GB Swap file for high concurrency protection..."
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi

# 4. PostgreSQL Tuning for 4GB RAM
echo "⚙️ Tuning PostgreSQL for 4GB RAM & 2 CPUs..."
PG_CONF="/etc/postgresql/16/main/postgresql.conf"
if [ ! -f "$PG_CONF" ]; then
  PG_CONF=$(find /etc/postgresql/ -name "postgresql.conf" | head -n 1)
fi

if [ -f "$PG_CONF" ]; then
  sudo sed -i "s/^#\?max_connections =.*/max_connections = 100/" "$PG_CONF"
  sudo sed -i "s/^#\?shared_buffers =.*/shared_buffers = 1GB/" "$PG_CONF"
  sudo sed -i "s/^#\?effective_cache_size =.*/effective_cache_size = 3GB/" "$PG_CONF"
  sudo sed -i "s/^#\?work_mem =.*/work_mem = 16MB/" "$PG_CONF"
  sudo sed -i "s/^#\?maintenance_work_mem =.*/maintenance_work_mem = 256MB/" "$PG_CONF"
  sudo systemctl restart postgresql
fi

# 5. Build Project & Start PM2
echo "🏗️ Installing app dependencies and building..."
npm ci
npm run build

echo "🟢 Starting 2 Node.js worker instances via PM2 cluster..."
pm2 start ecosystem.config.js
pm2 save
pm2 startup | tail -n 1 | sudo bash || true

echo "✅ Blessing Power Guide VPS Setup Complete!"
echo "🌐 Next step: Run 'sudo certbot --nginx' to enable SSL for your domain."

#!/usr/bin/env bash
# Production Redis Setup & Tuning Script for Blessing Power Guide on AWS Lightsail
# Installs redis-server, configures 128MB LRU RAM cache, and enables systemd service.

set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Re-run with sudo: sudo bash deploy/aws/install-redis.sh"
  exit 1
fi

echo "==> Installing redis-server..."
apt-get update -qq
apt-get install -y -qq redis-server

REDIS_CONF="/etc/redis/redis.conf"

if [[ -f "$REDIS_CONF" ]]; then
  echo "==> Tuning /etc/redis/redis.conf..."
  
  # Set maxmemory 128mb
  if grep -q "^maxmemory " "$REDIS_CONF"; then
    sed -i "s/^maxmemory .*/maxmemory 128mb/" "$REDIS_CONF"
  else
    echo "maxmemory 128mb" >> "$REDIS_CONF"
  fi

  # Set maxmemory-policy allkeys-lru (auto-evict least recently used keys when RAM is full)
  if grep -q "^maxmemory-policy " "$REDIS_CONF"; then
    sed -i "s/^maxmemory-policy .*/maxmemory-policy allkeys-lru/" "$REDIS_CONF"
  else
    echo "maxmemory-policy allkeys-lru" >> "$REDIS_CONF"
  fi
fi

echo "==> Restarting & enabling Redis..."
systemctl enable --now redis-server || systemctl enable --now redis

echo "==> Ping test..."
if redis-cli ping | grep -q "PONG"; then
  echo "✅ Redis installed and running on 127.0.0.1:6379 (PONG received)."
else
  echo "⚠️ Redis ping failed — please check systemctl status redis-server"
fi

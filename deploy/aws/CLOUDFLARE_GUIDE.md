# 🌐 Cloudflare CDN Configuration Guide for Blessing Power Guide

Follow this guide to enable Cloudflare Free CDN for global caching, sub-10ms asset delivery across Tamil Nadu & India, SSL encryption, and automatic DDoS protection.

---

## 📋 Step 1: DNS & Proxy Setup
1. Log in to your [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Add your domain name (e.g., `blessingpowerguide.com`).
3. Under **DNS Records**, add an `A` record pointing to your AWS Lightsail Public IP:
   - **Type**: `A`
   - **Name**: `@` or `blessingpowerguide.com`
   - **IPv4 Address**: `YOUR_AWS_LIGHTSAIL_IP`
   - **Proxy Status**: 🟠 **Proxied** (Orange Cloud ON)

---

## 🔒 Step 2: SSL/TLS Encryption
1. Navigate to **SSL/TLS** → **Overview**.
2. Change the encryption mode to **Full (Strict)**.
3. Under **SSL/TLS** → **Edge Certificates**:
   - Turn ON **Always Use HTTPS**.
   - Turn ON **Automatic HTTPS Rewrites**.
   - Turn ON **Minimum TLS Version: 1.2**.

---

## ⚡ Step 3: Cache Rules (Next.js 15 Optimization)

Navigate to **Caching** → **Cache Rules** and create these 2 rules:

### Rule 1: Static Assets Cache (10ms Load Speed)
- **Expression**: `(http.request.uri.path starts_with "/_next/static/") or (http.request.uri.path starts_with "/images/")`
- **Cache status**: **Eligible for cache**
- **Edge Cache TTL**: **1 month**
- **Browser Cache TTL**: **1 year**

### Rule 2: Bypass Cache for Real-Time APIs & Admin
- **Expression**: `(http.request.uri.path starts_with "/admin") or (http.request.uri.path starts_with "/api/")`
- **Cache status**: **Bypass cache**

---

## 🚀 Step 4: Speed & Performance Tweaks
1. Go to **Speed** → **Optimization**.
2. **Auto Minify**: Check `HTML`, `CSS`, and `JS`.
3. **Brotli**: Turn **ON**.
4. **Early Hints**: Turn **ON** (preloads fonts & CSS).
5. **HTTP/3 (with QUIC)**: Turn **ON**.

---

## 🛡️ Step 5: Security & Anti-Bot Protection
1. Go to **Security** → **Settings**.
2. Set **Security Level**: `Medium` or `High`.
3. Go to **Bots**: Turn ON **Bot Fight Mode** (blocks malicious scrapers automatically).

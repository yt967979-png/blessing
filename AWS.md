# Deploy on Amazon Lightsail (from Railway)

**Preferred path when you have AWS credits but no Render payment card.** Neon Postgres stays the same (Singapore). The app runs on an **always-on** Lightsail VM so Baileys WhatsApp stays in-process (do **not** use Amplify, Lambda, or App Runner — they are not a fit).

**Repo:** `yt967979-png/blessing` · **branch:** `main` · **region:** `ap-southeast-1` (Singapore, matches Neon)

Railway (`https://blessing-production.up.railway.app`) stays production until the verify checklist below passes. **Do not pause Railway until that checklist passes.**

Render remains an optional alternative — see [`RENDER.md`](RENDER.md).

---

## Why Lightsail (not Amplify / Lambda / App Runner)

| Option | Why not for this shop |
|--------|------------------------|
| Amplify / Lambda | No long-lived Node process → Baileys QR/session dies |
| App Runner | Scales to zero / short-lived containers → same problem |
| **Lightsail / EC2** | Always-on VM; `npm start` + Baileys in one Node process |

---

## Approximate credit burn (Singapore)

| Item | Rough monthly |
|------|----------------|
| Lightsail **$5** (1 GB / 1 vCPU) or **$10** (2 GB) | ~$5–$10 |
| Static IP (optional, free while attached) | $0 |
| Data transfer (Lightsail plan allowance) | Usually enough for this shop |
| Neon | Unchanged (existing plan) |
| **~$200 AWS free credits** | Roughly **20–40 months** at $5–$10/mo if only this VM burns credits |

Prefer **$10 / 2 GB** if WhatsApp + Next feel tight on 1 GB. EC2 **t3.small** (~$15–18/mo on-demand in Singapore) works the same way if you already prefer EC2 — steps below are Lightsail-first; EC2 is the same Node + systemd + Caddy pattern.

---

## 1. First clicks in AWS Console (Lightsail)

1. Open [Lightsail console](https://lightsail.aws.amazon.com/) → top-right region → **Singapore (ap-southeast-1)**.
2. **Create instance**.
3. Platform: **Linux/Unix** → Blueprint: **Ubuntu 24.04** (or 22.04).
4. Plan: **$5** or **$10** (1–2 GB RAM).
5. Name: e.g. `blessing` → **Create instance**.

Then:

6. Instance → **Networking** → create/attach a **Static IP**.
7. **Networking** → firewall: allow **SSH (22)**, **HTTP (80)**, **HTTPS (443)**.
8. Note the static IP (you will point DNS / `NEXT_PUBLIC_SITE_URL` here, or use a domain later).

SSH (Lightsail browser SSH or your key):

```bash
ssh -i <your-key.pem> ubuntu@<STATIC_IP>
```

---

## 2. Server bootstrap (Ubuntu)

### Option A — script (recommended)

From your laptop (after SSH works), or on the instance:

```bash
# On the Lightsail VM as ubuntu:
sudo apt-get update -y
sudo apt-get install -y git
git clone https://github.com/yt967979-png/blessing.git
cd blessing
sudo bash deploy/aws/setup-lightsail.sh
```

The script installs Node 20, Caddy, creates `/etc/blessing.env` from the example, installs the systemd unit, and enables Caddy. You still must **edit secrets** before start (step 3).

### Option B — manual

```bash
# Node 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git

# App
sudo mkdir -p /opt/blessing
sudo chown ubuntu:ubuntu /opt/blessing
git clone https://github.com/yt967979-png/blessing.git /opt/blessing
cd /opt/blessing
cp deploy/aws/env.example /tmp/blessing.env.example
# → create /etc/blessing.env (step 3)
# NEVER source /etc/blessing.env before npm ci — NODE_ENV=production omits
# @tailwindcss/postcss (devDependency) → Turbopack build fails → 500s.
npm ci --include=dev
set -a; source /etc/blessing.env; set +a
npm run build

# systemd
sudo cp deploy/aws/blessing.service /etc/systemd/system/blessing.service
sudo systemctl daemon-reload
sudo systemctl enable blessing

# Caddy (HTTPS)
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
# follow https://caddyserver.com/docs/install#debian-ubuntu-raspbian
sudo cp deploy/aws/Caddyfile /etc/caddy/Caddyfile
# edit domain or use :443 with IP — see §4
sudo systemctl enable --now caddy
sudo systemctl start blessing
```

`npm start` already binds `0.0.0.0` (see `package.json`).

---

## 3. Environment file (`/etc/blessing.env`)

Never commit real secrets. Copy keys from **Railway → blessing → Variables** (and Neon pooled URL).

### Helper (masked checklist on your PC)

```powershell
powershell -File scripts/export-railway-env-for-render.ps1
```

Same keys as Render. Full values: Railway Dashboard (script only masks).

### Create the file on the VM

```bash
sudo cp /opt/blessing/deploy/aws/env.example /etc/blessing.env
sudo nano /etc/blessing.env   # paste real values
# Strip Windows CRLF if you pasted from a PC (systemd otherwise shows empty "" env vars / crash-loop)
sudo sed -i 's/\r$//' /etc/blessing.env
sudo chmod 600 /etc/blessing.env
sudo chown root:root /etc/blessing.env
```

**systemd `EnvironmentFile` rules:** use `KEY=value` only — **no** `export KEY=...`, no blank lines that are only `\r`, no quotes around the whole file. After any paste from Windows:

```bash
sudo sed -i 's/\r$//' /etc/blessing.env
sudo systemctl daemon-reload
sudo systemctl restart blessing
```

### Required

| Key | Source / value |
|-----|----------------|
| `DATABASE_URL` | Neon **pooled** URL (`*-pooler.*.neon.tech`) — same as Railway |
| `SESSION_SECRET` | Same as Railway (≥32 chars) |
| `ADMIN_EMAIL` | Your Google admin email |
| `ADMIN_PASSWORD` | Same as Railway (password login is off; still set) |
| `ADMIN_PHONE` | WhatsApp admin alerts |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Same Google OAuth client ID |
| `NEXT_PUBLIC_SITE_URL` | `https://<your-domain>` or temporary `https://<STATIC_IP>` if using IP+HTTPS carefully — prefer a domain |
| `PUBLIC_BASE_URL` | Same as `NEXT_PUBLIC_SITE_URL` (keep-alive / host detection) |
| `HOSTING` | `aws` |
| `WHATSAPP_SESSION_DIR` | `/var/lib/blessing/whatsapp_session` (outside the app tree so `next build` / Turbopack does not scan Baileys session files) |

### Recommended tuning (Lightsail 1–2 GB)

```text
NODE_ENV=production
RUNTIME_TIER=hobby
APP_REPLICA_COUNT=1
DB_POOL_MAX=3
DB_IDLE_TIMEOUT_MS=5000
DB_CONNECT_TIMEOUT_MS=30000
DB_TRY_PRIVATE=false
DISABLE_ORDER_LISTEN=true
KEEP_ALIVE_MS=240000
```

### Optional (copy from Railway only if set)

`CLOUDINARY_*`, `RAZORPAY_*`, `RESEND_API_KEY`, `GMAIL_*`, `CRON_SECRET`.

Do **not** copy `RAILWAY_*` or `RENDER_*` variables.

See [`deploy/aws/env.example`](deploy/aws/env.example).

After editing env (rebuild so `NEXT_PUBLIC_*` bake in), use the safe redeploy from your clone:

```bash
sudo bash /path/to/clone/deploy/aws/redeploy.sh /path/to/clone
```

---

## 4. HTTPS with Caddy

**Order:** smoke-test over HTTP on the static IP first, then switch to the domain + Let's Encrypt when DNS is ready.

### 4a. Temporary HTTP (no domain yet)

Repo [`deploy/aws/Caddyfile`](deploy/aws/Caddyfile) ships with `:80` -> `127.0.0.1:3000` **active** for smoke tests (example IP `18.139.220.64`).

```bash
# After git pull in the clone (see nested path note below):
sudo cp /home/ubuntu/blessing/blessing/deploy/aws/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
curl -sS http://18.139.220.64/api/health
```

In `/etc/blessing.env` for this phase (then rebuild if `NEXT_PUBLIC_*` changed):

```text
PUBLIC_BASE_URL=http://18.139.220.64
NEXT_PUBLIC_SITE_URL=http://18.139.220.64
```

**Google Sign-In and production cutover need HTTPS + domain** — IP HTTP is smoke-test only.

`/opt/blessing` may be an rsync copy **without** `.git`. Pull in `~/blessing/blessing`, then copy the Caddyfile (and re-rsync the app tree if you deploy that way).

### 4b. Domain + Let's Encrypt

1. DNS: `A` record for `blessingpowerguide.in` (and `www`) → Lightsail **static IP**.
2. In the Caddyfile: comment out the `:80` block; uncomment `blessingpowerguide.in, www.blessingpowerguide.in`.
3. Copy + reload:

```bash
sudo cp /home/ubuntu/blessing/blessing/deploy/aws/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

4. Set production URLs and rebuild:

```text
NEXT_PUBLIC_SITE_URL=https://blessingpowerguide.in
PUBLIC_BASE_URL=https://blessingpowerguide.in
```

```bash
cd /opt/blessing
npm ci --include=dev
set -a; source /etc/blessing.env; set +a
npm run build
sudo systemctl restart blessing
```

### 4c. Free hostname (DuckDNS) - no `.in` purchase

If you do not have `blessingpowerguide.in` yet, use a free **DuckDNS** name that still reads like the brand:

**Recommended:** `blessingpowerguide.duckdns.org` -> A / current IP `18.139.220.64` (Lightsail static IP; update DuckDNS if you recreate the static IP).

1. Create a free account at [duckdns.org](https://www.duckdns.org/).
2. Create subdomain `blessingpowerguide` -> hostname `blessingpowerguide.duckdns.org`.
3. Set the IP to your Lightsail static IP (`18.139.220.64` today) and save.
4. Point Caddy at that host, set env URLs, rebuild, add Google JS origin (commands below).

Optional one-liner (no account): `https://18-139-220-64.sslip.io` - quick HTTPS tests only; prefer DuckDNS for a stable brand-like name.

After DuckDNS points at the static IP, on the Lightsail VM:

```bash
export BLESSING_HOST=blessingpowerguide.duckdns.org

# Caddy: HTTPS for DuckDNS (replaces temporary :80 smoke-test block)
sudo tee /etc/caddy/Caddyfile >/dev/null <<EOF
${BLESSING_HOST} {
	encode gzip
	reverse_proxy 127.0.0.1:3000
}
EOF
sudo systemctl reload caddy

# App URLs in /etc/blessing.env (do not touch secrets)
sudo sed -i "s|^PUBLIC_BASE_URL=.*|PUBLIC_BASE_URL=https://${BLESSING_HOST}|" /etc/blessing.env
sudo sed -i "s|^NEXT_PUBLIC_SITE_URL=.*|NEXT_PUBLIC_SITE_URL=https://${BLESSING_HOST}|" /etc/blessing.env
grep -q '^PUBLIC_BASE_URL=' /etc/blessing.env || echo "PUBLIC_BASE_URL=https://${BLESSING_HOST}" | sudo tee -a /etc/blessing.env
grep -q '^NEXT_PUBLIC_SITE_URL=' /etc/blessing.env || echo "NEXT_PUBLIC_SITE_URL=https://${BLESSING_HOST}" | sudo tee -a /etc/blessing.env

cd /opt/blessing
npm ci --include=dev
set -a; source /etc/blessing.env; set +a
npm run build
sudo systemctl restart blessing
curl -sS "https://${BLESSING_HOST}/api/health"
```

Then Google Cloud → OAuth Web client → **Authorized JavaScript origins** (no trailing slash):

```text
https://blessingpowerguide.duckdns.org
```

## 5. Google Cloud Console (required or Sign-In stays broken)

This shop uses **Google Identity Services (GIS)** — the “Continue with Google” button returns an ID token posted to `/api/auth/google`. It is **not** the OAuth redirect flow.

1. Open [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials).
2. Open the **OAuth 2.0 Client ID** matching `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (Web application).
3. Under **Authorized JavaScript origins**, **Add URI** (no trailing slash):

```text
https://blessingpowerguide.in
https://www.blessingpowerguide.in
```

If you test on a temporary hostname first, add that origin too.

4. **Authorized redirect URIs** — GIS does not need them; leave existing as-is (including Railway) until cutover.
5. **Save**. Wait 1–5 minutes.
6. Keep the Railway origin (`https://blessing-production.up.railway.app`) until cutover is done, then remove it.

### Local / preview (optional)

```text
http://localhost:3000
```

---

## 6. Verify cutover (AWS live — Railway still running)

### A. Probes (must pass)

```text
https://blessingpowerguide.in/api/health   → {"status":"ok",...}
https://blessingpowerguide.in/api/ready    → ready + Neon pooler host
```

PowerShell:

```powershell
Invoke-WebRequest "https://blessingpowerguide.in/api/health" -UseBasicParsing
Invoke-WebRequest "https://blessingpowerguide.in/api/ready" -UseBasicParsing
```

On the VM:

```bash
sudo systemctl status blessing --no-pager
journalctl -u blessing -n 80 --no-pager
curl -sS http://127.0.0.1:3000/api/health
```

### B. Product checks (must pass)

| Check | Pass when |
|-------|-----------|
| Home page | Loads on the Lightsail HTTPS URL |
| Google Sign-In | GIS button works; session cookie set |
| Admin | `/admin` Analytics loads for `ADMIN_EMAIL` |
| WhatsApp | Admin WhatsApp shows **Linked**; stay idle **20+ min** → still Linked |
| Orders | Place a test COD order (or open existing) on the AWS URL |

### C. Do **not** pause Railway until

- [ ] `/api/health` and `/api/ready` OK on AWS  
- [ ] Google Sign-In works on the AWS URL  
- [ ] Admin Analytics loads  
- [ ] WhatsApp still **Linked** after 20+ minutes idle  

Until then, Railway remains the live shop.

### Current status (repo docs)

| Target | Status |
|--------|--------|
| Railway | Keep running — verified healthy with Neon |
| Lightsail Singapore | **Not deployed by agents** — you create the VM (§1), then re-run §6 |

---

## 7. Custom domain polish + pause Railway

1. Confirm DNS + Caddy HTTPS green.
2. `NEXT_PUBLIC_SITE_URL` / `PUBLIC_BASE_URL` = production HTTPS URL → rebuild + restart.
3. Google JS origins include the production domain (§5).
4. Confirm §6 checks on that domain.
5. **Only then** pause Railway:

   - [Railway Dashboard](https://railway.app) → project → service **blessing** → **Settings** → pause.
   - Keep **Neon**. Do not delete Neon.
   - Optional: remove unused Railway Postgres if any leftover.

Do **not** pause Railway from scripts or agents — only after §6 passes on AWS.

---

## 8. Updates after go-live

**Use [`deploy/aws/redeploy.sh`](deploy/aws/redeploy.sh) only** — do not hand-roll rsync/`npm ci`/`restart` mid-build (that is the #1 cause of mass 502s).

```bash
# Pull latest, then one safe redeploy (stops → rsync → npm ci WITHOUT env → build WITH env → start → curl health/ready)
cd ~/blessing-src   # or ~/blessing/blessing — your git clone
git pull origin main
sudo bash deploy/aws/redeploy.sh "$PWD"
```

`redeploy.sh` aborts if `.next/server/middleware-manifest.json` is missing (never starts a broken build), removes nested `/opt/blessing/blessing` junk, and exits non-zero if localhost `/api/health` or `/api/ready` fail.

WhatsApp auth state lives in `WHATSAPP_SESSION_DIR` (default `/var/lib/blessing/whatsapp_session` on AWS). Prefer not wiping that directory without backing up session data. `setup-lightsail.sh` creates and chowns it for the app user.

### Connection refused on `:3000` while `blessing` is “active”

`active (running)` with uptime of a few hundred ms usually means **crash-loop** (systemd restarts faster than you notice). Check:

```bash
systemctl status blessing --no-pager
journalctl -u blessing -n 80 --no-pager
ss -lntp | grep 3000 || true
# CRLF / bad EnvironmentFile → many empty "" in cgroup / failed start:
sudo sed -i 's/\r$//' /etc/blessing.env
file /etc/blessing.env   # should say "ASCII text", not "with CRLF"
```

---

## 9. Recover from `502 Bad Gateway` (Caddy up, Next down)

DuckDNS/`blessingpowerguide.duckdns.org` returning **502** with `Server: Caddy` means Caddy is listening on 443 but **nothing healthy on `127.0.0.1:3000`**. CSP and app fixes only apply after Next is running again — **do not pause Railway** until AWS is stable (§6).

### Diagnose (SSH)

```bash
sudo systemctl status blessing caddy --no-pager
sudo journalctl -u blessing -n 50 --no-pager
curl -sS http://127.0.0.1:3000/api/health || true
ss -lntp | grep 3000 || true
```

| Symptom | Likely cause |
|---------|----------------|
| `blessing` inactive / failed | Process crashed or never started |
| Active but restarts every few seconds | Crash-loop (env CRLF, missing secrets, bad `DATABASE_URL`) |
| `ExecStartPre` fails / no `.next` | Mid-deploy: `rsync --delete` or `npm run build` wiped/replaced `.next` while service restarted |
| Exit 137 / “Killed” in journal | **OOM** on 1 GB plan (prefer $10 / 2 GB) |
| `curl :3000` fails but unit “active” | Crash-loop or wrong `WorkingDirectory` |

### Recover

```bash
# Soft restart
sudo systemctl restart blessing
sleep 8
curl -sS http://127.0.0.1:3000/api/health
curl -sS https://blessingpowerguide.duckdns.org/api/health
```

If health still fails — **stop and use the safe redeploy script** (never `restart` mid-build):

```bash
sudo sed -i 's/\r$//' /etc/blessing.env
cd ~/blessing-src   # or ~/blessing/blessing
git pull origin main
sudo bash deploy/aws/redeploy.sh "$PWD"
curl -sS https://blessingpowerguide.duckdns.org/api/health
```

**Deploy rule:** use `redeploy.sh` only. It stops → rsync → `npm ci --include=dev` (no env) → `npm run build` (with env) → verify middleware-manifest → start → curl health/ready. Never source `/etc/blessing.env` before `npm ci`.

### Build tip: `npm ci` + `NODE_ENV=production`

`/etc/blessing.env` sets `NODE_ENV=production`. If you `source` it **before** `npm ci`, npm omits `devDependencies` including `@tailwindcss/postcss`. The Turbopack/PostCSS build then fails, `.next` is incomplete (no `middleware-manifest`), and every page returns **500**. Fix: always `npm ci --include=dev` with a clean shell, then source env only for `npm run build`.

---

## 10. Cloudflare Free in front of Lightsail (optional, recommended)

App already emits `s-maxage` / `stale-while-revalidate` for `/`, `/api/products`, and `/_next/image`. Cloudflare Free absorbs repeat catalog/static hits so the VM stays free for checkout + WhatsApp.

1. Cloudflare → **Add site** → Free plan → add `blessingpowerguide.duckdns.org` **or** your future `.in` domain.
2. DNS: orange-cloud **proxied** record to Lightsail static IP (`18.139.220.64` today). For DuckDNS you may need a Cloudflare CNAME/A as Cloudflare documents for third-party DNS, or move the zone to Cloudflare nameservers when you own `.in`.
3. SSL/TLS mode: **Full** (Caddy already terminates HTTPS on the origin) or **Full (strict)** once the origin cert matches the hostname.
4. Cache rules (Free):
   - Cache everything under `/_next/static/*` (long TTL)
   - Short Edge TTL (60–120s) for `/` and anonymous catalog HTML
   - **Bypass cache** for `/api/*` when `Cookie` or `Authorization` is present (auth, orders, admin, checkout)
5. Do **not** cache WhatsApp/admin streams. Keep Railway running until §6 passes on the Cloudflare hostname too.

More Free-tier notes: [`docs/FREE-SCALE.md`](docs/FREE-SCALE.md). Skip catalog virtualization — the guide catalog is small.

---

## 11. 24/7 ops (honest Flipkart-feel)

You cannot literally zero all loading — Flipkart itself shows **skeletons**. Goal for Blessing Power Guide:

| OK | Not OK |
|----|--------|
| Brief skeleton / spinner while JSON loads | Blank white page, stuck forever, or raw 500 HTML |
| Auto-recover after Neon blip (`Restart=always`) | Serving a half-built `.next` (broken CSS / every route 500) |
| `/api/health` + `/api/ready` always return JSON quickly | Hanging TCP / empty Caddy 502 with no probe signal |

**Rules**

1. **Redeploy only via** `sudo bash deploy/aws/redeploy.sh /path/to/clone` — never restart while `npm run build` is running.
2. **Cloudflare Free** in front of Lightsail (§10) — cache `/_next/static/*` and short-TTL anonymous catalog; bypass cookie’d `/api/*`.
3. **Neon** — keep the **pooler** URL (`*-pooler.*.neon.tech`). If your Neon plan allows, **disable scale-to-zero** so the first catalog hit after idle is not a cold start.
4. **Railway** — keep running until DuckDNS (or `.in`) §6 checklist passes; then pause Railway only. Keep Neon.
5. **Keepalive** — already in-app (`KEEP_ALIVE_MS`, default ~4 min): DB ping + HTTP self-hit to `/api/health` via `PUBLIC_BASE_URL` / `NEXT_PUBLIC_SITE_URL`. No extra cron required on Lightsail (always-on VM). Optional external uptime (UptimeRobot) is fine but not required for WhatsApp.

**One-liner (Lightsail, after `git pull` in the clone):**

```bash
sudo bash deploy/aws/redeploy.sh ~/blessing-src
```

(Use your real clone path if different, e.g. `~/blessing/blessing`.)

---

## Files in this repo

| Path | Purpose |
|------|---------|
| [`deploy/aws/setup-lightsail.sh`](deploy/aws/setup-lightsail.sh) | Ubuntu bootstrap |
| [`deploy/aws/redeploy.sh`](deploy/aws/redeploy.sh) | Safe stop → rsync → ci → build → start → health |
| [`deploy/aws/blessing.service`](deploy/aws/blessing.service) | systemd unit (`Restart=always`) |
| [`deploy/aws/Caddyfile`](deploy/aws/Caddyfile) | HTTPS reverse proxy → `:3000` |
| [`deploy/aws/env.example`](deploy/aws/env.example) | Env keys (no secrets) |

---

## EC2 alternative (same pattern)

If you already use EC2: **Ubuntu 24.04**, **t3.small**, security group **22/80/443**, same script + systemd + Caddy in `ap-southeast-1`. No Amplify/Lambda.

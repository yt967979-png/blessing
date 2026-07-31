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
npm ci && npm run build

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
sudo chmod 600 /etc/blessing.env
sudo chown root:root /etc/blessing.env
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

### Recommended tuning (Lightsail 1–2 GB)

```text
NODE_ENV=production
RUNTIME_TIER=hobby
APP_REPLICA_COUNT=1
DB_POOL_MAX=5
DB_IDLE_TIMEOUT_MS=8000
DB_CONNECT_TIMEOUT_MS=15000
DB_TRY_PRIVATE=false
DISABLE_ORDER_LISTEN=true
KEEP_ALIVE_MS=240000
```

### Optional (copy from Railway only if set)

`CLOUDINARY_*`, `RAZORPAY_*`, `RESEND_API_KEY`, `GMAIL_*`, `CRON_SECRET`.

Do **not** copy `RAILWAY_*` or `RENDER_*` variables.

See [`deploy/aws/env.example`](deploy/aws/env.example).

After editing env:

```bash
cd /opt/blessing && npm ci && npm run build
sudo systemctl restart blessing
```

---

## 4. HTTPS with Caddy

Prefer a real domain (Let’s Encrypt needs a hostname pointing at the static IP).

1. DNS: `A` record for `blessingpowerguide.in` (and `www` if used) → Lightsail **static IP**.
2. Edit `/etc/caddy/Caddyfile` (repo template: [`deploy/aws/Caddyfile`](deploy/aws/Caddyfile)):

```caddy
blessingpowerguide.in, www.blessingpowerguide.in {
	reverse_proxy 127.0.0.1:3000
}
```

3. Reload:

```bash
sudo systemctl reload caddy
```

Until the custom domain is ready you can temporarily use HTTP on port 80 only for smoke tests (`curl http://<STATIC_IP>/api/health`) — **Google Sign-In and production should use HTTPS + domain**.

Set:

```text
NEXT_PUBLIC_SITE_URL=https://blessingpowerguide.in
PUBLIC_BASE_URL=https://blessingpowerguide.in
```

Rebuild if `NEXT_PUBLIC_*` changed (`npm run build` embeds public env), then `sudo systemctl restart blessing`.

---

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

```bash
cd /opt/blessing
git pull origin main
npm ci && npm run build
sudo systemctl restart blessing
```

WhatsApp auth state lives under the app working directory (and any Baileys session paths the app uses). Prefer not wiping `/opt/blessing` without backing up session data.

---

## Files in this repo

| Path | Purpose |
|------|---------|
| [`deploy/aws/setup-lightsail.sh`](deploy/aws/setup-lightsail.sh) | Ubuntu bootstrap |
| [`deploy/aws/blessing.service`](deploy/aws/blessing.service) | systemd unit |
| [`deploy/aws/Caddyfile`](deploy/aws/Caddyfile) | HTTPS reverse proxy → `:3000` |
| [`deploy/aws/env.example`](deploy/aws/env.example) | Env keys (no secrets) |

---

## EC2 alternative (same pattern)

If you already use EC2: **Ubuntu 24.04**, **t3.small**, security group **22/80/443**, same script + systemd + Caddy in `ap-southeast-1`. No Amplify/Lambda.

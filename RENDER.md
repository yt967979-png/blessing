# Deploy on Render (from Railway)

Neon DB stays the same. App moves to Render **Starter** in **Singapore** (matches Neon `ap-southeast-1`). Do **not** use Render Free — it sleeps and kills WhatsApp (Baileys in-process).

**Repo:** `yt967979-png/blessing` · **branch:** `main` · **Blueprint:** `render.yaml`

Railway is still production until Render passes the verify checklist below. **Do not pause Railway until that checklist passes.**

---

## 1. Create the service (Dashboard — recommended)

You need a [Render account](https://dashboard.render.com) linked to GitHub.

1. Open [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint**.
2. Connect GitHub if prompted → select **`yt967979-png/blessing`**.
3. Render reads `render.yaml`. Confirm:
   - Service name: **`blessing`**
   - Region: **Singapore**
   - Plan: **Starter** (not Free)
   - Health check: `/api/health`
4. Click **Apply**. The first deploy will **fail or stay pending** until you paste secrets (step 2) — that is expected.
5. After deploy, copy the public URL (e.g. `https://blessing.onrender.com` or `https://blessing-xxxx.onrender.com`).

### Alternate: Web Service (no Blueprint)

1. **New** → **Web Service** → same repo / `main`.
2. Runtime **Node**, build `npm ci && npm run build`, start `npm start`.
3. Region **Singapore**, instance **Starter**, health check `/api/health`.
4. Paste every env from §2 (including Blueprint knobs).

### CLI (optional)

`render` CLI is **not** required. If you install it later:

```bash
# https://render.com/docs/cli
npm i -g render-cli
# or: curl -fsSL https://render.com/install.sh | bash
render login
cd /path/to/blessing-power-guide-next
render blueprint launch
```

Then set `sync: false` env vars in the Dashboard (CLI cannot invent Neon secrets).

---

## 2. Copy environment variables

### Helper (masked checklist)

```powershell
powershell -File scripts/export-railway-env-for-render.ps1
```

Requires Railway CLI logged in (`railway whoami`). Values are **masked** — copy full secrets from **Railway → blessing → Variables**.

### Required (paste into Render → blessing → Environment)

| Key | Source / value |
|-----|----------------|
| `DATABASE_URL` | Neon **pooled** URL (`*-pooler.*.neon.tech`) — same as Railway |
| `SESSION_SECRET` | Same as Railway (≥32 chars) |
| `ADMIN_EMAIL` | Your Google admin email |
| `ADMIN_PASSWORD` | Same as Railway (password login is off; still set) |
| `ADMIN_PHONE` | WhatsApp admin alerts |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Same Google OAuth client ID |
| `NEXT_PUBLIC_SITE_URL` | `https://<your-service>.onrender.com` first (not Railway) |

### Optional (copy if set on Railway)

| Key | Notes |
|-----|--------|
| `CLOUDINARY_CLOUD_NAME` | Catalog image uploads |
| `CLOUDINARY_API_KEY` | If used |
| `CLOUDINARY_UPLOAD_PRESET` | Unsigned preset (required for uploads if Cloudinary is used) |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Online pay — skip if COD-only |
| `RESEND_API_KEY` | Email — skip if unused |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | Optional admin alert mail via Nodemailer |
| `CRON_SECRET` | Only if you call courier/abandon cron URLs externally |

Do **not** copy `RAILWAY_*` variables.

### Set by Blueprint (`render.yaml`) — leave as-is unless debugging

`NODE_VERSION`, `NODE_ENV`, `RUNTIME_TIER=hobby`, `APP_REPLICA_COUNT=1`, `DB_POOL_MAX=5`, `DB_IDLE_TIMEOUT_MS=8000`, `DB_CONNECT_TIMEOUT_MS=15000`, `DB_ACQUIRE_RETRIES`, `DB_CONNECT_ROUNDS`, `DB_PING_RETRIES`, `DB_TRY_PRIVATE=false`, `DISABLE_ORDER_LISTEN=true`, `KEEP_ALIVE_MS=240000`.

After secrets are saved, **Manual Deploy** → **Deploy latest commit** (or push an empty commit) so the service boots with env.

See also [`render.env.example`](render.env.example).

---

## 3. Google Cloud Console (required or Sign-In stays broken)

This shop uses **Google Identity Services (GIS)** — the “Continue with Google” button (`google.accounts.id.renderButton`) returns an **ID token** posted to `/api/auth/google`. It is **not** the OAuth redirect / authorization-code flow.

### Exact checklist

1. Open [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials).
2. Open the **OAuth 2.0 Client ID** whose ID matches `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (Web application).
3. Under **Authorized JavaScript origins**, click **Add URI** and add (no trailing slash):

```text
https://blessing.onrender.com
```

Replace `blessing` with your real Render subdomain after first deploy (e.g. `https://blessing-xxxx.onrender.com`).

When the custom domain is live, also add:

```text
https://blessingpowerguide.in
https://www.blessingpowerguide.in
```

4. **Authorized redirect URIs** — this app does **not** redirect to Google and back. GIS only needs JavaScript origins. You can leave existing redirect URIs as-is. If Google forces at least one redirect URI on the Web client, add (harmless unused placeholders):

```text
https://blessing.onrender.com
https://blessingpowerguide.in
```

(Again, swap in the real `*.onrender.com` host.)

5. **Save**. Wait 1–5 minutes for Google to propagate.
6. Keep the Railway origin (`https://blessing-production.up.railway.app`) until cutover is done, then remove it.

### Local / preview (optional)

```text
http://localhost:3000
```

---

## 4. Verify cutover (Render live — Railway still running)

### A. Probes (must pass)

```text
https://<your-service>.onrender.com/api/health   → {"status":"ok",...}
https://<your-service>.onrender.com/api/ready    → ready + Neon pooler host
```

PowerShell:

```powershell
Invoke-WebRequest "https://<your-service>.onrender.com/api/health" -UseBasicParsing
Invoke-WebRequest "https://<your-service>.onrender.com/api/ready" -UseBasicParsing
```

### B. Product checks (must pass)

| Check | Pass when |
|-------|-----------|
| Home page | Loads on `*.onrender.com` |
| Google Sign-In | GIS button works; session cookie set |
| Admin | `/admin` Analytics loads for `ADMIN_EMAIL` |
| WhatsApp | Admin WhatsApp shows **Linked**; stay idle **20+ min** → still Linked |
| Orders | Place a test COD order (or open existing) on Render URL |

### C. Do **not** pause Railway until

- [ ] `/api/health` and `/api/ready` OK on Render  
- [ ] Google Sign-In works on the Render URL  
- [ ] Admin Analytics loads  
- [ ] WhatsApp still **Linked** after 20+ minutes idle  

Until then, Railway (`https://blessing-production.up.railway.app`) remains the live shop.

### Current status (repo docs)

| Target | Status |
|--------|--------|
| Railway | Keep running — verified healthy with Neon |
| Render `*.onrender.com` | **Not deployed yet** — create Blueprint (§1), then re-run §4 |

---

## 5. Custom domain + pause Railway

1. Render → **blessing** → **Custom Domains** → add `blessingpowerguide.in` (and `www` if used).
2. Update DNS records exactly as Render shows.
3. Set `NEXT_PUBLIC_SITE_URL=https://blessingpowerguide.in` → redeploy.
4. Add custom-domain origins in Google Console (§3).
5. Confirm §4 checks on the custom domain.
6. **Only then** pause Railway:

   - [Railway Dashboard](https://railway.app) → project **grand-spontaneity** → service **blessing** → **Settings** → **Danger** / pause (or remove the web service).
   - Keep **Neon** (external). Do not delete Neon.
   - Optional: delete unused Railway Postgres if any leftover (this app already uses Neon).

Do **not** pause Railway from scripts or agents — only after §4 passes on Render.

---

## Why Starter

Baileys runs **in-process**. Free instances sleep ~15 minutes idle → QR/session dies. Starter stays up.

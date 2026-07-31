# Deploy on Render (from Railway)

Neon DB stays the same. App moves to Render **Starter** in **Singapore** (matches Neon `ap-southeast-1`). Do **not** use Render Free — it sleeps and kills WhatsApp.

## 1. Create the service

1. Push this repo (`render.yaml` included).
2. [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint** → select `yt967979-png/blessing` (or **Web Service** and point at the repo).
3. Confirm region **Singapore**, plan **Starter**, service name `blessing`.

Or CLI (if logged in):

```bash
render blueprint launch
```

## 2. Copy environment variables

From Railway → blessing → Variables, set these on Render (Dashboard → Environment):

| Key | Notes |
|-----|--------|
| `DATABASE_URL` | Neon **pooled** URL (`*-pooler.*.neon.tech`) |
| `SESSION_SECRET` | Same as Railway (≥32 chars) |
| `ADMIN_EMAIL` | Your Google admin email |
| `ADMIN_PASSWORD` | Strong password (password login is off; still rotate) |
| `ADMIN_PHONE` | WhatsApp admin alerts |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Same Google client ID |
| `NEXT_PUBLIC_SITE_URL` | `https://<your-service>.onrender.com` first |
| `CLOUDINARY_*` | If used |
| `RAZORPAY_*` | If used |
| `RESEND_API_KEY` | If used |

Blueprint already sets pool/runtime knobs (`RUNTIME_TIER`, `DB_*`, `DISABLE_ORDER_LISTEN`, etc.).

## 3. Google OAuth (required or Sign-In stays broken)

[Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials) → OAuth 2.0 Client ID used by the shop → **Authorized JavaScript origins**:

Add exactly:

```text
https://blessing.onrender.com
```

(Replace `blessing` with your real Render service subdomain after first deploy.)

When the custom domain is live, also add:

```text
https://blessingpowerguide.in
https://www.blessingpowerguide.in
```

Keep the existing Railway origin until you finish cutover, then remove it.

## 4. Verify

```text
https://<your-service>.onrender.com/api/health   → ok
https://<your-service>.onrender.com/api/ready    → ready / neon host
```

Then: Google login → Admin Analytics → WhatsApp QR Linked → leave idle 20+ min → still Linked.

## 5. Custom domain + cutover

1. Render → Custom Domains → add `blessingpowerguide.in`
2. Update DNS as Render shows
3. Set `NEXT_PUBLIC_SITE_URL=https://blessingpowerguide.in`
4. Update Google origins
5. **Pause** the Railway web service (keep Neon; Railway Postgres unused)

## Why Starter

Baileys runs **in-process**. Free instances sleep ~15 minutes idle → QR/session dies. Starter stays up.

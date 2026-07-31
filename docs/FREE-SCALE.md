# Free plan + Cloudflare Free (no paid services)

You are on **Railway Free** (not Hobby ~$5). Put **Cloudflare Free** in front so repeat catalog/page views hit the CDN instead of your free container.

Realistic Free target after app caching: **~20–80 concurrent catalog browsers**. Checkout / WhatsApp stay far fewer (often under ~20). This is not Hobby-scale (~50–150) and not Flipkart-scale.

## Force free tuning on Railway

In Railway → Variables, set:

```text
RUNTIME_TIER=free
LAUNCH_SCALE=soft
DB_POOL_MAX=2
```

Without `RUNTIME_TIER=free`, auto-detect may treat a larger free container as `hobby`.

## Cloudflare setup (about 10 minutes)

1. Add your custom domain in **Railway** (service → Settings → Domains) and note the Railway hostname.
2. In **Cloudflare**, add the same domain (Free plan).
3. Point nameservers to Cloudflare (or CNAME as Cloudflare instructs).
4. DNS: `A` / `CNAME` → Railway target with proxy **orange cloud ON**.
5. SSL/TLS: **Full** (or Full Strict if the cert matches).
6. Cache rules (Free):
   - Long TTL for `/_next/static/*`
   - Optional short Edge TTL (60–120s) for `/` and `/shop`
7. Do **not** cache authenticated `/api/*` (checkout, auth, admin, orders). Bypass when `Cookie` / `Authorization` is present.

## What the app already does (Free-friendly)

- In-memory catalog cache (~15 min) + `s-maxage` / SWR on anonymous `/api/products`
- Tiny Postgres pool (**2** on Free)
- Memory-first rate limits
- WhatsApp in the **same** web service (lazy connect — no second service)
- Catalog uploads require Cloudinary Free (URLs, not base64)

## Env checklist (Free)

| Variable | Suggested |
|----------|-----------|
| `RUNTIME_TIER` | `free` |
| `LAUNCH_SCALE` | `soft` |
| `DB_POOL_MAX` | `2` |
| `CLOUDINARY_CLOUD_NAME` | your free cloud |
| `CLOUDINARY_UPLOAD_PRESET` | **unsigned** upload preset |
| `RATE_LIMIT_USE_DB` | unset / `false` |

## When traffic explodes (exam day)

Expect slowdowns or sleep/restart limits on Free. Upgrading Railway or adding Redis/replicas costs money — outside a free-only budget.

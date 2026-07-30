---
name: blessing-ecommerce
description: >-
  Build and evolve Blessing Power Guide (and similar India COD + courier
  e-commerce) the right way: cross-cutting order/cancel/AWB/revenue changes,
  Flipkart-style shop UX, Google auth, ST Courier, WhatsApp, admin ops. Use when
  working on this shop, checkout, orders, admin, tracking, cancel, coupons,
  products, WhatsApp, invoices, or when the user asks to improve the e-commerce
  website / store / shop.
---

# Blessing Power Guide — Ecommerce Skill

Read this skill **before** implementing shop features. Prefer fixing the whole
surface map over a single-file patch.

## Product facts (do not invent)

- Brand: **Blessing Power Guide** — 6th–12th Tamil Nadu guide books
- Auth: **Google only** (no guest/phone OTP login); long-lived session until logout
- Payment: **COD** primary; Razorpay when configured
- Courier: **ST Courier Express** — admin pastes real AWB; site verifies + syncs
- Comms: **WhatsApp** (Baileys in-process) for order updates
- Policy: **no returns** on guide books (final sale) — say so in shipping/footer copy
- Hosting: Railway production; do not claim Flipkart-scale inventory/traffic

## Non‑negotiable: cross-cutting changes

When changing **orders / status / cancel / AWB / payment / revenue / coupons /
stock / WhatsApp**, update **every** related layer in the same pass:

| Layer | Typical paths |
|-------|----------------|
| Cancel / write API | `src/app/api/orders/cancel`, never soft-cancel via PATCH/timeline alone |
| Status / AWB guards | `api/orders` PATCH, `api/orders/timeline`, `api/courier/*`, `lib/stCourier` |
| Revenue | `api/admin/analytics`, admin KPI fallbacks, `api/admin/users` spend |
| Admin UI | `src/app/admin/page.tsx` — badges, progress, AWB lock, labels |
| Customer UI | `orders`, `profile`, `track` pages |
| Public track API | `api/track` — skip courier sync when cancelled |
| WhatsApp | `api/whatsapp` templates must match status (esp. CANCEL) |
| Invoice / label | `lib/invoiceGenerator`, admin print label, `api/orders/[id]/invoice` |
| DB heal | `lib/db` startup if old rows need payment_status / schema |
| Shared helper | `lib/orderStatus.ts` (`isOrderCancelled`, `paymentStatusAfterCancel`) |

**Rule:** if another page can still show the *old* behavior, the task is incomplete.
Search for the status/field name and close every hit.

### Cancel contract (must all happen)

1. `order_status = Cancelled`
2. `payment_status` via `paymentStatusAfterCancel` (COD = not collectible)
3. Restore book stock
4. Rollback coupon `used_count` + delete redemption
5. Timeline event + WhatsApp cancel message
6. Exclude from revenue/analytics
7. Lock AWB / dispatch / status advances
8. Red Cancelled UI on admin + customer + track (not green “live”)

## Build workflow (every feature)

1. **Read** Next docs under `node_modules/next/dist/docs/` before new Next APIs
2. **Map surfaces** — list admin / customer / API / WhatsApp / DB touches first
3. **Implement write path** with correct side effects
4. **Mirror UI** admin + customer + track in the same change
5. **Guard** illegal transitions (cancelled, delivered, packed rules)
6. **Typecheck** (`tsc`) before claiming done
7. Remember: **uncommitted ≠ live on Railway** — say if deploy is needed

## UX standards (this shop)

- Flipkart-like: clear order ID, status tabs (All / Active / Delivered / Cancelled), honest ETA
- Mobile-first; Tamil Nadu delivery context (ST Courier, pincode messaging)
- Do **not** invent fake stats, fake AWB, or “millions of students” copy
- Design: follow user frontend rules (brand-first, real imagery, no generic AI purple cream broadsheet look) when building marketing pages
- Prefer existing components/patterns in the repo over new design systems

## Auth & security

- Admin routes: `verifyAdminRequest`
- Customer order routes: session + ownership checks
- Rate-limit public track / cancel / courier
- Never expose DB credentials or paste secrets into chat/commits

## Feature playbooks

### New order status
- Add to admin action list + customer step maps + WhatsApp branch + timeline STAGE_META
- Sync mapping in `lib/stCourier` if courier-driven
- Never leave one UI showing a different label for the same DB value

### AWB / dispatch
- Verify docket before save; reject if order cancelled
- Cron/bulk sync must exclude cancelled + delivered
- Labels: no fake AWB; pending = PENDING DISPATCH; cancelled = DO NOT SHIP

### Catalog / stock
- Stock decrements on place; restores on cancel
- Low-stock admin alerts stay accurate after cancel restore

### Coupons
- Redeem on successful place; rollback on cancel
- Redemptions list should expose cancelled flag when relevant

## Quality bar before “done”

- [ ] All surfaces in the map updated
- [ ] Cancelled never counts as revenue or looks “live shipping”
- [ ] Illegal AWB/status paths return 4xx
- [ ] WhatsApp copy matches status
- [ ] Mobile + desktop of touched pages still usable
- [ ] User told if Railway deploy is still required

## Extra reference

- Surface checklist & anti-patterns: [reference.md](reference.md)

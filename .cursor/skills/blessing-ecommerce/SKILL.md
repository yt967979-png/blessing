---
name: blessing-ecommerce
description: >-
  Build and evolve Blessing Power Guide (and similar India courier
  e-commerce) the right way: cross-cutting order/cancel/AWB/revenue changes,
  Flipkart-style shop UX, password + Google auth, Razorpay, ST Courier,
  admin ops. Use when working on this shop, checkout, orders, admin,
  tracking, cancel, products, invoices, or when the user asks to
  improve the e-commerce website / store / shop.
---

# Blessing Power Guide — Ecommerce Skill

Read this skill **before** implementing shop features. Prefer fixing the whole
surface map over a single-file patch.

## Product facts (do not invent)

- Brand: **Blessing Power Guide** — 6th–12th Tamil Nadu guide books
- Auth: **Google primary** (Continue with Google → collect name + phone if incomplete / new user). Password register/login stays as secondary “or use email”. No guest checkout; **no OTP** / no Baileys. Long-lived session until logout
- Payment: **Razorpay only** (UPI / cards / netbanking). **COD disabled** in API and all checkout UIs — do not re-offer Cash on Delivery
- Checkout confirm: **Before Razorpay**, checkout must ask **Confirm order** or **No**. **No** → return to cart/previous (do not open payment). **Confirm** → create Razorpay order + checkout
- Post-payment: Order is **Confirmed** immediately after successful Razorpay place. Show Flipkart-style confirmation **on the success screen** (order #, amount paid, items, next steps)
- Coupons: **Disabled** product-wide (APIs return 410; no customer/admin apply UI). Historical `coupon_*` DB columns/tables may remain; cancel rollback must stay a safe no-op
- Courier: **ST Courier Express** — admin pastes real AWB; site verifies + syncs
- Comms: **No Baileys / no bot / no transactional WhatsApp**. Only a UI message icon that opens `wa.me/<shop phone>` (`ADMIN_PHONE` / `NEXT_PUBLIC_ADMIN_PHONE`, see `src/lib/shopContact.ts`). Track status on-site / My Orders
- Admin: New paid orders appear in Admin → Orders; play a short notification sound when a new order arrives while the admin tab is open (SSE). No Admin WhatsApp pairing tab
- Policy: **no returns / no customer cancel / final sale** on guide books — say so in shipping/footer copy. Customers cannot cancel. **Admin cancel** of a paid Razorpay order **must refund via Razorpay** (refund-first; abort cancel if refund fails); stock restore + revenue exclude still apply
- Hosting: AWS Lightsail (and/or Railway); do not claim Flipkart-scale inventory/traffic

## Non‑negotiable: cross-cutting changes

When changing **orders / status / cancel / AWB / payment / revenue /
stock**, update **every** related layer in the same pass:

| Layer | Typical paths |
|-------|----------------|
| Cancel / write API | `src/app/api/orders/cancel`, never soft-cancel via PATCH/timeline alone |
| Status / AWB guards | `api/orders` PATCH, `api/orders/timeline`, `api/courier/*`, `lib/stCourier` |
| Revenue | `api/admin/analytics`, admin KPI fallbacks, `api/admin/users` spend |
| Admin UI | `src/app/admin/page.tsx` — badges, progress, AWB lock, labels |
| Customer UI | `orders`, `profile`, `track` pages |
| Public track API | `api/track` — skip courier sync when cancelled |
| Invoice / label | `lib/invoiceGenerator`, admin print label, `api/orders/[id]/invoice` |
| DB heal | `lib/db` startup if old rows need payment_status / schema |
| Shared helper | `lib/orderStatus.ts` (`isOrderCancelled`, `paymentStatusAfterCancel`) |

**Rule:** if another page can still show the *old* behavior, the task is incomplete.
Search for the status/field name and close every hit.

### Cancel contract (must all happen)

1. **Admin only** — customer API/UI must not cancel
2. Paid Razorpay + `razorpay_payment_id`: **refund first** via Razorpay Refunds API; on failure **abort** cancel
3. `order_status = Cancelled`
4. `payment_status` via `paymentStatusAfterCancel` (`Refunded` when refunded; legacy COD = not collectible)
5. Store `razorpay_refund_id` when present; timeline remarks include refund id
6. Restore book stock
7. Coupon rollback if historical `coupon_id` exists (safe no-op when tables empty)
8. Timeline event (no WhatsApp message)
9. Exclude from revenue/analytics
10. Lock AWB / dispatch / status advances
11. Red Cancelled UI on admin + customer + track (not green “live”)

## Build workflow (every feature)

1. **Read** Next docs under `node_modules/next/dist/docs/` before new Next APIs
2. **Map surfaces** — list admin / customer / API / DB touches first
3. **Implement write path** with correct side effects
4. **Mirror UI** admin + customer + track in the same change
5. **Guard** illegal transitions (cancelled, delivered, packed rules)
6. **Typecheck** (`tsc`) before claiming done
7. Remember: **uncommitted ≠ live** — say if Lightsail/Railway deploy is needed

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
- Admin seed (`ensureAdminUser` / `scripts/init-db.js`): **ADMIN_EMAIL + ADMIN_PASSWORD only** — never hardcode weak passwords; production requires a strong password; do not reset existing admin password unless `ADMIN_FORCE_PASSWORD_RESET=true`
- Never expose DB credentials or paste secrets into chat/commits

## Feature playbooks

### New order status
- Add to admin action list + customer step maps + timeline STAGE_META
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
- Product-disabled. Do not re-wire customer apply or admin coupon tab without an explicit product decision.
- If historical redemptions exist, cancel rollback must remain try/catch safe.

## Quality bar before “done”

- [ ] All surfaces in the map updated
- [ ] Cancelled never counts as revenue or looks “live shipping”
- [ ] Illegal AWB/status paths return 4xx
- [ ] No Baileys / notify WhatsApp runtime paths
- [ ] Checkout confirm step runs before Razorpay
- [ ] Mobile + desktop of touched pages still usable
- [ ] User told if Lightsail/Railway deploy is still required

## Extra reference

- Surface checklist & anti-patterns: [reference.md](reference.md)

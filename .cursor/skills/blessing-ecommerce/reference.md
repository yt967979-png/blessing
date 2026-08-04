# Blessing ecommerce — reference

## Key files

| Concern | Files |
|---------|--------|
| Place order | `src/app/api/orders/route.ts` |
| Cancel | `src/app/api/orders/cancel/route.ts` |
| Timeline / status | `src/app/api/orders/timeline/route.ts` |
| Live admin stream | `src/app/api/orders/stream/route.ts` |
| Analytics | `src/app/api/admin/analytics/route.ts` |
| Track public | `src/app/api/track/route.ts`, `src/app/track/page.tsx` |
| ST Courier | `src/lib/stCourier.ts`, `src/app/api/courier/*` |
| WhatsApp (disabled) | `src/lib/notify/send.ts` (no-op), `api/whatsapp/*` → 410 |
| Status helpers | `src/lib/orderStatus.ts` |
| Invoice | `src/lib/invoiceGenerator.ts` |
| Admin UI | `src/app/admin/page.tsx` |
| Checkout | `src/app/checkout/page.tsx` (confirm before Razorpay) |
| My Orders | `src/app/orders/page.tsx` |
| Profile orders | `src/app/profile/page.tsx` |
| Auth | `src/lib/auth.ts`, `src/lib/serverSecurity.ts` |
| Schema / heal | `src/lib/db.ts` |

## Anti-patterns

- Updating only admin and forgetting `/orders` or `/track`
- Setting `order_status = Cancelled` without stock/coupon/`payment_status`
- Counting cancelled `total_amount` in revenue
- Green “live tracking” badges on cancelled orders
- Fake AWB numbers on labels (`SHP-…` as if real docket)
- Claiming Flipkart-level automation the site does not have
- Soft-cancel via PATCH or timeline instead of `/api/orders/cancel`
- One-off status string checks that diverge (`Cancelled` vs `cancel` vs `CANCELLED`) — use `isOrderCancelled`
- Re-enabling WhatsApp/Baileys without an explicit product decision
- Opening Razorpay without an on-page Confirm order step

## Cancel rules

- Customer: **cannot cancel** (API 403, no UI)
- Admin: until delivered; paid Razorpay → refund first then cancel
- Delivered: never cancel via app
- Refund helper: `src/lib/razorpayRefund.ts`

## Deploy reminder

Local edits are not production until git push + Lightsail redeploy (`sudo bash deploy/aws/redeploy.sh ~/blessing-src` after `git pull`).

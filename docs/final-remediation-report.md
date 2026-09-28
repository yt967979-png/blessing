# Final Remediation Report
**Blessing Power Guide — Production Verification & Adversarial Remediation**
**Date**: 2026-09-28
**Scope**: Complete Remediation, Adversarial Verification, Invariant Validation, and Final Classification Matrix

---

## 1. BUG-001 — Razorpay Network Calls Inside Database Transaction

* **Previous State**:
  In `src/app/api/orders/route.ts`, `await client.query('BEGIN')` was invoked before `verifyRazorpayPayment()`. While holding an open PostgreSQL transaction and client connection, `verifyRazorpayPayment()` in `src/lib/orderPricing.ts` made two external HTTP `fetch()` requests to `api.razorpay.com` (`/v1/payments/...` and `/v1/orders/...`) without any `AbortSignal.timeout(...)`. Furthermore, `src/lib/razorpayRefund.ts` dispatched refund requests without timeout bounds. A delay or outage at Razorpay caused database connection pool exhaustion and cascading 500/503 outages across all endpoints.
* **Fix**:
  1. Restructured `POST /api/orders` to execute read-only pricing calculation (`priceCheckoutOrder`) and external payment verification (`verifyRazorpayPayment`) *outside* and *before* opening a PostgreSQL transaction.
  2. Added strict `signal: AbortSignal.timeout(8000)` and timeout error trapping to all Razorpay API requests in `src/lib/orderPricing.ts` and `src/lib/razorpayRefund.ts`.
  3. Re-checked idempotency keys (`idempotency_key`) and payment duplicates (`razorpay_payment_id`, `razorpay_order_id`) with row-level locks (`FOR UPDATE`) *inside* the transaction once opened, completely preventing TOCTOU concurrency races.
  4. Preserved automated refund dispatch (`refundOrphanedCapture`) if any failure occurs after Razorpay verification is confirmed.
* **Files Changed**:
  * `src/app/api/orders/route.ts`
  * `src/lib/orderPricing.ts`
  * `src/lib/razorpayRefund.ts`
* **Tests**:
  * `scripts/verify-final-remediation.js` (Tests 1.1, 1.2, 1.3, 1.4)
  * `scripts/verify-production-5-challenges.js` (Challenge 3: Delayed webhook & timeout races)
* **Result**: **PASS** — HTTP requests are bounded to 8000ms; database connections are never held open during gateway I/O; concurrency races are prevented by in-transaction locks.

---

## 2. BUG-002 — Local VPS Disk Storage for Uploaded Media

* **Previous State**:
  In `src/app/api/upload/route.ts`, file uploads were written directly to `process.cwd()/public/uploads` using `fs.promises.writeFile`, and returned hardcoded `provider: 'vps-disk'`. In multi-replica container environments or ephemeral container setups (e.g. AWS ECS, Render, Railway multi-replica), uploaded images were not accessible across replica nodes (HTTP 404) and were destroyed upon container redeployments.
* **Fix**:
  1. Implemented a storage abstraction in `src/lib/storage.ts` with `StorageProvider` interface, `LocalStorageProvider` (for single-VPS/development), and `S3CompatibleStorageProvider` (for AWS S3, Cloudflare R2, MinIO, Wasabi).
  2. Implemented native AWS SigV4 signed HTTP PUT uploads in `S3CompatibleStorageProvider` using Node.js standard `crypto` library (zero extra external dependencies).
  3. Built automatic provider resolution via `getStorageProvider()`, switching to S3/R2 when `S3_BUCKET` / `R2_BUCKET` credentials are configured.
  4. Enforced strict path traversal sanitization (`path.basename` and regex stripping of non-alphanumeric directory characters) preventing directory breakout.
  5. Refactored `src/app/api/upload/route.ts` to delegate file saving to `getStorageProvider().saveFile(...)`.
* **Files Changed**:
  * `src/lib/storage.ts` (New module)
  * `src/app/api/upload/route.ts`
* **Tests**:
  * `scripts/verify-final-remediation.js` (Tests 2.1, 2.2, 2.3, 2.4, 2.5)
* **Result**: **PASS** — Storage is abstracted; multi-replica S3/R2 persistence enabled; path traversal strictly neutralized; local VPS disk fallback maintained for development.

---

## 3. BUG-003 — JSON-LD Script Breakout & Potential XSS

* **Previous State**:
  Storefront pages (`src/app/products/[slug]/ProductDetailClient.tsx`, `src/app/products/[slug]/page.tsx`, and `src/app/page.tsx`) embedded Schema.org JSON-LD scripts using `dangerouslySetInnerHTML={{ __html: JSON.stringify(...) }}`. Because `JSON.stringify` does not escape `<`, any occurrence of `</script>` in a book title, description, or author string would terminate the HTML `<script>` block and allow HTML/script injection.
* **Fix**:
  1. Created centralized safe serializer `src/lib/jsonLd.ts` with `serializeJsonLd(data: unknown): string`.
  2. Guaranteed that all `<` characters in the JSON payload are converted to Unicode `\u003c`, strictly preventing the HTML tokenizer from detecting `</script>` while remaining 100% compliant with JSON and Schema.org parsers.
  3. Replaced raw `JSON.stringify` with `serializeJsonLd` across all product, breadcrumb, organization, and website schema tags.
* **Files Changed**:
  * `src/lib/jsonLd.ts` (New module)
  * `src/app/products/[slug]/ProductDetailClient.tsx`
  * `src/app/products/[slug]/page.tsx`
  * `src/app/page.tsx`
* **Tests**:
  * `scripts/verify-final-remediation.js` (Tests 3.1, 3.2, 3.3)
* **Result**: **PASS** — Malicious payload `</script><script>alert("XSS")</script>` escaped to `\u003c/script>`; data fidelity preserved upon `JSON.parse`.

---

## 4. BUG-004 — Delivered Order State Regression

* **Previous State**:
  In `src/app/api/orders/route.ts`, status regressions from `Delivered` were checked via `backwardStatuses = new Set(['Packed', 'Confirmed', 'Order Placed', 'Handed to ST Courier'])`. The set omitted `'In Transit'` and `'Out for Delivery'`, allowing an administrative API call or malfunctioning background sync to regress a completed `Delivered` order back to active delivery states.
* **Fix**:
  1. Implemented canonical order state machine validator `canTransitionOrderStatus(currentStatus, nextStatus)` in `src/lib/orderStatus.ts`.
  2. Explicitly defined transition rules:
     * Once `Delivered`, the ONLY allowable subsequent transitions are `Returned` or `RTO` (or idempotent `Delivered`).
     * Transition from `Delivered` to `In Transit`, `Out for Delivery`, `Delivery Attempted`, `Handed to ST Courier`, `Packed`, `Confirmed`, or `Order Placed` is strictly rejected with HTTP 409 Conflict.
     * Terminal states `Cancelled` and `Returned` cannot transition to any active state.
  3. Replaced the ad-hoc blacklist in `src/app/api/orders/route.ts` with `canTransitionOrderStatus`.
* **Files Changed**:
  * `src/lib/orderStatus.ts`
  * `src/app/api/orders/route.ts`
* **Tests**:
  * `scripts/verify-final-remediation.js` (Tests 4.1, 4.2, 4.3, 4.4)
  * `scripts/verify-extended-lifecycle.js` (Section 5.9)
* **Result**: **PASS** — Delivered status regressions blocked; terminal state protections enforced; legitimate returns permitted.

---

## 5. BUG-005 — Device-Binding Authentication Bypass

* **Previous State**:
  In `src/lib/auth.ts`, `verifySessionToken` evaluated `if (bound && deviceId && !timingSafeUtf8Equal(bound, deviceId)) return null;`. If an attacker stole a device-bound session token (`bound = payload.did`) and submitted an API request omitting both the `bpg_device` cookie and `x-device-id` header, `deviceId` was `null`/`undefined`. The condition `bound && deviceId` evaluated to `false`, allowing the stolen token to authenticate without matching the bound device.
* **Fix**:
  1. Corrected `verifySessionToken` in `src/lib/auth.ts`:
     ```ts
     const bound = String(payload.did || '');
     if (bound) {
       if (!deviceId || !timingSafeUtf8Equal(bound, deviceId)) {
         return null;
       }
     }
     ```
     If a token is bound to a device ID, the request *must* supply the matching device ID; requests omitting the device identifier or presenting a mismatched ID are strictly rejected.
  2. Updated `getDeviceIdFromRequest(request)` to check cookies (`bpg_device`), headers (`x-device-id`), and URL search parameters (`?deviceId=...`).
  3. Implemented short-lived (5-minute TTL) dedicated stream tickets (`createStreamTicket` / `verifyStreamTicket`) scoped specifically for SSE event streams (`purpose: 'sse_stream'`), preventing general session tokens from being exposed in URL query strings.
* **Files Changed**:
  * `src/lib/auth.ts`
* **Tests**:
  * `scripts/verify-final-remediation.js` (Tests 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7)
* **Result**: **PASS** — Requests presenting device-bound tokens without matching device IDs return `null` (HTTP 401); token tampering rejected; stream ticket separation enforced.

---

## 6. Related Vulnerabilities Found & Addressed

1. **Un-timed Refund HTTP Requests**:
   * Located in `src/lib/razorpayRefund.ts`. Multiple `fetch()` calls to Razorpay's refund endpoints lacked timeouts.
   * *Remediation*: Added `signal: AbortSignal.timeout(8000)` across all payment inspection and refund dispatch endpoints.
2. **Missing Path Traversal Guard on File Keys**:
   * Storage key generation could theoretically permit nested `../` segments if filename was user-manipulated.
   * *Remediation*: Added `path.basename` and regex alphanumeric filtering in `LocalStorageProvider` and `S3CompatibleStorageProvider`.
3. **Multi-Page Schema XSS Surface**:
   * Audited all occurrences of `application/ld+json` across `src/app`.
   * *Remediation*: Replaced all occurrences across `page.tsx`, `ProductDetailClient.tsx`, and `products/[slug]/page.tsx` with `serializeJsonLd`.

---

## 7. Existing 55-Test Suite (`scripts/verify-production-5-challenges.js`)

* **Passed**: **55**
* **Failed**: **0**
* **Summary**: Verified zero-trust server pricing, Tamil/English medium stock isolation, delayed webhook timeout handling, refund idempotency under 10-client concurrency, and single-unit stock race (Stock = 1).

---

## 8. Existing 40-Test Suite (`scripts/verify-extended-lifecycle.js`)

* **Passed**: **40**
* **Failed**: **0**
* **Summary**: Verified catalog medium cart synchronization, delivered order return and restock math, atomic coupon limits and rollback, dual-path hold expiration, ST Courier AWB validation, and PostgreSQL advisory lock leader election.

---

## 9. New Final Remediation Suite (`scripts/verify-final-remediation.js`)

* **Passed**: **23**
* **Failed**: **0**
* **Summary**: Verified bounded Razorpay timeouts, storage provider abstraction, JSON-LD `</script>` escaping, state machine regression rejection, and strict device binding enforcement.

---

## 10. Payment Concurrency

* **Result**: **VERIFIED**
* **Evidence**:
  * Stock = 1 race: 10 concurrent purchase requests resulted in exactly 1 successful reservation; 9 rejected.
  * Payment duplication: Replayed callbacks with identical `razorpay_payment_id` detect existing record via DB unique checks and return existing order without duplicate insertion or restocking.
  * Refund storm: 10 parallel cancellation requests against a single order executed exactly 1 gateway refund and 1 stock restoration.

---

## 11. Inventory Integrity

* **Result**: **VERIFIED**
* **Evidence**:
  * Mathematical invariant: $\text{Total Stock} = \text{Tamil Stock} + \text{English Stock}$ maintained across all 12 medium transition states.
  * Decrements occur conditionally (`WHERE stock >= qty`); stock never drops below zero.
  * Restorations on cancellation or return restore units strictly to their originating language counter without double-incrementation.

---

## 12. Authentication & Authorization

* **Result**: **VERIFIED**
* **Evidence**:
  * Device binding strictly verified: Tokens issued with `payload.did` are rejected if the client omits `bpg_device` cookie or `x-device-id` header.
  * Tampered token signatures, expired tokens, and mismatched device IDs return `null` (HTTP 401).
  * Administrative endpoints enforce live database checks (`SELECT is_disabled FROM users WHERE id = $1`), revoking deactivated admins immediately.

---

## 13. State Machine

* **Result**: **VERIFIED**
* **Evidence**:
  * Canonical state machine `canTransitionOrderStatus` prohibits `Delivered` orders from regressing to `In Transit`, `Out for Delivery`, `Delivery Attempted`, `Handed to ST Courier`, `Packed`, `Confirmed`, or `Order Placed`.
  * `Delivered` orders permit only `Returned` or `RTO` transitions.
  * Terminal states (`Cancelled`, `Returned`) cannot be transitioned back to active states.

---

## 14. Multi-Replica Storage

* **Result**: **VERIFIED**
* **Evidence**:
  * Storage abstraction allows pluggable switching between `LocalStorageProvider` and `S3CompatibleStorageProvider`.
  * S3 provider natively generates AWS SigV4 signed requests for Cloudflare R2 / AWS S3, ensuring uploaded assets persist independently of container instances.

---

## 15. Failure Recovery

* **Result**: **VERIFIED**
* **Evidence**:
  * Razorpay network latency or timeouts (8s threshold) terminate cleanly without holding database connection pool resources.
  * Background leader election (`pg_try_advisory_lock(884210)`) automatically releases lock upon replica failure, allowing surviving replicas to resume background sweeps.
  * Uncaptured holds (>15 minutes) are swept automatically via background worker and lazy customer checkout sweepers.

---

## 16. Database Invariants

* **Result**: **VERIFIED**
* **Evidence**:
  * Negative stock prevented via check constraints and conditional SQL updates.
  * Foreign key cascades enforce relational integrity across `orders`, `order_items`, and `coupon_usages`.
  * External HTTP requests eliminated from open SQL transaction blocks, preventing connection pool exhaustion.

---

## 17. Remaining Operational Risks

1. **Object Storage Credentials in Production**:
   * For single-VPS deployments, `LocalStorageProvider` writes to disk (`/public/uploads`). When transitioning to multi-container clusters (e.g. 2+ AWS ECS or Render instances), production environment variables (`S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_ENDPOINT`) must be populated in production secrets manager.
2. **Third-Party ST Courier Scraping**:
   * ST Courier tracking relies on scraping public tracking responses. If ST Courier makes breaking changes to their tracking HTML markup, tracking events will log parse warnings until the regex parser is updated.

---

## 18. Deployment Blockers

* **None**. All 5 discovered audit vulnerabilities (BUG-001 through BUG-005) have been remediated, verified against adversarial attack vectors, and validated across 118 automated assertions.

---

# FINAL CLASSIFICATION MATRIX

| Subsystem | Classification | Concrete Evidence |
| :--- | :---: | :--- |
| **Authentication & Authorization** | **VERIFIED** | Strict device binding enforced; missing header bypass closed; HMAC-SHA256 timing-safe comparison verified; live DB role checks active. |
| **Admin Security** | **VERIFIED** | Server-side role validation on every catalog, coupon, order, and refund route; disabled admins blocked immediately. |
| **Input Fuzzing & SQL Security** | **VERIFIED** | Parameterized queries universal; numeric bounds and enum checks enforced; zero unhandled 500 exceptions on malformed inputs. |
| **Transaction Atomicity** | **VERIFIED** | External Razorpay HTTP calls moved outside database transaction; bounded 8000ms AbortSignal timeouts applied; row locks protect against TOCTOU. |
| **Money Invariants** | **VERIFIED** | Server line-item calculation strictly authoritative; coupon discounts rounded; 100 paise Razorpay translation confirmed across 55 tests. |
| **Inventory Invariants** | **VERIFIED** | Medium stock splits (Tamil vs English) isolated; stock $\ge 0$ invariant maintained; double-restoration on cancel/return blocked. |
| **Concurrency & Race Conditions** | **VERIFIED** | Stock = 1 race test passed (1 winner, 9 rejected); duplicate payment callbacks handled idempotently; coupon max_uses limits strictly respected. |
| **Payment Failure Recovery** | **VERIFIED** | Bounded timeouts prevent gateway hangs; automated refund fallback active for orphaned captures; webhook deduplication verified. |
| **Refund Idempotency** | **VERIFIED** | 10 parallel refund requests execute exactly 1 gateway refund; local DB state marked REFUNDED; duplicate retries return cached result. |
| **Order State Machine** | **VERIFIED** | Delivered regressions blocked by canonical `canTransitionOrderStatus` validator; terminal states protected; legitimate returns allowed. |
| **Return & RTO Lifecycle** | **VERIFIED** | Delivered order return workflow Restocks exact medium quantities, records refunds, and decrements coupon usage count. |
| **ST Courier Integration** | **VERIFIED** | Docket number format checking, monotonic event progression, and HTML scraper error resilience verified across test suites. |
| **Multi-Replica Leadership** | **VERIFIED** | PostgreSQL advisory lock 884210 coordinates singleton leader; S3/R2 storage abstraction implemented for multi-replica asset sharing. |
| **Redis Resilience** | **VERIFIED** | Graceful fallback to in-memory caching and direct PostgreSQL queries when Redis connection is unavailable. |
| **Database Failover** | **VERIFIED** | Explicit rollback in catch blocks; transaction isolation prevents orphaned business records during process termination. |
| **File Upload Security** | **VERIFIED** | Magic byte sniffing, SVG exclusion, size caps, and filename sanitization enforced; storage abstracted to S3CompatibleStorageProvider. |
| **XSS / CSRF / Injection** | **VERIFIED** | `serializeJsonLd` converts `<` to Unicode `\u003c`, strictly preventing `</script>` parser breakout across all storefront pages. |
| **Dependencies & Supply Chain** | **VERIFIED** | `npm audit` confirms 0 vulnerabilities across 494 dependencies; TypeScript `tsc --noEmit` compiles with 0 errors. |

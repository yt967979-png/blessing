# Pre-Remediation Verification Report (Phase 1)
**Blessing Power Guide — Production Verification & Adversarial Audit**
**Date**: 2026-09-28
**Scope**: Verification of 5 Confirmed Vulnerabilities Prior to Remediation

---

## 1. BUG-001 — Razorpay Network Calls Inside Open PostgreSQL Transaction Without Timeout

* **Does it still exist?**: **YES (CONFIRMED)**
* **Exact File**: `src/app/api/orders/route.ts` (lines 291–375) and `src/lib/orderPricing.ts` (lines 124–160)
* **Exact Function / Route**: `POST /api/orders` $\to$ `verifyRazorpayPayment()`
* **Exact Vulnerable Path**:
  1. `await client.query('BEGIN')` acquires and opens a PostgreSQL transaction at line 291 of `src/app/api/orders/route.ts`.
  2. While holding the transaction open, line 361 calls `verifyRazorpayPayment(...)`.
  3. Inside `verifyRazorpayPayment()` (`src/lib/orderPricing.ts`), lines 124 and 147 execute external `fetch()` calls to `api.razorpay.com` without an `AbortSignal.timeout(...)`.
  4. The transaction is only committed at line 586 (`await client.query('COMMIT')`).
* **Reproduction**:
  Simulate a 15-second response or stall on `api.razorpay.com`. Dispatch 5 to 10 concurrent checkout requests to `POST /api/orders`. The PostgreSQL client connections remain locked awaiting HTTP responses, causing connection pool exhaustion and blocking all other storefront queries across the application.
* **Severity**: **P1 (High)**
* **Existing Protection**: Transaction rollback is present in a `catch` block, but does not prevent pool starvation while waiting for external I/O.

---

## 2. BUG-002 — Local VPS Disk Storage for Uploaded Media

* **Does it still exist?**: **YES (CONFIRMED)**
* **Exact File**: `src/app/api/upload/route.ts` (lines 94–107)
* **Exact Function / Route**: `POST /api/upload`
* **Exact Vulnerable Path**:
  Line 95 defines `uploadDir = path.join(process.cwd(), 'public', 'uploads', uploadSubDir)`. Line 102 writes directly to the local filesystem using `fs.promises.writeFile(filepath, buffer)`. The response hardcodes `provider: 'vps-disk'`.
* **Reproduction**:
  In a multi-replica container environment (e.g. AWS ECS, Render, Railway multi-replica), upload a catalog image on Replica A. Load balancer routes subsequent customer request for `/uploads/catalog/...` to Replica B, resulting in HTTP 404. Furthermore, container restarts on ephemeral filesystems permanently wipe uploaded images.
* **Severity**: **P2 (Medium)**
* **Existing Protection**: Magic byte sniffing and size limits prevent invalid file formats, but storage lacks distributed multi-replica and persistent object store capabilities.

---

## 3. BUG-003 — Unescaped JSON-LD in Script Tag Allowing Script Breakout

* **Does it still exist?**: **YES (CONFIRMED)**
* **Exact File**: `src/app/products/[slug]/ProductDetailClient.tsx` (lines 591–602), `src/app/products/[slug]/page.tsx` (lines 338–347), and `src/app/page.tsx` (lines 85–92)
* **Exact Function / Route**: Storefront Product Detail & Homepage Schema Rendering
* **Exact Vulnerable Path**:
  JSON-LD schemas are embedded directly via:
  ```tsx
  <script
    type="application/ld+json"
    dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }}
  />
  ```
  `JSON.stringify` does not escape the `<` character. If a book title, description, or author contains `</script>`, the browser HTML parser prematurely closes the `<script>` container and executes any following HTML markup/scripts.
* **Reproduction**:
  Save a book with description: `Comprehensive Guide </script><script>window.__xss_tripped=true</script>`. View the product detail page. The browser parses and executes the injected script tag.
* **Severity**: **P3 (Low / Defense-in-Depth)**
* **Existing Protection**: Admin role required to create books; HTML sanitization on body rendering; however, JSON-LD raw script tag injection was unguarded.

---

## 4. BUG-004 — Delivered Order Regression to 'In Transit' / 'Out for Delivery'

* **Does it still exist?**: **YES (CONFIRMED)**
* **Exact File**: `src/app/api/orders/route.ts` (lines 751–759)
* **Exact Function / Route**: `PATCH /api/orders`
* **Exact Vulnerable Path**:
  ```ts
  if (isParcelDelivered(currentStatus) && newStatus !== currentStatus) {
    const backwardStatuses = new Set(['Packed', 'Confirmed', 'Order Placed', 'Handed to ST Courier']);
    if (backwardStatuses.has(newStatus)) {
      return NextResponse.json(
        { error: `Cannot revert a Delivered order back to "${newStatus}".` },
        { status: 409 }
      );
    }
  }
  ```
  The set `backwardStatuses` only contains 4 statuses, omitting `'In Transit'` and `'Out for Delivery'`. Consequently, an admin or worker call can transition an order from `Delivered` back to `In Transit` or `Out for Delivery`.
* **Reproduction**:
  Take an order with `order_status = 'Delivered'`. Call `PATCH /api/orders` with `{ orderId, status: 'In Transit' }`. The API accepts the transition and updates the database record.
* **Severity**: **P2 (Medium)**
* **Existing Protection**: Partial blacklist checked 4 statuses, but lacked an exhaustive state machine.

---

## 5. BUG-005 — Device-Binding Authentication Bypass when Device Identifier is Omitted

* **Does it still exist?**: **YES (CONFIRMED)**
* **Exact File**: `src/lib/auth.ts` (lines 145–148)
* **Exact Function / Route**: `verifySessionToken(token, deviceId)`
* **Exact Vulnerable Path**:
  ```ts
  const bound = String(payload.did || '');
  if (bound && deviceId && !timingSafeUtf8Equal(bound, deviceId)) return null;
  return { userId: payload.userId, role: payload.role };
  ```
  If `payload.did` is present (the token was bound to device A), but a request omits the `bpg_device` cookie and `x-device-id` header, `deviceId` is `null`/`undefined`. The condition `bound && deviceId` evaluates to `false`, allowing the check to pass.
* **Reproduction**:
  Generate an authenticated session token for a user bound to `device_alpha`. Send an HTTP request with `Authorization: Bearer <token>` but without `bpg_device` cookie or `x-device-id` header. The request is accepted as authenticated.
* **Severity**: **P2 (Medium)**
* **Existing Protection**: Cryptographic HMAC-SHA256 signature verification and expiration checks are active, but the device-binding restriction was bypassed when headers were omitted.

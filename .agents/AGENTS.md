# Workspace Rules & Security Directives: Blessing Power Guide

## Mission & Absolute Directives

You are operating as an **Elite Staff Software Engineer & Solution Architect**. 
Your mission is to ensure the **Blessing Power Guide** E-Commerce platform is **bulletproof, unbreakable, zero-vulnerability, ultra-performant (<15ms), and built to last forever**.

---

## 🛡️ 1. Zero-Compromise Security Directives (Unbreakable Shield)

1. **Strict Input Sanitization & Parameterization**:
   - Every database query MUST use parameterized placeholders (`$1`, `$2`). Never concatenate raw strings into SQL queries. Zero SQL Injection tolerance.
   - All user input (names, addresses, comments, review text) MUST be escaped and sanitized before rendering to prevent XSS (Cross-Site Scripting).

2. **Cryptographic Integrity & Signature Verification**:
   - Razorpay payment webhooks and checkout verifications MUST ALWAYS validate the HMAC SHA-256 signature using `process.env.RAZORPAY_KEY_SECRET`.
   - Admin authentication tokens MUST be verified via timing-safe secure cryptographic comparison. Never expose admin routes without `verifyAdminRequest()`.

3. **Rate Limiting & Anti-DDoS**:
   - API endpoints (`/api/auth`, `/api/orders`, `/api/coupons`, `/api/whatsapp`) MUST be protected with sliding-window rate limiters to prevent brute-force attacks and abuse.

4. **Zero Secret Leakage**:
   - Secret environment keys (`GMAIL_APP_PASSWORD`, `RAZORPAY_KEY_SECRET`, `ULTRAMSG_TOKEN`, `DATABASE_URL`) MUST NEVER be hardcoded in client-side bundles (`src/app/`, public components) or committed to source control.

---

## ⚡ 2. Performance & Architecture Directives (Instant Sub-15ms Load)

1. **Parallel Database Execution**:
   - Whenever an API endpoint fetches multiple queries, execute them concurrently using `Promise.all([queryDb(...), queryDb(...)])`. Never execute sequential query waterfalls.

2. **RAM Caching Strategy**:
   - Product catalogs, categories, and static configurations MUST be cached in server RAM (`queryCache`). Invalidate cache instantly upon Admin updates.

3. **Database Connection Pool Safety**:
   - Always use `queryDb()` on the warm pool to eliminate client checkout contention and timeout blips.

---

## 🔄 3. Self-Updating & Continuous Learning Directive

1. **Automatic Knowledge Updating**:
   - Whenever a technical issue, performance bottleneck, or edge-case bug is discovered and fixed, update the workspace rules (`.agents/AGENTS.md`) and skills (`.agents/skills/`) so that the same problem NEVER happens again.

2. **No Superficial Symptom Patches**:
   - Never resolve errors by masking symptoms, swallowing exceptions, or returning dummy fallbacks. Always fix the true root cause upstream.

---

## 📦 4. Verification & Deployment Guarantee

1. **Mandatory Type-Check Verification**:
   - Before completing any task or pushing to Git, run `npx tsc --noEmit` to guarantee zero compilation errors.

2. **Empirical Log Verification**:
   - Always check live container logs (`npx railway logs`) to confirm clean runtime boot and zero active exception tracebacks.

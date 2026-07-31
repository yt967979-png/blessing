# 🏆 Enterprise 10/10 Engineering & Security Directives: Blessing Power Guide

## 🎯 Core Operating Philosophy

You operate strictly as a **Staff Software Engineer, Security Architect, and Principal Performance Engineer**.

Every solution produced MUST achieve **10/10 Excellence**. Never accept quick hacks, superficial patches, or lazy code.

```
Request ➔ Understand Deeply ➔ Deep Research ➔ 10/10 Architecture & Plan ➔ Bulletproof Implementation ➔ Verification (TypeScript + Logs) ➔ Auto-Update Rules
```

---

## 🛡️ 1. Unbreakable Security Directives (Zero-Vulnerability Policy)

1. **Zero SQL Injection (Parameterized Everything)**:
   - ALL database queries MUST use `$1`, `$2` parameterized bindings via `queryDb()`.
   - Dynamic query strings or concatenated variables inside SQL queries are **STRICTLY PROHIBITED**.

2. **XSS & Output Sanitization**:
   - All user-supplied strings (customer names, review text, delivery comments, address fields) MUST be sanitized before rendering.
   - Headers MUST maintain strict Content-Security-Policy & Frame-Options (`DENY`).

3. **Cryptographic Payment & Admin Verification**:
   - Razorpay HMAC SHA-256 signatures MUST be verified using timing-safe comparisons (`crypto.timingSafeEqual`).
   - Admin routes MUST enforce `verifyAdminRequest()` before executing database transactions.

4. **Rate Limiting & Anti-Brute-Force**:
   - Authentication, coupon redemption, and order creation routes MUST maintain rate-limit protection.

---

## ⚡ 2. Sub-15ms Ultra-Performance Architecture

1. **Parallel Execution Mandatory**:
   - Never write sequential `await` DB waterfalls (`await q1; await q2;`). Combine independent queries into `Promise.all([queryDb(...), queryDb(...)])`.

2. **Warm Connection Pool Directives**:
   - All read routes MUST execute directly against the shared warm pool via `queryDb()`. Never hold individual connection clients (`getDbClient`) unless inside an explicit SQL transaction (`BEGIN` / `COMMIT`).

3. **In-Memory RAM Catalog Caching**:
   - Serve product catalog views and categories directly from RAM cache (`queryCache`), invalidating cache on Admin updates to achieve sub-5ms response times.

---

## 🔬 3. 10/10 Planning & Systematic Workflow

1. **Deep System Analysis First**:
   - Inspect existing schemas (`src/lib/db.ts`), authentication mechanisms, and API contracts before modifying code.
   - Re-use existing patterns; never create duplicate logic.

2. **No Superficial Symptom Patches**:
   - Never hide an error with empty `try/catch` blocks, dummy fallback objects, or swallowed exceptions. Locate the exact upstream root cause and resolve it cleanly.

---

## 🔄 4. Self-Updating & Continuous Learning Mandate

1. **Automatic Rules Update**:
   - After resolving any technical issue, bug, or performance bottleneck, **ALWAYS update `.agents/AGENTS.md` and related skills** to encode the solution permanently.

2. **Mandatory Runtime & Type Verification**:
   - Run `npx tsc --noEmit` to verify type safety.
   - Inspect runtime logs (`npx railway logs`) to guarantee clean execution without tracebacks.

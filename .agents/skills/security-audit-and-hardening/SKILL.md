---
name: security-audit-and-hardening
description: Run an automated enterprise security scan, SQL injection audit, XSS audit, and cryptographic verification on Blessing Power Guide codebase.
---

# Security Audit & Hardening Skill

## Instructions

When triggered or during any major architecture changes:

1. **SQL Injection Audit**:
   - Inspect all SQL queries across `src/lib/` and `src/app/api/`.
   - Ensure every query uses `$1`, `$2` parameterized inputs.
   - Verify no dynamic string concatenation (`SELECT * FROM table WHERE id = ' + userInput`) exists anywhere.

2. **XSS & Content Security Audit**:
   - Ensure HTML outputs and user-submitted review comments are sanitized.
   - Verify security headers in `next.config.ts` (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`).

3. **Payment Cryptographic Audit**:
   - Check `POST /api/orders` and `POST /api/webhooks/razorpay`.
   - Verify HMAC SHA-256 signatures are calculated and compared using constant-time timing safe comparison.

4. **Authentication & Session Hardening**:
   - Verify HTTP-only, `SameSite=Lax`, `Secure` flags on session cookies (`bpg_session`).
   - Check token signatures and timing-safe admin key validation in `src/lib/serverSecurity.ts`.

5. **Execute TypeScript Verification**:
   - Run `npx tsc --noEmit` to verify type safety across the entire application.

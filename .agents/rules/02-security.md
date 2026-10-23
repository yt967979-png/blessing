# Security Rules

## NEVER Trust the Frontend
- All pricing, discounts, stock availability, and payment status MUST be verified server-side.
- Frontend-submitted values like `price`, `total`, `stock`, `user_role` are UNTRUSTED.
- The server must independently calculate totals, verify payment signatures, and check authorization.

## SQL Injection Prevention
- Every SQL query MUST use parameterized inputs (`$1`, `$2`, etc.).
- NEVER use string concatenation or template literals to build SQL queries with user input.
- Before modifying any database query, verify parameterization is intact.

## XSS Prevention
- Sanitize all user-submitted content before rendering (reviews, comments, support messages).
- Ensure security headers are configured in `next.config.ts`.

## Authentication & Authorization
- Verify session tokens server-side on every protected route.
- Admin routes must independently verify admin status from the database, not from cookies alone.
- Use timing-safe comparison for secrets (`crypto.timingSafeEqual`).

## Payment Security
- Razorpay webhook signatures MUST be verified using HMAC SHA-256 with timing-safe comparison.
- Never confirm an order based solely on frontend payment callbacks.
- Always verify payment amount matches the expected order total server-side.

## Secrets Management
- Never commit `.env` files, API keys, or credentials to version control.
- Never log secrets or tokens, even in development.
- Environment variables must be accessed through validated configuration.

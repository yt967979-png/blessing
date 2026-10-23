# PROJECT ENGINEERING CONSTITUTION

You are responsible for producing production-quality software for **Blessing Power Guide** — a live e-commerce platform handling real payments, real customers, and real inventory.

Do not optimize for speed of response. Optimize for **correctness, maintainability, security, usability, performance, and verified results**.

---

## VERIFIED TECH STACK (DO NOT GUESS)

- **Framework**: Next.js 16 (App Router) + React 19
- **Language**: TypeScript 5 (Strict mode)
- **Styling**: Tailwind CSS v4 + Lucide React icons
- **Database**: PostgreSQL (`pg` connection pool)
- **Cache**: Redis (`ioredis`)
- **Payments**: Razorpay (HMAC SHA-256 webhook verification)
- **Validation**: Zod v4
- **Animation**: Framer Motion (only where already used)
- **Verification**: `npm run typecheck` · `npm run lint` · `npm run test:routes` · `npm run test:logic`

---

## CORE PRINCIPLES

1. Inspect before modifying. Read the file first.
2. Understand the existing architecture before proposing changes.
3. Never blindly rewrite working systems.
4. Never claim success without verification.
5. Prefer evidence over assumptions.
6. Preserve existing functionality unless intentionally changing it.
7. Minimize unnecessary dependencies.
8. Follow the project's existing conventions when they are sound.
9. Fix root causes rather than symptoms.
10. After changes, test the affected functionality.
11. Before completion, perform a regression review.
12. Treat security as a requirement, not an optional improvement.

---

## REQUIRED BEHAVIOR

### Before Significant Implementation

- Inspect the relevant files and modules
- Identify the technology stack and patterns already in use
- Understand the data flow and architecture
- Identify risks and side effects
- Create an implementation plan for complex changes

### During Implementation

- Make small, coherent, surgical changes
- Validate after each significant change
- Avoid unrelated modifications
- Preserve backward compatibility
- Never delete comments, helpers, or imports unrelated to your change

### Before Saying "Complete"

- Run `npm run typecheck` — 0 errors required
- Run `npm run lint` if style changes were made
- Run relevant test scripts if behavior changed
- Verify the build succeeds for production-critical changes
- Check error handling and edge cases
- Review security implications (especially for API/payment/auth changes)

**NEVER say something works merely because code was written. Evidence is required.**

---

## OPERATIONAL LAWS

### LAW 1: Surgical Edits Only
Never rewrite entire files when only modifying a function or a few lines. Make minimal, targeted, atomic diffs. Preserve all existing imports, comments, helpers, and surrounding logic.

### LAW 2: Never Touch Unrequested Files
Modify ONLY the files directly relevant to the user's task. Do NOT refactor adjacent modules or change global configurations without explicit permission.

### LAW 3: No Over-Engineering
Solve the problem in the simplest, most robust way possible. Do NOT inject unnecessary animations, heavyweight libraries, or complex design patterns when a straightforward fix is requested.

### LAW 4: No Hallucinated Conventions
This is Next.js 16 App Router — NOT Pages Router, NOT Vite, NOT Create React App. Use `app/` directory conventions. API routes use `route.ts` with `NextRequest`/`NextResponse`. Server Components are the default. Use `'use client'` only when interactive state is needed.

### LAW 5: Payment & Money Code is Sacred
Any change touching payment flows, order finalization, pricing calculations, stock holds, refunds, or webhook verification requires EXTRA caution. Never modify financial logic without understanding the full flow end-to-end.

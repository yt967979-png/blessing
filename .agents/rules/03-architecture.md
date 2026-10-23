# Architecture Rules

## Next.js 16 App Router Conventions
- `app/` directory uses App Router. Server Components are the default.
- Use `'use client'` ONLY for components requiring hooks (`useState`, `useEffect`, event handlers).
- API routes live in `app/api/**/route.ts` using `NextRequest` and `NextResponse`.
- Shared logic lives in `src/lib/`. Reuse existing modules before creating new ones.
- Components live in `src/components/` organized by domain.

## Separation of Concerns
- Business logic belongs in `src/lib/`, NOT inside API route handlers or React components.
- API routes should validate input, call library functions, and return responses. Keep them thin.
- Database queries are centralized in `src/lib/db.ts`. Do NOT create new database modules.
- Redis operations go through `src/lib/redis.ts`.

## Do NOT Restructure Without Permission
- Never rename files, move directories, or reorganize the project structure without explicit request.
- Never replace working architecture with a "better" pattern unless asked.
- If you see technical debt, mention it — do NOT silently refactor it.

## Dependency Discipline
- Do NOT add new npm dependencies without explicit approval.
- Prefer built-in Node.js APIs and existing project utilities over new packages.
- If a dependency is truly needed, justify why existing tools are insufficient.

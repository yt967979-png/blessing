# Quality Standards

## Code Quality
- All code must be TypeScript with proper types. No `any` unless absolutely unavoidable (document why).
- Functions should do one thing. Keep them under 50 lines when practical.
- Name variables and functions descriptively. `data`, `result`, `temp` are not acceptable names.
- Handle errors explicitly. Never swallow errors silently.
- Use early returns to reduce nesting.

## Production Readiness
- Every API endpoint must validate input (use Zod schemas).
- Every API endpoint must handle errors with proper HTTP status codes.
- Every database query must use parameterized inputs (`$1`, `$2`).
- Every user-facing action must have loading, error, and success states.
- Never hardcode secrets, API keys, or credentials.

## Code Review Standard
Before finalizing any change, self-review:
- Would this pass a senior engineer's code review?
- Are there edge cases I haven't handled?
- Could this break existing functionality?
- Is the error handling complete?
- Are the types accurate and not overly broad?

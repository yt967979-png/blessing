# Core Engineering Discipline

## Surgical Precision
- Always `view_file` before editing. Never edit blind.
- Make the smallest diff that solves the problem.
- One logical change per edit. Do not bundle unrelated fixes.
- Preserve all existing imports, comments, and helper functions unless explicitly told to remove them.

## Evidence-Based Completion
- Never declare a task "done" without running verification.
- Minimum verification: `npm run typecheck` passes with 0 errors.
- For API changes: test the endpoint with actual requests.
- For UI changes: visually verify in the browser when possible.
- For database changes: verify schema and query correctness.

## Anti-Hallucination
- Do NOT invent APIs, hooks, or utilities that don't exist in this codebase.
- Do NOT assume a file's contents — read it first.
- Do NOT guess import paths — verify them.
- Do NOT assume environment variables exist — check `.env` or configuration files.
- If uncertain about a pattern, search the codebase for existing examples before inventing a new one.

## Error Recovery
- If a change breaks the build, FIX IT before moving on.
- Never leave the project in a broken state.
- If you cannot fix an issue, clearly state what failed and why, rather than silently skipping it.

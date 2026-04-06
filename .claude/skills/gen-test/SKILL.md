---
name: gen-test
description: Generate tests for a file following BugDrop's Vitest (unit) and Playwright (E2E) conventions
disable-model-invocation: true
---

Generate tests for: $ARGUMENTS

## Project Test Conventions

- **Unit tests** (`test/`): Vitest with `describe`/`it`/`expect`. Mock external deps with `vi.fn()`.
- **E2E tests** (`e2e/`): Playwright against wrangler dev at localhost:8787. Widget lives in shadow DOM under `#bugdrop-host`.
- **Widget E2E**: Use `page.route()` to intercept CDN requests (html-to-image) and API calls. Access shadow DOM via `page.locator('#bugdrop-host').locator('css=...')`.

## Steps

1. Read the source file to understand its exports and behavior
2. Determine test type:
   - `src/middleware/`, `src/routes/`, `src/lib/` → unit test in `test/`
   - `src/widget/` → E2E test in `e2e/` (requires `npm run build:widget` first)
3. Reference existing patterns:
   - Unit: [examples/unit-test.ts](examples/unit-test.ts) — Hono app setup, KV mocking, request/response assertions
   - E2E: [examples/e2e-test.ts](examples/e2e-test.ts) — shadow DOM access, CDN interception, widget navigation helpers
4. Generate tests covering: happy path, error/edge cases, boundary conditions
5. Place test file in the appropriate directory with matching name (`foo.ts` → `foo.test.ts` or `foo.spec.ts`)

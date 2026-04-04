# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

BugDrop is a feedback widget that creates GitHub Issues from in-app user submissions (with screenshots, annotations, metadata). It runs as a Cloudflare Worker (Hono framework) with a client-side widget bundle.

## Commands

```bash
make dev              # Start wrangler dev server on :8787
make build-all        # Build widget bundle + TypeScript
make test             # Run unit tests (vitest)
make test-e2e         # Run E2E tests (playwright, chromium)
make test-e2e-ui      # E2E tests with interactive UI
make check            # Lint + typecheck + knip + audit (all quality checks)
make lint-fix         # ESLint auto-fix
make typecheck        # TypeScript strict check on both tsconfigs
```

Run a single unit test: `npx vitest run test/api.test.ts`
Run a single E2E test: `npx playwright test e2e/widget.spec.ts`

## Architecture

Two separate build targets sharing one repo:

**Backend (Cloudflare Worker)** — `tsconfig.json`

- `src/index.ts` — Hono app entry point, mounts API routes and serves static assets
- `src/routes/api.ts` — `/api/health`, `/api/check/:owner/:repo`, `/api/feedback` (POST)
- `src/middleware/rateLimit.ts` — Per-IP (10/15min) and per-repo (50/hr) rate limiting via KV
- `src/lib/github.ts` — GitHub App JWT auth, installation tokens, issue/asset creation
- `src/lib/jwt.ts` — JWT generation for GitHub App authentication

**Widget (browser bundle)** — `tsconfig.widget.json` (adds DOM types)

- `src/widget/index.ts` — Config parsing from `data-*` attributes, Shadow DOM init, `window.BugDrop` API
- `src/widget/ui.ts` — Shadow DOM markup/styling, modal/button rendering, theme support
- `src/widget/screenshot.ts` — Screenshot capture via html2canvas
- `src/widget/annotator.ts` — Canvas-based drawing annotations on screenshots
- `src/widget/picker.ts` — Element picker for selecting UI elements

The widget is bundled by `scripts/build-widget.js` (esbuild → IIFE) into `public/widget.js` with versioned copies (`widget.v1.js`, `widget.v1.14.js`, `widget.v1.14.0.js`).

## Key Patterns

- **ESM only** — `"type": "module"` in package.json
- **Conventional commits** — `fix:` (patch), `feat:` (minor), `feat!:` (major) for semantic-release
- **Shadow DOM isolation** — Widget UI is fully encapsulated; E2E tests use `internal:shadow=` selectors
- **Env config** — Server secrets via `wrangler.toml` + `.dev.vars`; widget config via `data-*` attributes on the script tag
- **Rate limit fallback** — Skips rate limiting when KV not configured (dev mode)

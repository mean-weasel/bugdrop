---
name: setup-dev
description: Set up BugDrop development environment and verify everything works
disable-model-invocation: true
---

Set up the BugDrop development environment:

## Prerequisites

1. Node.js 20+ installed
2. GitHub CLI (`gh`) authenticated
3. Wrangler CLI (`npx wrangler whoami` should show an account)

## Setup Steps

1. Install dependencies: `npm install`
2. Build the widget: `npm run build:widget`
3. Run type checking: `npm run typecheck`
4. Run unit tests: `npm test`
5. Start dev server: `npx wrangler dev --port 8787` (in background)
6. Run E2E tests: `npm run test:e2e`
7. Run full validation: `npm run validate`

## Key Things to Know

- Widget source is in `src/widget/` — after changes, run `npm run build:widget` before E2E tests
- Built widget files (`public/widget.js`, `public/widget.v*.js`) are gitignored
- E2E tests expect wrangler dev running at localhost:8787
- Commits must follow conventional format (`fix:`, `feat:`, `test:`, `chore:`) — enforced by commitlint
- `fix:` triggers a patch release, `feat:` triggers a minor release

Report any issues encountered during setup.

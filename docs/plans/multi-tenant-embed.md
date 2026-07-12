# Multi-Tenant Embed Contract (single-script loader, per-tenant config)

Status: DRAFT under execution on branch `feat/multitenant-embed`.
Amendments discovered during implementation are recorded inline under "Amendments".

## Nature of this document

This is an execution contract, not a discussion document. Executor agents implement
what is written here; they do not reopen decisions. If reality contradicts this
document (an API does not exist, a test cannot pass as specified), the executor
STOPS and reports; the contract is amended BEFORE code diverges from it.

Required reading before taking any card: this file, `CLAUDE.md`, `src/routes/api.ts`,
`src/widget/index.ts`, `src/widget/theme.ts`, `src/lib/authToken.ts`,
`src/middleware/rateLimit.ts`, `wrangler.toml`.

## Goal

Today a site embeds BugDrop with a script tag plus up to ~30 `data-*` attributes,
and the Worker has one global CORS list, one global auth secret, and hardcoded rate
limits. The goal is a HubSpot-style embed: the customer pastes ONE script tag with a
tenant key in the path and nothing else; all configuration (target repo, allowed
origins, colors/theme, behavior, rate limits) lives server-side, per tenant, managed
by the operator:

```html
<script src="https://<worker-host>/t/{tenantKey}.js" async></script>
```

## Vocabulary (use these terms literally)

- **tenant**: one customer of a hosted BugDrop instance. Owns a target repo, an
  origin allowlist, a theme, behavior flags, rate-limit tier.
- **tenant key**: public slug identifying a tenant, appears in the loader URL path.
  Not a secret (it is visible in page source), but unguessable enough to avoid
  casual enumeration is not required; security comes from origin checks, not the key.
- **loader**: the tiny server-rendered JS served at `/t/{key}.js`. Injects the
  widget core with the tenant's config as `data-*` attributes.
- **widget core**: the existing bundle `public/widget.v1.js` (unchanged bootstrap:
  reads `document.currentScript.dataset`).
- **legacy embed**: the current documented install (`/widget.js` + hand-written
  `data-*`). MUST keep working unchanged.
- **operator**: whoever hosts a BugDrop Worker deployment and administers tenants
  (via admin API). Tenant data lives in the operator's KV, never in this repo.

## Facts (measured; do not re-derive)

- Widget config is read exclusively from `script.dataset` in
  `src/widget/index.ts` (~lines 369-476); `apiUrl` is derived from `script.src`
  by replacing `/widget(.vX[.Y[.Z]])?.js` with `/api`.
- All theming is applied client-side as CSS custom properties in
  `src/widget/theme.ts` (`--bd-*`), driven by `data-color`, `data-bg`, `data-text`,
  `data-font`, `data-radius`, `data-border-width`, `data-border-color`,
  `data-shadow`, `data-theme`.
- CORS: single global `ALLOWED_ORIGINS` var (comma list or `*`), exact string
  match, in `src/routes/api.ts`.
- Rate limits hardcoded in `src/routes/api.ts`: 20 req/15 min per IP,
  50 req/h per repo, via KV binding `RATE_LIMIT` (`src/middleware/rateLimit.ts`).
- Widget auth token `bd1.<payload>.<sig>` (HMAC) verified against global
  `AUTH_TOKEN_SECRET` (+`AUTH_TOKEN_ADDITIONAL_SECRETS`) in `src/lib/authToken.ts`.
- GitHub App is global to the Worker (one App ID + private key); a tenant's repo
  must have the App installed, same as today.
- ESLint warns at >300 lines/file, >150 lines/function. Conventional commits
  enforced by commitlint. Unit = Vitest in `test/`, E2E = Playwright in `e2e/`
  against `wrangler dev` on :8787 (widget must be rebuilt first).

## Frozen design decisions

- **D1 Loader shape**: `/t/{key}.js` is rendered by the Worker (Hono route), NOT a
  static asset. It contains: double-injection guard, the tenant's config baked in
  as a data-attribute map, creation of a classic `<script>` pointing at
  `/widget.v1.js` (major-pinned) on the same origin, plus `data-tenant={key}`.
  Rationale: reuses the entire tested dataset config surface and theming pipeline;
  zero rewrite of the widget bootstrap; HubSpot path-param pattern. Rejected
  alternative: settings-JSON fetch + `window` config object (would fork the
  bootstrap and double the test surface for no user-visible gain).
- **D2 Tenant registry**: KV namespace binding `TENANTS` (resource name
  `bugdrop-tenants`), key `tenant:{key}`, value = `TenantConfig` JSON (schema
  below). Point reads at the edge with `cacheTtl: 60`. Rejected alternative: D1 —
  no relational queries needed; a config blob per key is exactly KV's shape.
- **D3 Additive only**: legacy embed, legacy routes, global CORS/rate/auth behavior
  stay byte-for-byte compatible. All tenant enforcement lives under the new
  namespaced router `/api/t/{key}/*`. All 340 existing unit tests and all existing
  E2E specs must keep passing without modification (fixing a test is allowed only
  if the test itself asserted nothing about legacy behavior; otherwise STOP).
- **D4 Server-side authority**: for tenant traffic, `tenant.repo` and
  `tenant.origins` are authoritative. The client-supplied repo must equal
  `tenant.repo` (else 400). Requests with an Origin header not in
  `tenant.origins` are rejected 403 (requests without Origin — curl,
  server-to-server — are allowed, matching legacy semantics). A paused tenant
  returns 403 for feedback/check and a no-op loader.
- **D5 Per-tenant widget-auth secret (optional field, M2)**: stored encrypted
  (AES-256-GCM envelope; KEK from Workers Secret `BUGDROP_KEK`; plaintext only in
  memory during verification; never logged). Absent field = tenant does not use
  widget auth tokens. Fail-loud: envelope present but KEK missing = 500, not skip.
- **D6 Admin surface**: REST CRUD under `/api/admin/tenants`, protected by Bearer
  token compared timing-safe against Workers Secret `ADMIN_TOKEN`; no CORS
  allowance (same-origin/curl only), no dashboard UI in this round. Full CRUD from
  day one: list, get, create, update, delete.
- **D7 Validation**: manual typed validators following existing repo conventions
  (`sanitizeCssColor`, `parseCategoryLabels`); no new runtime dependencies.
  Zod was considered and rejected: the repo validates by hand consistently.
- **D8 Naming**: new cloud resources are prefixed `bugdrop-` (`bugdrop-tenants`);
  new secrets are `BUGDROP_KEK`, `ADMIN_TOKEN`. Dev values go in `.dev.vars`
  (gitignored), never in code or in `wrangler.toml` `[vars]`.
- **D9 Loader caching**: `Content-Type: application/javascript; charset=utf-8`,
  `Cache-Control: public, max-age=300`. Config changes propagate within
  5 min + KV cacheTtl; acceptable for theming/config. No ETag machinery in v1.
- **D11 No Subresource Integrity on the loader (deliberate)**: SRI requires a
  fixed hash; the loader body changes whenever the operator edits the tenant's
  config, and the widget core it injects rolls forward on minor releases. This is
  the same trade-off every vendor loader makes (HubSpot, Intercom, Sentry): the
  trust anchor is the serving origin (operator's Worker over HTTPS), not a hash.
  Customers who want SRI can instead pin an exact version
  (`/widget.v1.X.Y.js` + hand-written data-attrs, legacy embed) at the cost of
  losing central config. Document this in M2-02.
- **D10 Unknown tenant**: `/t/{key}.js` for a missing key returns HTTP 200 with a
  JS body that only `console.warn('[BugDrop] unknown tenant key: …')`. 200, not
  404, so the page never sees a script error; the warn is the debugging surface.

## TenantConfig v1 (FROZEN by card M0-01; changes require contract amendment)

```ts
interface TenantConfig {
  version: 1;
  key: string; // ^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$
  name: string; // display name, 1..100 chars
  repo: string; // "owner/repo", same validation as data-repo today
  origins: string[]; // exact-match web origins, e.g. "https://app.example.com";
  // https required except http://localhost[:port]; no paths, no wildcards in v1
  status: 'active' | 'paused';
  theme?: {
    color?: string; // -> data-color (sanitizeCssColor rules)
    bg?: string; // -> data-bg
    text?: string; // -> data-text
    font?: string; // -> data-font
    radius?: string; // -> data-radius
    borderWidth?: string; // -> data-border-width
    borderColor?: string; // -> data-border-color
    shadow?: 'none' | 'soft' | 'hard'; // -> data-shadow
    icon?: string; // -> data-icon (URL or "none")
    label?: string; // -> data-label
    position?: 'bottom-right' | 'bottom-left'; // -> data-position
    mode?: 'light' | 'dark' | 'auto'; // -> data-theme
  };
  behavior?: {
    locale?: string; // -> data-locale
    showName?: boolean; // -> data-show-name
    requireName?: boolean; // -> data-require-name
    showEmail?: boolean; // -> data-show-email
    requireEmail?: boolean; // -> data-require-email
    screenshot?: 'optional' | 'auto' | 'required'; // -> data-screenshot
    welcome?: 'once' | 'always' | 'never'; // -> data-welcome
    showIssueLink?: 'public' | 'always' | 'never'; // -> data-show-issue-link
    sendConsoleLogs?: boolean; // -> data-send-console-logs
    buttonDismissible?: boolean; // -> data-button-dismissible
    dismissDuration?: number; // -> data-dismiss-duration (days)
    showRestore?: boolean; // -> data-show-restore
    categoryLabels?: Record<string, string | string[]>; // -> data-category-labels (JSON)
  };
  rate?: {
    perIp?: number; // default 20 (per 15 min window, window fixed in v1)
    perRepo?: number; // default 50 (per 60 min window, window fixed in v1)
  };
  authTokenSecretEnc?: string; // M2. AES-256-GCM envelope, base64url; see D5
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}
```

Booleans/numbers are serialized into data-attributes as strings exactly the way the
widget already parses them (`'true'`/`'false'`, decimal numbers). Unknown fields in
stored JSON are rejected by the validator (fail-loud on typos).

## Request flow (tenant traffic)

1. Page loads `/t/acme.js` → loader injects
   `<script src="/widget.v1.js" data-tenant="acme" data-repo="…" data-color="…" …>`.
2. Widget boots exactly as today (dataset + currentScript). When `data-tenant` is
   present, the derived `apiUrl` becomes `<origin>/api/t/{key}` instead of
   `<origin>/api`.
3. `GET /api/t/{key}/check/:owner/:repo` and `POST /api/t/{key}/feedback` run the
   existing handlers wrapped with per-tenant enforcement: CORS against
   `tenant.origins` (including preflight), repo pinning to `tenant.repo`,
   rate limits from `tenant.rate` (KV key prefix `t:{key}:` so tenants never share
   buckets), paused → 403.

## Milestones and cards

Execution: cards run strictly in the listed order, one agent per card, one
conventional commit per card (message = card title). Calibration column = model
tier for the executor agent.

### M0 — Tenant foundation

| #     | Card (commit title)                                             | Scope                                                                                                                                                                                                                                            | Exports (frozen interface)                                                                                        | Depends | Calibration |
| ----- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ------- | ----------- |
| M0-01 | `feat: add TenantConfig v1 types and validator` **(BLOCKER)**   | `src/lib/tenants.ts`: `TenantConfig` + sub-interfaces exactly as in this contract; `validateTenantConfig(input: unknown): { ok: true; value: TenantConfig } \| { ok: false; errors: string[] }`; `tenantToDataAttributes(t): Record<string,string>` (the loader's attr map, including `repo`). Unit tests in `test/tenants.test.ts` covering every field family, rejection of unknown fields, key/origin/repo formats. | `TenantConfig`, `validateTenantConfig`, `tenantToDataAttributes`                                                    | —       | Sonnet med  |
| M0-02 | `feat: add KV tenant store`                                      | `src/lib/tenantStore.ts`: `getTenant(env, key)` (KV `TENANTS`, `cacheTtl: 60`, validates stored JSON, returns null on missing/invalid + `console.error` on invalid), `putTenant`, `deleteTenant`, `listTenants` (KV list by prefix `tenant:`, returns keys + names only). Add `TENANTS` binding to `src/types.ts` Env and `wrangler.toml` (all envs; use placeholder id + `# create: wrangler kv namespace create bugdrop-tenants` comment). Unit tests with a KV mock following existing test patterns. | `getTenant`, `putTenant`, `deleteTenant`, `listTenants`                                                             | M0-01   | Sonnet med  |
| M0-03 | `feat: add tenant admin CRUD routes`                             | `src/routes/admin.ts` mounted at `/api/admin`: `GET /tenants`, `POST /tenants`, `GET /tenants/:key`, `PUT /tenants/:key`, `DELETE /tenants/:key`. Bearer auth: timing-safe comparison against `env.ADMIN_TOKEN` (reuse/extract the existing timing-safe compare if present in the codebase; else implement with `crypto.subtle` digest comparison). Missing `ADMIN_TOKEN` secret → all admin routes 503 (fail-loud, never open). POST/PUT validate via `validateTenantConfig`; server sets `createdAt`/`updatedAt`/`version`. Unit tests: authz (no token / wrong token / ok), full CRUD round-trip, validation errors 400. | Admin REST surface as described                                                                                    | M0-02   | Sonnet med  |

**M0 acceptance gate**: `npm run validate` green (lint, format, typecheck, all unit
tests incl. new ones). No file over ESLint limits.

### M1 — Loader + per-tenant enforcement

| #     | Card (commit title)                                        | Scope                                                                                                                                                                                                                                                                                                                                                                                     | Exports                                                     | Depends | Calibration |
| ----- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------- | ----------- |
| M1-01 | `feat: serve tenant loader at /t/:key.js`                  | `src/routes/loader.ts` (mounted in `src/index.ts`): render the loader IIFE per D1/D9/D10. Attribute values embedded via `JSON.stringify` (XSS-safe by construction; no string concatenation of raw values into JS). Paused tenant → warn-only loader like D10. Unit tests: header values, guard present, attrs match `tenantToDataAttributes`, unknown/paused tenant bodies, script src is `/widget.v1.js` with `data-tenant`.                                                                             | Loader route                                                | M0      | Sonnet med  |
| M1-02 | `feat: widget derives tenant-scoped apiUrl from data-tenant` | In `src/widget/index.ts` only: read `data-tenant`; when present and matching `^[a-z0-9-]{3,32}$`, apiUrl = existing derivation + `/t/{key}` (i.e. `<origin>/api/t/{key}`); include the raw key nowhere else. Minimal diff. Unit test in existing widget test file covering with/without/invalid `data-tenant`. Run `npm run build:widget` and confirm it builds.                                                                                                                                                | `data-tenant` contract                                      | M0-01   | Sonnet med  |
| M1-03 | `feat: enforce per-tenant CORS, repo pinning and rate limits` | `src/routes/tenantApi.ts` mounted at `/api/t/:key` in `src/routes/api.ts` or `src/index.ts` (whichever keeps files under the 300-line limit): resolve tenant once per request (404 JSON if unknown, 403 if paused); CORS allowing exactly `tenant.origins` (handle preflight; if Hono's `cors()` origin callback cannot access route params in the installed version, implement a small explicit middleware — check `node_modules/hono` first, do not guess); requests with an Origin not in the allowlist → 403 (no-Origin requests allowed); then delegate to the SAME feedback/check handler logic used by the legacy routes (extract shared handlers if needed, without changing legacy route behavior), with: repo forced/validated to equal `tenant.repo` (mismatch → 400), rate limits from `tenant.rate` with KV key prefix `t:{key}:`. Unit tests: unknown/paused tenant, origin allowed/denied/absent, preflight, repo pinning, custom rate override applied. | `/api/t/{key}/check/...`, `/api/t/{key}/feedback`           | M0, M1-02 | Sonnet high |
| M1-04 | `test: add multi-tenant embed E2E coverage`                | New `e2e/multi-tenant.spec.ts` following existing E2E conventions (fixtures, wrangler dev, built widget): seed a test tenant via the admin API (`ADMIN_TOKEN` from `.dev.vars`; add `.dev.vars.example` entry), load a page embedding `/t/<testkey>.js`, assert: widget button renders with the tenant's `theme.color`, feedback modal opens, submission path hits `/api/t/<testkey>/feedback` (route assertion via request interception or the dev-mode mock the existing E2E uses — follow the existing pattern for how feedback submission is asserted without hitting GitHub), a disallowed origin is rejected (API-level assertion with fetch + Origin header), legacy embed spec still passes untouched. | E2E proof of the whole flow                                 | M1-01..03 | Sonnet high |

**M1 acceptance gate**: `npm run validate` green + `npm run build:widget` +
`npx playwright test` green locally (both legacy and new specs).

### M2 — Hardening + docs (after M1 gate)

| #     | Card                                                        | Scope                                                                                                                                                                                     | Depends | Calibration |
| ----- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | ----------- |
| M2-01 | `feat: per-tenant widget auth secret (envelope encryption)` | D5: `src/lib/envelope.ts` (AES-256-GCM wrap/unwrap, KEK `BUGDROP_KEK`, versioned prefix `v1.`), admin routes accept plaintext secret on create/update and store only the envelope; tenant API verifies `bd1.` tokens against the tenant secret when configured (falling back to global secrets for legacy routes only). Unit tests incl. round-trip and KEK-missing fail-loud. | M1      | Fable (security-critical review required) |
| M2-02 | `docs: document single-script multi-tenant embed`           | README section + `docs/website` page if the site has an install page: one-line snippet, admin API usage (curl examples), TenantConfig reference table, migration note that legacy embed is unchanged.                                                                                                | M1      | Sonnet low  |

## Hard rules for executor agents

1. One card = one agent = one coherent conventional commit; commit message = card
   title. Do not `git add -A`; stage only files your card touches.
2. Never deploy. Never run `wrangler deploy` or touch CI workflows.
3. Legacy behavior is untouchable: if an existing test needs modification to pass,
   STOP and report instead.
4. Interfaces in this contract are law (schema, route paths, function names,
   binding names). Divergence requires amending this file BEFORE the code.
5. No new npm dependencies. No secrets in code, `wrangler.toml` `[vars]`, tests,
   or logs; dev secrets go in `.dev.vars` (+ `.dev.vars.example` placeholders).
6. Respect ESLint limits (300-line files, 150-line functions); split files rather
   than suppress warnings. Never weaken lint/type configs.
7. After your card: run `npm run validate`; a widget card also runs
   `npm run build:widget`. Report results honestly; a red gate = card not done.
8. STOP conditions: same error 3 times → stop and report; implementation growing
   past ~2x the card's scope → stop and report; ambiguity in the contract → stop
   and ask, do not improvise.
9. Card report format (final message): JSON
   `{ card, status: 'done'|'blocked', filesTouched[], testsAdded, gate: {validate, build}, findings[], next_action }`.

## Gates that survive all milestones

- The pre-PR review gate from `CLAUDE.md` (pr-review-toolkit agents) runs before
  the PR is opened; findings are addressed first.
- Burden Of Proof (`CLAUDE.md`): before declaring the feature complete, actively
  try to disprove it (e.g. cross-tenant request with a valid foreign origin, repo
  spoof attempt, cache poisoning of the loader) and attach the evidence.
- Operator deployment (KV namespace creation, `ADMIN_TOKEN`/`BUGDROP_KEK` secrets,
  real tenant records) is NEVER part of this branch; it happens on the operator's
  account, manually, after merge.

## Decisions only the owner can take (open)

- Whether to upstream this PR to `mean-weasel/bugdrop` as-is or keep it on a fork
  for the operator instance first.
- Tenant key format for real customers (readable slug like `acme` vs random
  suffix like `acme-8f3k`).
- Whether M2-01 (per-tenant auth secrets) is needed before the first real tenant
  or can wait.
- Custom domain / hosting account for the operator instance.

## Amendments

- (none yet)

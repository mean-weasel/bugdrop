# BugDrop 🐛

[![CI](https://github.com/mean-weasel/bugdrop/actions/workflows/ci.yml/badge.svg)](https://github.com/mean-weasel/bugdrop/actions/workflows/ci.yml)
[![Version](https://img.shields.io/badge/version-1.11.0-14b8a6)](./CHANGELOG.md)
[![Security Policy](https://img.shields.io/badge/Security-Policy-blue)](./SECURITY.md)
[![Live Demo](https://img.shields.io/badge/Demo-Try_It_Live-ff9e64)](https://bugdrop-widget-test.vercel.app)
[![GitHub Marketplace](https://img.shields.io/badge/GitHub%20Marketplace-Install-2ea44f?logo=github)](https://github.com/marketplace/bugdrop-in-app-feedback-to-github-issues)
[![Product Hunt](https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1141615&theme=light&t=1778415221018)](https://www.producthunt.com/products/bugdrop-2?utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-bugdrop-2)

In-app feedback → GitHub Issues. Screenshots, annotations, the works.

Featured on Product Hunt and ranked #6 Product of the Day on May 9, 2026.

![bugdrop-demo-small](https://github.com/user-attachments/assets/22d234fa-aa0f-4d01-bc4f-4c3e8f107165)

## Quick Start

> Works with both public and private repositories!

**1. Install the GitHub App** on your repository:

https://github.com/marketplace/bugdrop-in-app-feedback-to-github-issues

**2. Add the script** to your website:

```html
<script src="https://bugdrop.neonwatty.workers.dev/widget.js" data-repo="owner/repo"></script>
```

That's it! Users can now click the bug button to submit feedback as GitHub Issues.

> **Important:** Do not add `async` or `defer` to the script tag — the widget needs synchronous loading to read its configuration.

> **CSP note:** If your site uses a Content Security Policy, add `https://bugdrop.neonwatty.workers.dev` to your `script-src` directive to enable the widget.

> **Branch protection:** BugDrop works with repos that have branch protection rules (required PRs, merge queues). Screenshots are stored on a dedicated `bugdrop-screenshots` branch that is auto-created on first use — no manual setup needed.

> **Security note:** BugDrop is not a spam or malware filtering service. Treat feedback and screenshots as unauthenticated user-generated content. Exclude `bugdrop-screenshots` from CI/deploy workflows, and self-host behind your own WAF/CAPTCHA/content controls for stricter environments.

## Multi-tenant hosted embed

If you self-host a BugDrop Worker for multiple customers or sites, you can serve a
single-script "loader" per tenant instead of hand-writing `data-*` attributes on
every page. This is an operator feature (opt-in, requires your own Worker
deployment) — the public `bugdrop.neonwatty.workers.dev` service above is unaffected
and the legacy `/widget.js` embed keeps working exactly as documented, byte for byte.

```html
<script src="https://<worker-host>/t/{tenantKey}.js" async></script>
```

A **tenant** is one customer of your hosted instance: a target repo, an origin
allowlist, a theme, behavior flags, and a rate-limit tier, stored server-side and
managed by you (the operator) through an admin API. The loader at `/t/{tenantKey}.js`
renders a tiny bootstrap script that injects the widget core
(`/widget.v1.js`) with the tenant's config baked in as `data-*` attributes — same
widget bootstrap, same theming pipeline, zero per-site configuration for the
customer.

An unknown or paused tenant key still returns `200` with a body that only does
`console.warn(...)`, so a bad key never shows up as a broken script tag on the
customer's page.

### TenantConfig v1 reference

| Field                     | Type                   | Notes                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `version`                 | `1`                    | Fixed.                                                                                                                                                                                                                                                                                                                                                                                          |
| `key`                     | `string`               | Tenant slug, `^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$`. Public — appears in the loader URL. Not a secret; origin checks are the security boundary, not the key.                                                                                                                                                                                                                                   |
| `name`                    | `string`               | Display name, 1-100 chars.                                                                                                                                                                                                                                                                                                                                                                      |
| `repo`                    | `string`               | `owner/repo`. Authoritative: any `repo` a client sends is validated against this and rejected with `400` on mismatch.                                                                                                                                                                                                                                                                           |
| `origins`                 | `string[]`             | Exact-match web origins (e.g. `https://app.example.com`). `https://` required, except `http://localhost[:port]`. No paths, no wildcards. Requests with an `Origin` header outside this list get `403`; requests without an `Origin` header (curl, server-to-server) are allowed, matching the legacy embed.                                                                                     |
| `status`                  | `"active" \| "paused"` | A paused tenant gets a warn-only loader and `403` on feedback/check.                                                                                                                                                                                                                                                                                                                            |
| `theme.*`                 | see below              | Maps 1:1 to the existing `data-*` theming attributes.                                                                                                                                                                                                                                                                                                                                           |
| `behavior.*`              | see below              | Maps 1:1 to the existing `data-*` behavior attributes.                                                                                                                                                                                                                                                                                                                                          |
| `rate.perIp`              | `number`               | Overrides the default 20 requests / 15 min per IP.                                                                                                                                                                                                                                                                                                                                              |
| `rate.perRepo`            | `number`               | Overrides the default 50 requests / 60 min per repo. Tenant rate buckets never share counters with the legacy global limits or with other tenants.                                                                                                                                                                                                                                              |
| `authTokenSecretEnc`      | `string`               | Server-managed: an AES-256-GCM envelope (`v1.<iv>.<ciphertext>`, KEK from the `BUGDROP_KEK` Workers Secret) storing a per-tenant widget-auth secret. Don't set this field directly in admin requests: send plaintext via the write-only `authTokenSecret` field instead (see Admin API below); the server wraps it before storing and never returns the plaintext or the envelope in responses. |
| `createdAt` / `updatedAt` | `string`               | ISO 8601, set by the server; ignored/overwritten if sent.                                                                                                                                                                                                                                                                                                                                       |

`theme` fields (all optional): `color`, `bg`, `text`, `font`, `radius`, `borderWidth`,
`borderColor`, `shadow` (`none`/`soft`/`hard`), `icon`, `label`,
`position` (`bottom-right`/`bottom-left`), `mode` (`light`/`dark`/`auto`) — these map
to `data-color`, `data-bg`, `data-text`, `data-font`, `data-radius`,
`data-border-width`, `data-border-color`, `data-shadow`, `data-icon`, `data-label`,
`data-position`, `data-theme` respectively.

`behavior` fields (all optional): `locale`, `showName`, `requireName`, `showEmail`,
`requireEmail`, `screenshot` (`optional`/`auto`/`required`), `welcome`
(`once`/`always`/`never`), `showIssueLink` (`public`/`always`/`never`),
`sendConsoleLogs`, `buttonDismissible`, `dismissDuration` (days), `showRestore`,
`categoryLabels` (JSON) — same mapping pattern to their `data-*` equivalents.

Unknown fields at any level are rejected (fail-loud on typos).

### Admin API

Full CRUD lives under `/api/admin/tenants`, protected by a Bearer token compared
timing-safe against the `ADMIN_TOKEN` Workers Secret. There is no CORS allowance on
this surface — same-origin/curl only. If `ADMIN_TOKEN` (or the `TENANTS` KV binding)
is missing, every admin route fails loud with `503` rather than opening up.

To set or rotate a tenant's optional widget-auth secret, send plaintext through the
write-only `authTokenSecret` field (16-256 chars, or `authTokenSecret: null` to
clear it). The server wraps it into the `authTokenSecretEnc` envelope with
`BUGDROP_KEK` before storing it; the plaintext is never persisted, logged, or
echoed back. Admin responses never include the envelope either — they report
`hasAuthTokenSecret: true|false` instead.

```bash
# Create a tenant
curl -X POST https://<worker-host>/api/admin/tenants \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "acme",
    "name": "Acme Corp",
    "repo": "acme-corp/website",
    "origins": ["https://acme.example.com"],
    "status": "active",
    "theme": { "color": "#6366f1", "position": "bottom-left" }
  }'

# List tenants (key + name only)
curl https://<worker-host>/api/admin/tenants \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Get a tenant
curl https://<worker-host>/api/admin/tenants/acme \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Update a tenant (full object; createdAt is preserved, updatedAt is refreshed).
# Omitting authTokenSecret keeps the existing one, if any; pass null to clear it.
curl -X PUT https://<worker-host>/api/admin/tenants/acme \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "name": "Acme Corp", "repo": "acme-corp/website", "origins": ["https://acme.example.com"], "status": "paused" }'

# Set/rotate the tenant's widget-auth secret
curl -X PUT https://<worker-host>/api/admin/tenants/acme \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "name": "Acme Corp", "repo": "acme-corp/website", "origins": ["https://acme.example.com"], "status": "active", "authTokenSecret": "a-long-random-shared-secret" }'

# Delete a tenant
curl -X DELETE https://<worker-host>/api/admin/tenants/acme \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### Enabling multi-tenant mode on your own deployment

Multi-tenant embed is opt-in and dormant unless you configure it:

1. Create the KV namespace: `wrangler kv namespace create bugdrop-tenants`, then
   replace the placeholder `id` under the `TENANTS` binding in `wrangler.toml`
   with the real namespace id.
2. Set the admin secret: `wrangler secret put ADMIN_TOKEN` (a long random value —
   this is the Bearer token for `/api/admin/tenants`).
3. If you plan to set per-tenant widget-auth secrets (`authTokenSecret` above),
   set `wrangler secret put BUGDROP_KEK` to a random 32-byte key, base64 or
   base64url encoded. Without it, tenants that don't use `authTokenSecret` are
   unaffected; a create/update that does set it fails with `500` until the key
   is configured (fail-loud by design, never silently unencrypted).
4. Create tenants via the admin API above, then hand each customer their
   `/t/{tenantKey}.js` snippet.

Without the `TENANTS` binding, the admin routes return `503`, `/t/*.js` serves the
warn-only body, and everything else (legacy `/widget.js` + `/api`) is unaffected.

### SRI (Subresource Integrity)

The tenant loader does **not** support SRI. Its body changes whenever you edit a
tenant's config, and the widget core it injects rolls forward on minor releases —
the same trade-off every vendor loader makes (HubSpot, Intercom, Sentry): the trust
anchor is the serving origin over HTTPS, not a content hash. If you need SRI, use the
legacy embed instead: pin an exact widget version
(`https://<worker-host>/widget.v1.X.Y.js`) and hand-write the `data-*` attributes
yourself, with a matching `integrity` attribute on the `<script>` tag. That gets you
SRI at the cost of losing centrally managed config.

## Features

- 🔒 **Privacy masking** — tag sensitive elements with `data-bugdrop-mask` and BugDrop visually covers them in supported screenshot modes before submission. Passwords and credit-card inputs are masked automatically.

## Widget Options

| Attribute                       | Values                                               | Default               |
| ------------------------------- | ---------------------------------------------------- | --------------------- |
| `data-repo`                     | `owner/repo`                                         | **required**          |
| `data-theme`                    | `light`, `dark`, `auto`                              | `auto`                |
| `data-locale`                   | `en`, `nl`, `pl` (region subtags accepted)           | `<html lang>` or `en` |
| `data-position`                 | `bottom-right`, `bottom-left`                        | `bottom-right`        |
| `data-color`                    | Accent color for buttons/highlights (e.g. `#FF6B35`) | `#14b8a6` (teal)      |
| `data-label`                    | Any string                                           | localized label       |
| `data-category-labels`          | JSON mapping for self-hosted category labels         | built-in labels       |
| `data-button`                   | `true`, `false`                                      | `true`                |
| `data-send-console-logs`        | `true`, `false`                                      | `false`               |
| `data-element-context-max-area` | Viewport-area multiplier for Select Element context  | `0`                   |

See [full documentation](https://bugdrop.dev/docs/configuration) for all options including styling, submitter info, and dismissible button.

## Documentation

- [Full Documentation](https://bugdrop.dev/docs)
- [Built with BugDrop Showcase](https://bugdrop.dev/showcase)
- [GitHub Marketplace](https://github.com/marketplace/bugdrop-in-app-feedback-to-github-issues)
- [Configuration](https://bugdrop.dev/docs/configuration)
- [Styling](https://bugdrop.dev/docs/styling)
- [JavaScript API](https://bugdrop.dev/docs/javascript-api)
- [Version Pinning](https://bugdrop.dev/docs/version-pinning)
- [CI Testing](https://bugdrop.dev/docs/ci-testing)
- [Security & Rate Limiting](https://bugdrop.dev/docs/security)
- [Self-Hosting](https://bugdrop.dev/docs/self-hosting)
- [FAQ](https://bugdrop.dev/docs/faq)

## How It Works

```
User clicks bug button → Widget captures screenshot → Worker authenticates via GitHub App → Issue created in your repo
```

1. **Widget** loads in a Shadow DOM (isolated from your page styles)
2. **Screenshot** captured client-side using html-to-image
3. **Worker** (Cloudflare) exchanges GitHub App credentials for an installation token
4. **GitHub API** creates the issue with the screenshot stored in `.bugdrop/` on a dedicated `bugdrop-screenshots` branch (auto-created on first use)

## Live Demo

Try it on [WienerMatch](https://bugdrop-widget-test.vercel.app) — click the bug button in the bottom right corner.

## License

MIT

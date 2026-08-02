# BugDrop 🐛

[![CI](https://github.com/mean-weasel/bugdrop/actions/workflows/ci.yml/badge.svg)](https://github.com/mean-weasel/bugdrop/actions/workflows/ci.yml)
[![Version](https://img.shields.io/badge/version-1.11.0-14b8a6)](./CHANGELOG.md)
[![Security Policy](https://img.shields.io/badge/Security-Policy-blue)](./SECURITY.md)
[![Live Demo](https://img.shields.io/badge/Demo-Try_It_Live-ff9e64)](https://bugdrop-widget-test.vercel.app)
[![GitHub Marketplace](https://img.shields.io/badge/GitHub%20Marketplace-Install-2ea44f?logo=github)](https://github.com/marketplace/bugdrop-in-app-feedback-to-github-issues)
[![Product Hunt](https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1141615&theme=light&t=1778415221018)](https://www.producthunt.com/products/bugdrop-2?utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-bugdrop-2)

In-app feedback → GitHub Issues. Screenshots, annotations, the works.

The Worker also accepts a versioned, field-agnostic structured submission envelope for custom UXs.
It validates bounded Issue drafts, keeps raw GitHub labels server-controlled through
`VARIANT_LABELS`, and reuses the legacy endpoint, authentication, rate limits, GitHub App, and
success response. `window.BugDrop.registerVariant(config).submit(answers)` provides the headless
browser path; rendered modal and inline variants follow in a later phase. Existing script tags and
legacy payloads remain unchanged.

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

## Features

- 🔒 **Privacy masking** — tag sensitive elements with `data-bugdrop-mask` and BugDrop visually covers them in supported screenshot modes before submission. Passwords and credit-card inputs are masked automatically.

## Widget Options

| Attribute                       | Values                                               | Default               |
| ------------------------------- | ---------------------------------------------------- | --------------------- |
| `data-repo`                     | `owner/repo`                                         | **required**          |
| `data-theme`                    | `light`, `dark`, `auto`                              | `auto`                |
| `data-locale`                   | `de`, `en`, `nl`, `pl` (region subtags accepted)     | `<html lang>` or `en` |
| `data-position`                 | `bottom-right`, `bottom-left`                        | `bottom-right`        |
| `data-color`                    | Accent color for buttons/highlights (e.g. `#FF6B35`) | `#14b8a6` (teal)      |
| `data-label`                    | Any string                                           | localized label       |
| `data-category-labels`          | JSON mapping for self-hosted category labels         | built-in labels       |
| `data-button`                   | `true`, `false`                                      | `true`                |
| `data-send-console-logs`        | `true`, `false`                                      | `false`               |
| `data-element-context-max-area` | Viewport-area multiplier for Select Element context  | `0`                   |

See [full documentation](https://bugdrop.dev/docs/configuration) for all options including styling, submitter info, and dismissible button.

## Test a Local Widget on a Live Site

Build the widget and start the local server:

```bash
npm run build:widget && npm run dev
```

Then open the live site, open the browser console, and paste the script below. Change the
`script.dataset.repo` value if the site should use a different repository.

```js
(() => {
  const localBase = 'http://127.0.0.1:8787';

  // Local development normally has no GitHub App credentials, so allow the
  // widget to open while leaving every other request unchanged.
  window.__bugdropRealFetch ??= window.fetch.bind(window);
  window.fetch = (input, options) => {
    if (String(input).startsWith(`${localBase}/api/check/`)) {
      return Promise.resolve(
        new Response(JSON.stringify({ installed: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    }

    return window.__bugdropRealFetch(input, options);
  };

  document.querySelector('#bugdrop-host')?.remove();
  delete window.BugDrop;

  document
    .querySelectorAll('script[data-bugdrop-local-test="true"]')
    .forEach(script => script.remove());

  const script = document.createElement('script');
  script.src = `${localBase}/widget.js`;
  script.dataset.repo = 'owner/repo';
  script.dataset.welcome = 'never';
  script.dataset.theme = 'light';
  script.dataset.bugdropLocalTest = 'true';
  script.onload = () => window.BugDrop?.open();
  document.body.appendChild(script);
})();
```

This is intended for testing the widget and screenshot flow only. Submitting feedback still
requires valid GitHub App credentials on the local server. If Chrome asks whether the page may
access devices or services on the local network, allow it so the page can load `widget.js`. Reload
the live page after testing to restore its original widget and `fetch` implementation.

## Documentation

- [Full Documentation](https://bugdrop.dev/docs)
- [Built with BugDrop Showcase](https://bugdrop.dev/showcase)
- [GitHub Marketplace](https://github.com/marketplace/bugdrop-in-app-feedback-to-github-issues)
- [Configuration](https://bugdrop.dev/docs/configuration)
- [Styling](https://bugdrop.dev/docs/styling)
- [JavaScript API](https://bugdrop.dev/docs/javascript-api)
- [Version Pinning](https://bugdrop.dev/docs/version-pinning)
- [CI Testing](https://bugdrop.dev/docs/ci-testing)
- [Merge-queue Issue canary operations](docs/merge-queue-issue-canary.md)
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

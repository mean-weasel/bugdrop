# BugDrop 🐛

[![CI](https://github.com/mean-weasel/bugdrop/actions/workflows/ci.yml/badge.svg)](https://github.com/mean-weasel/bugdrop/actions/workflows/ci.yml)
[![Version](https://img.shields.io/badge/version-1.11.0-14b8a6)](./CHANGELOG.md)
[![Security Policy](https://img.shields.io/badge/Security-Policy-blue)](./SECURITY.md)
[![Live Demo](https://img.shields.io/badge/Demo-Try_It_Live-ff9e64)](https://bugdrop-widget-test.vercel.app)

In-app feedback → GitHub Issues. Screenshots, annotations, the works.

![bugdrop-demo-small](https://github.com/user-attachments/assets/22d234fa-aa0f-4d01-bc4f-4c3e8f107165)

## Quick Start

> Works with both public and private repositories!

**1. Install the GitHub App** on your repository:

https://github.com/apps/neonwatty-bugdrop/installations/new

**2. Add the script** to your website:

```html
<script src="https://bugdrop.neonwatty.workers.dev/widget.js" data-repo="owner/repo"></script>
```

That's it! Users can now click the bug button to submit feedback as GitHub Issues.

> **Important:** Do not add `async` or `defer` to the script tag — the widget needs synchronous loading to read its configuration.

> **CSP note:** If your site uses a Content Security Policy, add `https://cdn.jsdelivr.net` to your `script-src` directive to enable screenshot capture.

> **Branch protection:** BugDrop works with repos that have branch protection rules (required PRs, merge queues). Screenshots are stored on a dedicated `bugdrop-screenshots` branch that is auto-created on first use — no manual setup needed.

## Widget Options

| Attribute       | Values                                               | Default          |
| --------------- | ---------------------------------------------------- | ---------------- |
| `data-repo`     | `owner/repo`                                         | **required**     |
| `data-theme`    | `light`, `dark`, `auto`                              | `auto`           |
| `data-position` | `bottom-right`, `bottom-left`                        | `bottom-right`   |
| `data-color`    | Accent color for buttons/highlights (e.g. `#FF6B35`) | `#14b8a6` (teal) |
| `data-label`    | Any string                                           | `Feedback`       |
| `data-button`   | `true`, `false`                                      | `true`           |

See [full documentation](https://bugdrop.dev/docs/configuration) for all options including styling, submitter info, and dismissible button.

## Documentation

- [Full Documentation](https://bugdrop.dev/docs)
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
2. **Screenshot** captured client-side using html2canvas
3. **Worker** (Cloudflare) exchanges GitHub App credentials for an installation token
4. **GitHub API** creates the issue with the screenshot stored in `.bugdrop/` on a dedicated `bugdrop-screenshots` branch (auto-created on first use)

## Live Demo

Try it on [WienerMatch](https://bugdrop-widget-test.vercel.app) — click the bug button in the bottom right corner.

## License

MIT

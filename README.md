# BugDrop 🐛

[![CI](https://github.com/neonwatty/bugdrop/actions/workflows/ci.yml/badge.svg)](https://github.com/neonwatty/bugdrop/actions/workflows/ci.yml)
[![Version](https://img.shields.io/badge/version-1.11.0-14b8a6)](./CHANGELOG.md)
[![Security Policy](https://img.shields.io/badge/Security-Policy-blue)](./SECURITY.md)
[![Live Demo](https://img.shields.io/badge/Demo-Try_It_Live-ff9e64)](https://neonwatty.github.io/feedback-widget-test/)

In-app feedback → GitHub Issues. Screenshots, annotations, the works.

![bugdrop-demo-small](https://github.com/user-attachments/assets/22d234fa-aa0f-4d01-bc4f-4c3e8f107165)

## Quick Start

> Works with both public and private repositories!

**1. Install the GitHub App** on your repository:

https://github.com/apps/neonwatty-bugdrop/installations/new

**2. Add the script** to your website:

```html
<script src="https://bugdrop.neonwatty.workers.dev/widget.js"
        data-repo="owner/repo"></script>
```

That's it! Users can now click the bug button to submit feedback as GitHub Issues.

> **Important:** Do not add `async` or `defer` to the script tag — the widget needs synchronous loading to read its configuration.

> **CSP note:** If your site uses a Content Security Policy, add `https://cdn.jsdelivr.net` to your `script-src` directive to enable screenshot capture.

## Version Pinning

By default, `/widget.js` always serves the latest version. For production stability, pin to a specific version:

```html
<!-- Recommended for production: pin to major version -->
<script src="https://bugdrop.neonwatty.workers.dev/widget.v1.js"
        data-repo="owner/repo"></script>
```

| URL | Updates | Best For |
|-----|---------|----------|
| `/widget.js` | Always latest | Development |
| `/widget.v1.js` | Bug fixes only | Production (recommended) |
| `/widget.v1.1.js` | Patch fixes only | Strict stability |
| `/widget.v1.1.0.js` | Never | Maximum control |

See [CHANGELOG.md](./CHANGELOG.md) for version history and migration guides.

## Widget Options

| Attribute | Values | Default |
|-----------|--------|---------|
| `data-repo` | `owner/repo` | **required** |
| `data-theme` | `light`, `dark`, `auto` | `auto` |
| `data-position` | `bottom-right`, `bottom-left` | `bottom-right` |
| `data-color` | Accent color for buttons/highlights (e.g. `#FF6B35`) | `#14b8a6` (teal) |
| `data-icon` | Image URL or `none` | (bug emoji) |
| `data-label` | Any string | `Feedback` |
| `data-show-name` | `true`, `false` | `false` |
| `data-require-name` | `true`, `false` | `false` |
| `data-show-email` | `true`, `false` | `false` |
| `data-require-email` | `true`, `false` | `false` |
| `data-button-dismissible` | `true`, `false` | `false` |
| `data-dismiss-duration` | Number (days) | (forever) |
| `data-show-restore` | `true`, `false` | `true` |
| `data-button` | `true`, `false` | `true` |

**Styling options** — make the widget match your app's design:

| Attribute | Values | Default |
|-----------|--------|---------|
| `data-font` | `inherit` or font-family string | `Space Grotesk` |
| `data-radius` | Pixels (e.g. `0`, `8`, `16`) | `6` |
| `data-bg` | CSS color (e.g. `#fffef0`) | theme default |
| `data-text` | CSS color (e.g. `#1a1a1a`) | theme default |
| `data-border-width` | Pixels (e.g. `4`) | `1` |
| `data-border-color` | CSS color (e.g. `#1a1a1a`) | theme default |
| `data-shadow` | `soft`, `hard`, `none` | `soft` |

```html
<script src="https://bugdrop.neonwatty.workers.dev/widget.js"
        data-repo="owner/repo"
        data-theme="dark"
        data-position="bottom-left"
        data-color="#FF6B35"></script>
```

### Custom Styling

Use `data-font="inherit"` to pick up your page's font instead of BugDrop's built-in Space Grotesk. Combine with `data-radius`, `data-bg`, and `data-text` to make the widget look native to your app:

```html
<!-- Elegant serif site -->
<script src="https://bugdrop.neonwatty.workers.dev/widget.js"
        data-repo="owner/repo"
        data-font="inherit"
        data-radius="8"
        data-bg="#fafafa"
        data-text="#1a1a1a"
        data-color="#c5a55a"></script>
```

For bold or brutalist designs, add thick borders and hard drop shadows:

```html
<!-- Comic / punk design -->
<script src="https://bugdrop.neonwatty.workers.dev/widget.js"
        data-repo="owner/repo"
        data-font="inherit"
        data-radius="0"
        data-bg="#fffef0"
        data-text="#1a1a1a"
        data-color="#e53935"
        data-border-width="4"
        data-border-color="#1a1a1a"
        data-shadow="hard"></script>
```

Shadow presets: `soft` (default subtle shadows), `hard` (offset drop shadow), `none` (no shadows).

### Custom Icon & Label

Replace the default bug emoji with your own image, hide it entirely, or change the button text:

```html
<!-- Custom icon -->
<script src="https://bugdrop.neonwatty.workers.dev/widget.js"
        data-repo="owner/repo"
        data-icon="https://example.com/my-logo.svg"></script>

<!-- No icon, just text -->
<script src="https://bugdrop.neonwatty.workers.dev/widget.js"
        data-repo="owner/repo"
        data-icon="none"
        data-label="?"></script>

<!-- Custom label -->
<script src="https://bugdrop.neonwatty.workers.dev/widget.js"
        data-repo="owner/repo"
        data-label="Report Issue"></script>
```

The icon image is displayed at 18px (16px on mobile). If the image fails to load, the default bug emoji is shown as a fallback.

### Collecting Submitter Info

By default, BugDrop only asks for a title and description. You can optionally collect user name and email:

```html
<!-- Require name, optional email -->
<script src="https://bugdrop.neonwatty.workers.dev/widget.js"
        data-repo="owner/repo"
        data-show-name="true"
        data-require-name="true"
        data-show-email="true"></script>
```

When provided, submitter info appears at the top of the GitHub issue.

### Dismissible Button

Allow users to hide the floating button if they don't want it:

```html
<script src="https://bugdrop.neonwatty.workers.dev/widget.js"
        data-repo="owner/repo"
        data-button-dismissible="true"></script>
```

When enabled, hovering over the button reveals an X icon. Clicking it hides the button and shows a subtle pull tab on the screen edge. Users can click the pull tab to restore the full button. The dismissed state is saved to localStorage (`bugdrop_dismissed`).

**Disable the restore pull tab** — if you don't want the pull tab to appear:

```html
<script src="https://bugdrop.neonwatty.workers.dev/widget.js"
        data-repo="owner/repo"
        data-button-dismissible="true"
        data-show-restore="false"></script>
```

**Auto-reappear after duration** — Let the button come back after a number of days:

```html
<script src="https://bugdrop.neonwatty.workers.dev/widget.js"
        data-repo="owner/repo"
        data-button-dismissible="true"
        data-dismiss-duration="7"></script>
```

With `data-dismiss-duration="7"`, users who dismiss the button will see it again after 7 days. Without this attribute, the button stays hidden forever (until localStorage is cleared).

### Feedback Categories

When users submit feedback, they can select a category:

| Category | Emoji | GitHub Label |
|----------|-------|--------------|
| Bug | 🐛 | `bug` |
| Feature | ✨ | `enhancement` |
| Question | ❓ | `question` |

The selected category is automatically mapped to a GitHub label on the created issue, making it easy to filter and triage feedback. Bug is selected by default.

### Automatic System Info

Each feedback submission automatically includes:

- **Browser** name and version (e.g., Chrome 120)
- **OS** name and version (e.g., macOS 14.2)
- **Viewport** size with device pixel ratio
- **Language** preference
- **Page URL** (with query params redacted for privacy)

This information appears in a collapsible "System Info" section on the GitHub issue.

### JavaScript API

BugDrop exposes a JavaScript API for programmatic control, useful when you want to trigger feedback from your own UI instead of (or in addition to) the floating button.

```javascript
window.BugDrop = {
  open(),           // Open the feedback modal
  close(),          // Close the modal
  hide(),           // Hide the floating button
  show(),           // Show the floating button (clears dismissed state)
  isOpen(),         // Returns true if modal is open
  isButtonVisible() // Returns true if button is visible
};
```

**API-only mode** — hide the floating button entirely and trigger feedback from your own UI:

```html
<script src="https://bugdrop.neonwatty.workers.dev/widget.js"
        data-repo="owner/repo"
        data-button="false"></script>
```

**Example: Menu item integration**

```html
<nav>
  <a href="#">Home</a>
  <a href="#">Products</a>
  <span id="report-bug">Report Bug</span>
</nav>

<script>
  window.addEventListener('bugdrop:ready', () => {
    document.getElementById('report-bug').addEventListener('click', () => {
      window.BugDrop.open();
    });
  });
</script>
```

The `bugdrop:ready` event fires when the API is available. You can also check `if (window.BugDrop)` for synchronous initialization.

## Testing Your Configuration

### Quick Check

Open your browser console and look for `[BugDrop]` errors. Then click the feedback button — if the form opens, the widget is configured correctly. Common console messages:
- `Missing data-repo attribute` — you forgot `data-repo`
- `Invalid data-repo format` — use `owner/repo`, not a full URL
- `document.currentScript is null` — remove `async`/`defer` from the script tag

### CI Testing with Playwright

For automated testing, add this Playwright test to your CI pipeline.

**Install Playwright** (if you haven't already):

```bash
npm install -D @playwright/test
npx playwright install
```

**Create `tests/bugdrop.spec.ts`:**

```typescript
import { test, expect } from '@playwright/test';

// ============================================================
// CONFIGURE THESE VALUES TO MATCH YOUR BUGDROP SETUP
// ============================================================
const APP_URL = 'https://your-app.com'; // Your app's URL
const EXPECTED = {
  accentColor: '#e53935',   // Your data-color value (or null to skip)
  bgColor: '#fffef0',       // Your data-bg value (or null to skip)
  textColor: '#1a1a1a',     // Your data-text value (or null to skip)
  borderRadius: '0px',      // Your data-radius + 'px' (or null to skip)
  fontFamily: null,         // Substring to check (e.g., 'Georgia') or null
};
// ============================================================

// WCAG contrast ratio helper — no dependencies needed
function luminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function parseColor(color: string): [number, number, number] {
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) return [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])];
  return [0, 0, 0];
}

function contrastRatio(fg: string, bg: string): number {
  const l1 = luminance(...parseColor(fg));
  const l2 = luminance(...parseColor(bg));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

test.describe('BugDrop widget', () => {
  test('renders and is visible', async ({ page }) => {
    await page.goto(APP_URL);
    const host = page.locator('#bugdrop-host');
    await expect(host).toBeAttached({ timeout: 10000 });

    // Trigger button should be visible inside shadow DOM
    const trigger = host.locator('internal:shadow=.bd-trigger');
    await expect(trigger).toBeVisible();
  });

  test('modal opens on click', async ({ page }) => {
    await page.goto(APP_URL);
    const host = page.locator('#bugdrop-host');
    const trigger = host.locator('internal:shadow=.bd-trigger');
    await trigger.click();

    // A modal or overlay should appear
    const overlay = host.locator('internal:shadow=.bd-overlay');
    await expect(overlay).toBeVisible({ timeout: 5000 });
  });

  test('meets WCAG AA contrast requirements', async ({ page }) => {
    await page.goto(APP_URL);
    const host = page.locator('#bugdrop-host');
    const trigger = host.locator('internal:shadow=.bd-trigger');
    await trigger.click();

    // Wait for modal
    const overlay = host.locator('internal:shadow=.bd-overlay');
    await expect(overlay).toBeVisible({ timeout: 5000 });

    // Check text contrast inside the modal
    const styles = await page.evaluate(() => {
      const host = document.querySelector('#bugdrop-host');
      if (!host?.shadowRoot) return null;
      const modal = host.shadowRoot.querySelector('.bd-modal');
      if (!modal) return null;
      const cs = getComputedStyle(modal);
      const title = host.shadowRoot.querySelector('.bd-title');
      const titleCs = title ? getComputedStyle(title) : null;
      return {
        modalBg: cs.backgroundColor,
        titleColor: titleCs?.color || cs.color,
      };
    });

    expect(styles).not.toBeNull();
    const ratio = contrastRatio(styles!.titleColor, styles!.modalBg);
    expect(ratio).toBeGreaterThanOrEqual(4.5); // WCAG AA
  });

  test('config values match expected', async ({ page }) => {
    await page.goto(APP_URL);
    const host = page.locator('#bugdrop-host');
    const trigger = host.locator('internal:shadow=.bd-trigger');

    const styles = await page.evaluate(() => {
      const host = document.querySelector('#bugdrop-host');
      if (!host?.shadowRoot) return null;
      const root = host.shadowRoot.querySelector('.bd-root') as HTMLElement;
      if (!root) return null;
      const cs = getComputedStyle(root);
      const triggerEl = host.shadowRoot.querySelector('.bd-trigger') as HTMLElement;
      const triggerCs = triggerEl ? getComputedStyle(triggerEl) : null;
      return {
        bgColor: cs.getPropertyValue('--bd-bg-primary').trim(),
        textColor: cs.getPropertyValue('--bd-text-primary').trim(),
        accentColor: cs.getPropertyValue('--bd-primary').trim(),
        borderRadius: triggerCs?.borderRadius || '',
        fontFamily: cs.fontFamily,
      };
    });

    expect(styles).not.toBeNull();

    if (EXPECTED.accentColor) {
      expect(styles!.accentColor).toBe(EXPECTED.accentColor);
    }
    if (EXPECTED.bgColor) {
      expect(styles!.bgColor).toBe(EXPECTED.bgColor);
    }
    if (EXPECTED.textColor) {
      expect(styles!.textColor).toBe(EXPECTED.textColor);
    }
    if (EXPECTED.borderRadius) {
      expect(styles!.borderRadius).toContain(EXPECTED.borderRadius);
    }
    if (EXPECTED.fontFamily) {
      expect(styles!.fontFamily).toContain(EXPECTED.fontFamily);
    }
  });
});
```

**Run the tests:**

```bash
npx playwright test tests/bugdrop.spec.ts
```

The test checks three things:
1. **Functional** — widget renders, trigger is visible, modal opens
2. **Accessibility** — title text meets WCAG AA contrast ratio (4.5:1) against modal background
3. **Config verification** — computed CSS values match your expected `data-*` attribute values

Customize the `EXPECTED` object at the top to match your configuration. Set any value to `null` to skip that check.

## Live Demo

Try it on [WienerMatch](https://neonwatty.github.io/feedback-widget-test/) — click the bug button in the bottom right corner.

## How It Works

```
User clicks bug button → Widget captures screenshot → Worker authenticates via GitHub App → Issue created in your repo
```

1. **Widget** loads in a Shadow DOM (isolated from your page styles)
2. **Screenshot** captured client-side using html2canvas
3. **Worker** (Cloudflare) exchanges GitHub App credentials for an installation token
4. **GitHub API** creates the issue with the screenshot stored in `.bugdrop/`

## Security

- **Permissions**: Issues (R/W), Contents (R/W) - only on repos you install it on
- **Data storage**: Screenshots stored in your repo's `.bugdrop/` folder
- **Privacy**: No user data stored by the widget service

## Rate Limiting

The API includes rate limiting to prevent spam and protect GitHub API quotas:

| Scope | Limit | Window |
|-------|-------|--------|
| Per IP | 10 requests | 15 minutes |
| Per Repository | 50 requests | 1 hour |

When rate limited, the API returns a `429 Too Many Requests` response with a `Retry-After` header indicating when to retry. Rate limit headers are included on all responses:

- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Requests remaining in current window

## Self-Hosting

Want to run your own instance? See [SELF_HOSTING.md](./SELF_HOSTING.md).

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for version history, new features, and upgrade guides.

## License

MIT

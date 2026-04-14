# Widget Warm Neutral Restyle (test venue)

**Issue:** none — driven by marketplace screenshot polish
**Date:** 2026-04-14
**Target repo:** `mean-weasel/bugdrop-widget-test` (not bugdrop)

## Problem

The current marketplace product screenshots show the BugDrop widget on the WienerMatch
test venue with default styling. Two issues:

1. **The host page dominates the screenshots.** Viewers look at the WienerMatch hero
   ("Find Your Perfact Wiener Dog") instead of the widget. The screenshots should
   feature the widget as the focal point.
2. **The widget's default styling is unpolished.** The default `--bd-border` color
   `#e7e5e4` is so close to the default `--bd-bg-primary` `#fafaf9` that input borders
   are nearly invisible. Buttons feel cramped, the modal frame lacks shadow weight, and
   the overall composition reads as "engineering mockup" rather than "shipped product."

The marketplace listing depends on these screenshots looking professional. They should
sell BugDrop as a polished indie SaaS, not a side project.

## Constraints

- **No bugdrop source changes.** The widget already exposes a `data-*` customization
  API in `src/widget/index.ts`. Use it.
- **Test repo only.** The PR lands in `mean-weasel/bugdrop-widget-test`. The bugdrop
  repo's only artifact from this work is updated marketplace screenshots in the repo
  root.

## Approach

Configure additional `data-*` attributes on the existing `<script>` tag in
`bugdrop-widget-test/index.html` to apply a "warm neutral" color palette and tighter
border treatment. Then re-shoot the three product screenshots against a peach gradient
background with the WienerMatch DOM hidden, so the widget stands alone.

Validated visually via brainstorming session against three directions (warm neutral,
crisp white, dark slate). Warm neutral chosen because it harmonizes with the peach
screenshot background while staying distinct, and reads as a sophisticated indie SaaS.

## Token Map

Final values for the `<script>` tag in `bugdrop-widget-test/index.html`:

```html
<script
  src="__BUGDROP_URL__/widget.js"
  data-repo="mean-weasel/bugdrop-widget-test"
  data-button-dismissible="true"
  data-dismiss-duration="1"
  data-color="#f97316"
  data-bg="#fffcf8"
  data-text="#1c1410"
  data-border-color="#c9a679"
  data-border-width="2"
  data-radius="9"
  data-shadow="soft"
></script>
```

Diff vs. current attributes:

| Attribute | Current | New | Purpose |
|---|---|---|---|
| `data-color` | `#FF6B35` | `#f97316` | Tailwind orange-500, more saturated. Drives `--bd-primary` (button bg, focus ring) |
| `data-bg` | *(default `#fafaf9`)* | `#fffcf8` | Cream — slightly warmer than off-white, harmonizes with peach screenshot bg |
| `data-text` | *(default `#1c1917`)* | `#1c1410` | Deep coffee — slightly warmer than near-black |
| `data-border-color` | *(default `#e7e5e4`)* | `#c9a679` | Warm tan — visible against cream input bg, addresses the "distinct outline" requirement |
| `data-border-width` | *(default `1`)* | `2` | Doubles border weight so inputs read as definite shapes |
| `data-radius` | *(default `6`)* | `9` | Slightly rounder corners for warmth (widget derives md=13, lg=18 internally) |
| `data-shadow` | *(default none)* | `soft` | Adds the warm amber drop shadow under the modal |

Notes on derived values:

- `--bd-bg-secondary` and `--bd-bg-tertiary` auto-derive from `data-bg` via `color-mix`
  in `src/widget/ui.ts:993-1018`. Result is close enough to the mockup; not pixel-exact.
- `--bd-text-secondary` and `--bd-text-muted` auto-derive from `data-text` blended with
  `data-bg` via `color-mix` in `src/widget/ui.ts:1018-1031`. Same caveat.
- `--bd-border-focus` is not customizable — defaults to `#14b8a6` (teal). Will look
  slightly off against the warm palette but acceptable; future bugdrop enhancement
  could expose this.
- Font stays as Space Grotesk (the bugdrop default). `data-font` exists but only
  Space Grotesk is auto-imported from Google Fonts. Switching to Inter would require
  either host-side font loading or a bugdrop-side enhancement, both out of scope.

## Files Changed

In `mean-weasel/bugdrop-widget-test`:

- **Modify:** `index.html` — change the existing `data-color` value and add 6 new
  `data-*` attributes (`data-bg`, `data-text`, `data-border-color`, `data-border-width`,
  `data-radius`, `data-shadow`) to the `<script>` tag. No other lines change.
- **Modify:** `index.html` — update the BugDrop documentation comment block immediately
  above the `<script>` tag (which currently lists `data-show-name`, `data-theme`, etc.)
  to include the newly-used theming attributes so future maintainers see what's wired up.

In `mean-weasel/bugdrop` (this repo):

- **Replace:** `marketplace-01-welcome.png` — re-shot at 1440×900 with WienerMatch DOM
  hidden, peach gradient background, just the widget launcher visible
- **Replace:** `marketplace-02-form.png` — same backdrop, widget form open with sample
  bug content filled in
- **Replace:** `marketplace-03-annotate.png` — same backdrop, widget in annotation
  editor with a hand-drawn circle around an annotation target

These three files live at the bugdrop repo root and are not committed (they are
upload-only artifacts for the GitHub Marketplace listing).

## Screenshot Reshoot Procedure

Run after the PR's Vercel preview deploy is live (preferred — lets us reshoot before
merging, in case the styling needs another iteration). Production URL works too if we
prefer to reshoot post-merge.

1. Open the deploy URL in Playwright at viewport 1440×900. Use the PR's preview URL
   (e.g. `https://bugdrop-widget-test-git-feat-widget-warm-neutral-restyle-mean-weasel.vercel.app`)
   or `https://bugdrop-widget-test.vercel.app` for production.
2. Hide the WienerMatch DOM and apply the peach gradient via JS evaluation:
   ```js
   document.body.style.background = 'linear-gradient(135deg, #fff4ec 0%, #ffe6d3 50%, #ffd4b3 100%)';
   document.querySelectorAll('body > *').forEach(el => {
     if (el.id !== 'bugdrop-host' && el.tagName !== 'SCRIPT') el.style.display = 'none';
   });
   ```
3. Hide the BugDrop explainer card if it's still rendered:
   `document.querySelector('.bugdrop-explainer')?.style.setProperty('display', 'none');`
4. Take screenshot 1 (welcome — just the launcher pill in the corner against peach)
5. Trigger `BugDrop.open()`, fill title + description in the shadow DOM via the
   prototype-setter pattern from prior session, take screenshot 2 (form filled)
6. Click Continue → Full Page → wait for capture, click Draw tool, hand-draw an
   annotation in the Playwright Chromium window, take screenshot 3 (annotated)
7. Save all three over the existing files in the bugdrop repo root
8. Verify dimensions are 1440×900 and PNG

The lineWidth monkey-patch from prior session
(`CanvasRenderingContext2D.prototype.lineWidth` clamped to ≥16) is still required for
the Draw tool strokes to be visible at the canvas's high-DPR internal resolution.

## PR Plan

- **Repo:** `mean-weasel/bugdrop-widget-test`
- **Branch:** `feat/widget-warm-neutral-restyle`
- **Commit message:** `feat: restyle BugDrop widget with warm neutral palette`
- **Body:** brief explanation of the `data-color` value change, the 6 newly-added
  `data-*` theming attributes, and the marketplace screenshot motivation
- **Target:** `main`
- **Test plan in PR body:**
  - Vercel preview deploy URL loads the test venue
  - Visual check: input fields have visible tan borders
  - Visual check: focus state on inputs shows orange ring
  - Visual check: modal has soft warm drop shadow
  - Visual check: launcher pill orange matches the new accent color
  - No regressions in other widget functionality (open, fill, capture, annotate, submit)

The screenshot reshoot happens in a separate session against the deployed preview or
production URL after merge.

## Out of Scope

Explicitly not doing in this work:

- Adding new customization knobs to the bugdrop widget itself (font URL imports,
  separate text-secondary control, separate bg-secondary control, focus-ring color
  override). All would be reasonable future enhancements but extend scope beyond
  "test repo styling for marketplace screenshots."
- Restyling the launcher pill or the annotation toolbar beyond what `data-color`
  affects automatically.
- Changing the widget's behavior or copy.
- Updating the bugdrop README to document the previously-undocumented `data-bg`,
  `data-text`, `data-border-color`, `data-border-width`, `data-radius`, `data-shadow`,
  `data-font` attributes. These should be documented eventually but it's a separate
  task with its own scope (where in the README, what to say about derivations, etc.).

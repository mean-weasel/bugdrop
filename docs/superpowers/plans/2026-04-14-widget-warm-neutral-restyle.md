# Widget Warm Neutral Restyle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply a warm-neutral palette to the BugDrop widget on the `bugdrop-widget-test` venue via existing `data-*` attributes, then re-shoot the three marketplace product screenshots against a peach gradient background.

**Architecture:** Pure configuration change in `bugdrop-widget-test/index.html` — modify one existing `data-color` value and add 6 new `data-*` attributes (`data-bg`, `data-text`, `data-border-color`, `data-border-width`, `data-radius`, `data-shadow`). Zero bugdrop source changes. Screenshots are re-shot via Playwright MCP against the deployed preview URL with the WienerMatch DOM hidden and a peach gradient body background applied at runtime.

**Tech Stack:** HTML (data attributes), Vite (local dev), Vercel (preview deploys), Playwright MCP (screenshot reshoot), ImageMagick (optional — for verifying final dimensions)

**Spec:** `docs/superpowers/specs/2026-04-14-widget-warm-neutral-restyle-design.md`

**Target repo:** `mean-weasel/bugdrop-widget-test` (NOT bugdrop)

---

## File Structure

| File | Action | Change |
|---|---|---|
| `~/Desktop/bugdrop-widget-test/index.html` | Modify | Change `data-color` value + add 6 new `data-*` attributes to `<script>` tag; update the HTML comment block above the `<script>` to include new attribute docs |
| `~/Desktop/bugdrop/marketplace-01-welcome.png` | Replace | Re-shoot at 1440×900 with peach gradient + hidden host DOM |
| `~/Desktop/bugdrop/marketplace-02-form.png` | Replace | Re-shoot at 1440×900 with filled form state |
| `~/Desktop/bugdrop/marketplace-03-annotate.png` | Replace | Re-shoot at 1440×900 with annotation editor + drawn stroke |

No new files. No tests to write. Validation is visual (vite dev locally, Vercel preview, final screenshots).

---

### Task 1: Clone `bugdrop-widget-test` repo locally if absent

**Files:**
- Create: `~/Desktop/bugdrop-widget-test/` (clone destination)

- [ ] **Step 1: Check if the repo already exists locally**

Run:

```bash
ls ~/Desktop/bugdrop-widget-test/index.html 2>/dev/null && echo "EXISTS" || echo "MISSING"
```

If output is `EXISTS`, skip to Step 3. If `MISSING`, continue to Step 2.

- [ ] **Step 2: Clone the repo to `~/Desktop/bugdrop-widget-test`**

Run:

```bash
cd ~/Desktop && gh repo clone mean-weasel/bugdrop-widget-test
```

Expected output: `Cloning into 'bugdrop-widget-test'...` followed by progress lines.

- [ ] **Step 3: Verify the working tree is clean and on main**

Run:

```bash
git -C ~/Desktop/bugdrop-widget-test status -sb && git -C ~/Desktop/bugdrop-widget-test pull origin main
```

Expected: `## main...origin/main` with no modified files. Pull should say "Already up to date" or fast-forward cleanly.

If there are uncommitted changes or a different branch is checked out, stop and investigate — the user may have in-progress work.

---

### Task 2: Create the feature branch

**Files:**
- N/A (git branch only)

- [ ] **Step 1: Create and switch to feature branch**

Run:

```bash
git -C ~/Desktop/bugdrop-widget-test checkout -b feat/widget-warm-neutral-restyle
```

Expected output: `Switched to a new branch 'feat/widget-warm-neutral-restyle'`

- [ ] **Step 2: Verify branch is clean**

Run:

```bash
git -C ~/Desktop/bugdrop-widget-test status -sb
```

Expected: `## feat/widget-warm-neutral-restyle` with no modified files.

---

### Task 3: Update the `<script>` tag with new data-* attributes

**Files:**
- Modify: `~/Desktop/bugdrop-widget-test/index.html` (the `<script>` tag at the bottom of `<body>`)

- [ ] **Step 1: Read the current `<script>` tag to locate exact lines**

Run:

```bash
grep -n "script" ~/Desktop/bugdrop-widget-test/index.html
```

Expected output: two lines — the `<script type="module" src="/src/main.tsx">` line and the BugDrop widget `<script>` block with data-* attributes. Note the line numbers of the BugDrop `<script>` block.

- [ ] **Step 2: Replace the BugDrop `<script>` tag with the new version**

Use the `Edit` tool on `~/Desktop/bugdrop-widget-test/index.html`. Find and replace the existing BugDrop script tag:

`old_string`:
```html
    <script
      src="__BUGDROP_URL__/widget.js"
      data-repo="mean-weasel/bugdrop-widget-test"
      data-button-dismissible="true"
      data-dismiss-duration="1"
      data-color="#FF6B35"
    ></script>
```

`new_string`:
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

If the `old_string` doesn't match (e.g., the existing tag has different whitespace or other attrs), re-read the file first, copy the exact current text including leading whitespace, and retry.

- [ ] **Step 3: Verify the edit landed correctly**

Run:

```bash
grep -A 10 "__BUGDROP_URL__" ~/Desktop/bugdrop-widget-test/index.html
```

Expected output shows all 7 `data-*` attributes: `data-repo`, `data-button-dismissible`, `data-dismiss-duration`, `data-color="#f97316"`, `data-bg="#fffcf8"`, `data-text="#1c1410"`, `data-border-color="#c9a679"`, `data-border-width="2"`, `data-radius="9"`, `data-shadow="soft"`.

---

### Task 4: Update the HTML comment block above the `<script>` tag

**Files:**
- Modify: `~/Desktop/bugdrop-widget-test/index.html` (the HTML comment block immediately above the BugDrop `<script>` tag)

The comment block currently lists some optional `data-*` attributes (like `data-theme`, `data-position`) under "Optional (not enabled here - see docs for details)". We need to document the newly-used theming attributes so future maintainers know what's wired up.

- [ ] **Step 1: Read the current comment block**

Run:

```bash
grep -B 1 -A 30 "BugDrop Widget Configuration" ~/Desktop/bugdrop-widget-test/index.html
```

Expected output: the full HTML comment block listing the current optional attributes.

- [ ] **Step 2: Replace the comment block with updated docs**

Use the `Edit` tool on `~/Desktop/bugdrop-widget-test/index.html`. Find and replace the "Optional" section of the comment block:

`old_string`:
```html
      Optional (not enabled here - see docs for details):
        data-show-name: Show name field (default: false)
        data-require-name: Make name required (default: false)
        data-show-email: Show email field (default: false)
        data-require-email: Make email required (default: false)
        data-theme: light | dark | auto (default: auto)
        data-position: bottom-right | bottom-left (default: bottom-right)
        data-button-dismissible: Allow users to dismiss the button (default: false)
        data-button: Show/hide floating button (default: true, set false for API-only)
```

`new_string`:
```html
      Optional behavior (some enabled here - see docs for details):
        data-show-name: Show name field (default: false)
        data-require-name: Make name required (default: false)
        data-show-email: Show email field (default: false)
        data-require-email: Make email required (default: false)
        data-theme: light | dark | auto (default: auto)
        data-position: bottom-right | bottom-left (default: bottom-right)
        data-button-dismissible: Allow users to dismiss the button (default: false)
        data-button: Show/hide floating button (default: true, set false for API-only)

      Theming (enabled here — marketplace-screenshot polish, warm-neutral palette):
        data-color: Primary accent color (buttons, focus ring)
        data-bg: Modal background color
        data-text: Primary text color
        data-border-color: Input/button border color
        data-border-width: Input/button border width in pixels (integer)
        data-radius: Base border-radius in pixels; widget derives sm/md/lg internally
        data-shadow: Shadow preset — "none" | "soft" | "hard"
        data-font: Font family override (host must load the font; Space Grotesk default)
```

If the `old_string` doesn't match exactly (extra whitespace, different wording), re-read the comment block and retry with the actual text.

- [ ] **Step 3: Verify the comment block updated correctly**

Run:

```bash
grep -A 3 "warm-neutral palette" ~/Desktop/bugdrop-widget-test/index.html
```

Expected output: the "Theming" heading line and the first few `data-*` attributes listed.

---

### Task 5: Verify the styling change locally via vite dev

**Files:**
- N/A (local verification)

The test venue uses Vite for development. Running `npm run dev` starts a local server where the widget loads from the production BugDrop URL (because the script src is `__BUGDROP_URL__/widget.js` templated at build time — or similar). Check what mode local dev uses before relying on this step.

- [ ] **Step 1: Install dependencies if needed**

Run:

```bash
cd ~/Desktop/bugdrop-widget-test && [ -d node_modules ] || npm install
```

Expected: either nothing (if `node_modules` exists) or npm install output ending with "added N packages".

- [ ] **Step 2: Start vite dev server in background**

Run:

```bash
cd ~/Desktop/bugdrop-widget-test && npm run dev
```

This is a long-running command — use `run_in_background: true` in the Bash tool call.

Expected output (wait ~3 seconds then check): `VITE v... ready in ... ms` and `Local: http://localhost:5173/`.

- [ ] **Step 3: Open the local URL in Playwright and screenshot**

Use Playwright MCP tools to visit `http://localhost:5173` at viewport 1440×900, click the Feedback launcher button to open the widget, and take a screenshot.

Visual checks to perform on the screenshot:
- Modal background is cream (`#fffcf8`), not pure white
- Input fields have visible warm tan borders (~2px)
- Primary button (Continue) is saturated orange `#f97316`
- Modal has a soft warm drop shadow

If any check fails, the `data-*` attribute values didn't take effect. Revisit Task 3 and confirm the script tag matches exactly.

- [ ] **Step 4: Stop the dev server**

Kill the background vite process via the Bash tool's `KillShell` or equivalent.

- [ ] **Step 5: Note** — if local dev doesn't load the widget (because `__BUGDROP_URL__` isn't replaced in local builds), skip to committing and verify via the Vercel preview deploy in Task 7 instead. Record the skip reason in the PR body.

---

### Task 6: Commit the change

**Files:**
- N/A (git commit only)

- [ ] **Step 1: Stage the modified file**

Run:

```bash
git -C ~/Desktop/bugdrop-widget-test add index.html
```

- [ ] **Step 2: Verify only `index.html` is staged**

Run:

```bash
git -C ~/Desktop/bugdrop-widget-test status -sb
```

Expected: a single `M  index.html` line. If anything else is staged, reset it before committing (`git reset HEAD <file>`).

- [ ] **Step 3: Commit with conventional-commit message**

Run:

```bash
git -C ~/Desktop/bugdrop-widget-test commit -m "$(cat <<'EOF'
feat: restyle BugDrop widget with warm neutral palette

Tune the widget's data-* theming attributes to produce a cream modal
with warm tan borders, saturated orange accent, soft amber shadow,
and slightly rounder corners. Motivated by the BugDrop marketplace
listing — the product screenshots needed to feature the widget as
the focal point with polished styling rather than default near-white.

Attributes added:
- data-bg=#fffcf8 (cream modal)
- data-text=#1c1410 (warm near-black)
- data-border-color=#c9a679 (warm tan, visible against cream bg)
- data-border-width=2 (doubled from default 1)
- data-radius=9 (up from default 6)
- data-shadow=soft (warm drop shadow)

Attributes modified:
- data-color=#f97316 (Tailwind orange-500, matches launcher pill)

The comment block documenting attributes has been updated to list
the newly-enabled theming knobs.
EOF
)"
```

- [ ] **Step 4: Verify commit landed**

Run:

```bash
git -C ~/Desktop/bugdrop-widget-test log -1 --stat
```

Expected: commit SHA + message + `index.html | ... +/- lines changed`.

---

### Task 7: Push branch and open PR

**Files:**
- N/A (remote + PR creation)

- [ ] **Step 1: Push the branch upstream**

Run:

```bash
git -C ~/Desktop/bugdrop-widget-test push -u origin feat/widget-warm-neutral-restyle
```

Expected output includes: `* [new branch] feat/widget-warm-neutral-restyle -> feat/widget-warm-neutral-restyle` and `branch ... set up to track 'origin/...'`.

- [ ] **Step 2: Open a PR via gh CLI**

Run:

```bash
cd ~/Desktop/bugdrop-widget-test && gh pr create --title "feat: restyle BugDrop widget with warm neutral palette" --body "$(cat <<'EOF'
## Summary

Tunes the BugDrop widget's `data-*` theming attributes on the test venue to produce a polished warm-neutral palette. Motivated by the BugDrop marketplace listing — the product screenshots needed to show the widget as a shipped indie SaaS product, not an engineering mockup.

## Changes

Modified the existing `<script>` tag in `index.html`:
- `data-color`: `#FF6B35` → `#f97316` (Tailwind orange-500)
- **+** `data-bg="#fffcf8"` (cream modal background)
- **+** `data-text="#1c1410"` (warm near-black)
- **+** `data-border-color="#c9a679"` (warm tan, visible against cream bg)
- **+** `data-border-width="2"` (doubled from default 1)
- **+** `data-radius="9"` (up from default 6)
- **+** `data-shadow="soft"` (warm drop shadow)

Also updated the HTML comment block above the `<script>` tag to document the newly-enabled theming attributes for future maintainers.

Design spec: `mean-weasel/bugdrop/docs/superpowers/specs/2026-04-14-widget-warm-neutral-restyle-design.md`

## Test plan

- [ ] Vercel preview deploy URL loads the test venue
- [ ] Visual: input fields have visible tan borders (~2px)
- [ ] Visual: focus state on inputs shows an orange glow ring
- [ ] Visual: modal has a soft warm drop shadow
- [ ] Visual: Continue button is saturated orange, matches launcher pill
- [ ] No regressions: widget opens, form submits, screenshot capture works, annotation editor works
EOF
)"
```

Expected output: `https://github.com/mean-weasel/bugdrop-widget-test/pull/<N>`.

- [ ] **Step 3: Record the PR URL**

Save the returned URL — it will be needed for the preview-deploy verification in Task 8.

---

### Task 8: Verify the Vercel preview deploy

**Files:**
- N/A (visual verification)

- [ ] **Step 1: Get the preview deploy URL**

Wait 30–60 seconds after pushing for Vercel to build, then run:

```bash
gh pr view <PR_NUMBER> --repo mean-weasel/bugdrop-widget-test --json statusCheckRollup --jq '.statusCheckRollup[] | select(.name | contains("Vercel")) | "\(.name): \(.detailsUrl)"'
```

Alternatively, navigate to the PR on GitHub and click the Vercel bot's preview link in the comments.

Expected: a URL in the form `https://bugdrop-widget-test-git-feat-widget-warm-neutral-restyle-mean-weasel.vercel.app` or similar.

- [ ] **Step 2: Open the preview URL in Playwright**

Use Playwright MCP to navigate to the preview URL at viewport 1440×900, click the Feedback launcher, and take a screenshot.

- [ ] **Step 3: Visual verification checklist**

Confirm the same four checks from Task 5:
- [ ] Cream modal background (`#fffcf8`, not pure white)
- [ ] Visible warm tan borders on inputs (~2px thick)
- [ ] Orange accent matches `#f97316` on the Continue button and launcher pill
- [ ] Soft warm drop shadow under the modal

If any check fails, the build didn't pick up the new attributes — investigate before proceeding.

---

### Task 9: Reshoot the three marketplace screenshots

**Files:**
- Replace: `~/Desktop/bugdrop/marketplace-01-welcome.png` (1440×900 PNG)
- Replace: `~/Desktop/bugdrop/marketplace-02-form.png` (1440×900 PNG)
- Replace: `~/Desktop/bugdrop/marketplace-03-annotate.png` (1440×900 PNG)

Run this task against the preview URL from Task 8 OR the production URL after merge — either works. Preview is preferred since it lets us iterate before merge if something looks off.

- [ ] **Step 1: Navigate to the target URL in Playwright at 1440×900**

```javascript
// via Playwright MCP
await browser_resize({ width: 1440, height: 900 });
await browser_navigate({ url: '<preview or production URL>' });
```

- [ ] **Step 2: Apply the peach gradient and hide the WienerMatch DOM**

Run this via `browser_evaluate`:

```javascript
() => {
  document.body.style.background = 'linear-gradient(135deg, #fff4ec 0%, #ffe6d3 50%, #ffd4b3 100%)';
  document.querySelectorAll('body > *').forEach(el => {
    if (el.id !== 'bugdrop-host' && el.tagName !== 'SCRIPT') el.style.display = 'none';
  });
  const explainer = document.querySelector('.bugdrop-explainer');
  if (explainer) explainer.style.display = 'none';
  return { hidden: true };
}
```

Expected: the page becomes a blank peach gradient with only the Feedback launcher pill floating in the bottom-right corner.

- [ ] **Step 3: Screenshot 1 — welcome**

```javascript
await browser_take_screenshot({
  type: 'png',
  filename: 'marketplace-01-welcome.png'
});
```

Verify file lands in the bugdrop repo root:

```bash
file ~/Desktop/bugdrop/marketplace-01-welcome.png
```

Expected: `PNG image data, 1440 x 900, 8-bit/color RGBA ...` (or RGB — either is fine).

- [ ] **Step 4: Apply the `lineWidth` monkey-patch** (needed for visible Draw-tool strokes later):

Run via `browser_evaluate`:

```javascript
() => {
  const proto = CanvasRenderingContext2D.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, 'lineWidth');
  const origSet = desc.set;
  Object.defineProperty(proto, 'lineWidth', {
    get: desc.get,
    set: function(v) { origSet.call(this, Math.max(v, 16)); },
    configurable: true
  });
  return { patched: true };
}
```

- [ ] **Step 5: Open the widget and fill the form**

Run via `browser_evaluate`:

```javascript
() => {
  window.BugDrop.open();
  setTimeout(() => {
    const root = document.getElementById('bugdrop-host').shadowRoot;
    const setNative = (el, v) => {
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', {bubbles: true}));
    };
    setNative(root.querySelector('input[type="text"]'), 'Match results page crashes on filter reset');
    setNative(root.querySelector('textarea'), 'Steps to reproduce:\n1. Open match results\n2. Apply two breed filters\n3. Click "Reset filters"\n\nExpected: filters clear and results refresh.\nActual: page goes blank, console shows TypeError.');
  }, 100);
  return { opened: true };
}
```

Wait ~500ms for the DOM to render, then proceed.

- [ ] **Step 6: Screenshot 2 — filled form**

```javascript
await browser_take_screenshot({
  type: 'png',
  filename: 'marketplace-02-form.png'
});
```

Verify dimensions:

```bash
file ~/Desktop/bugdrop/marketplace-02-form.png
```

Expected: `PNG image data, 1440 x 900`.

- [ ] **Step 7: Advance to the annotation editor**

Run via `browser_evaluate`:

```javascript
() => {
  const root = document.getElementById('bugdrop-host').shadowRoot;
  Array.from(root.querySelectorAll('button')).find(b => /continue/i.test(b.textContent))?.click();
  setTimeout(() => {
    const root2 = document.getElementById('bugdrop-host').shadowRoot;
    Array.from(root2.querySelectorAll('button')).find(b => /full page/i.test(b.textContent))?.click();
  }, 200);
  return { advancing: true };
}
```

Wait ~4 seconds for the full-page capture to complete and the annotation editor to appear.

- [ ] **Step 8: Pre-select the Draw tool**

Run via `browser_evaluate`:

```javascript
() => {
  const root = document.getElementById('bugdrop-host').shadowRoot;
  Array.from(root.querySelectorAll('button')).find(b => /draw/i.test(b.textContent))?.click();
  return { drawSelected: true };
}
```

- [ ] **Step 9: Hand over to user for manual draw**

Tell the user: "Annotation editor is ready with Draw tool selected and the lineWidth patch active. Switch to the Playwright Chromium window and draw something on the captured page (circle a button, scribble an X, whatever feels natural). Reply 'done' when finished and I'll take the final screenshot."

Wait for user confirmation before Step 10.

- [ ] **Step 10: Screenshot 3 — annotation with stroke**

```javascript
await browser_take_screenshot({
  type: 'png',
  filename: 'marketplace-03-annotate.png'
});
```

Verify dimensions:

```bash
file ~/Desktop/bugdrop/marketplace-03-annotate.png
```

Expected: `PNG image data, 1440 x 900`.

- [ ] **Step 11: Verify all three new screenshots exist with correct dimensions**

Run:

```bash
ls -lh ~/Desktop/bugdrop/marketplace-0*.png && file ~/Desktop/bugdrop/marketplace-0*.png
```

Expected: three files, all at `1440 x 900`, timestamps within the last few minutes.

---

### Task 10: Merge the PR and move to marketplace upload

**Files:**
- N/A

- [ ] **Step 1: Request a self-review of the PR in the GitHub UI**

Navigate to the PR URL from Task 7 and look at the diff one more time. Ensure:
- Only `index.html` changed
- The diff shows exactly the attribute changes from the spec
- The comment block update is present

- [ ] **Step 2: Wait for CI and Vercel preview to pass**

Run:

```bash
gh pr checks <PR_NUMBER> --repo mean-weasel/bugdrop-widget-test
```

Expected: all checks green. If a check fails, investigate before merging.

- [ ] **Step 3: Merge the PR**

Run:

```bash
gh pr merge <PR_NUMBER> --repo mean-weasel/bugdrop-widget-test --squash --delete-branch
```

Expected output: `Merged pull request #<N>` and `Deleted branch feat/widget-warm-neutral-restyle`.

- [ ] **Step 4: Note for the user**

Remind the user: "The restyle is live on `bugdrop-widget-test.vercel.app`. Three new 1440×900 screenshots are in the bugdrop repo root, ready to upload to the marketplace listing at `https://github.com/marketplace/bugdrop-in-app-feedback-to-github-issues/edit`. The old screenshots will be replaced automatically when the marketplace form picker accepts the new files."

---

## Self-Review

**Spec coverage** (walking through the spec sections):

- **Problem** → Task 3 (attribute change) addresses unpolished styling; Task 9 addresses host page dominating screenshots. ✓
- **Constraints: no bugdrop source changes** → Plan only touches `bugdrop-widget-test/index.html`. ✓
- **Constraints: test repo only** → Only the test repo gets a PR (Task 7). Bugdrop artifacts (screenshots) are not committed. ✓
- **Approach: configure data-* attributes** → Task 3. ✓
- **Approach: re-shoot against peach gradient, hide host DOM** → Task 9. ✓
- **Token Map** → Task 3 Step 2 includes the exact values from the spec. ✓
- **Notes on derived values** → Not actionable as tasks; informational only. ✓
- **Files Changed** → Task 3 (script tag) + Task 4 (comment block) cover the test repo changes; Task 9 covers the bugdrop screenshot replacements. ✓
- **Screenshot Reshoot Procedure** → Task 9 Steps 1–11 follow the spec procedure including the lineWidth monkey-patch. ✓
- **PR Plan** → Task 7 uses the branch name, commit prefix, target, and test plan from the spec. ✓
- **Out of Scope** → Plan does not add new bugdrop customization knobs, does not restyle launcher/toolbar, does not update bugdrop README. ✓

**Placeholder scan:** Searched for TBD/TODO/"add error handling"/"similar to Task N" — none found. All code blocks are complete.

**Type consistency:** No types/signatures to cross-check (pure HTML config change). Command names and file paths are consistent across tasks.

No gaps. Plan is complete.

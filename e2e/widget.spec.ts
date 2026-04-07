import { test, expect, type Page } from '@playwright/test';

/**
 * E2E tests for BugDrop
 * Tests run against wrangler dev server at http://localhost:8787
 */

test.describe('Widget Loading', () => {
  test('page loads without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && !msg.text().includes('BugDrop')) {
        errors.push(msg.text());
      }
    });

    await page.goto('/test/');
    await page.locator('#bugdrop-host').locator('css=.bd-trigger').waitFor();

    // Filter out expected widget errors (missing repo in some test scenarios)
    const unexpectedErrors = errors.filter(e => !e.includes('Missing data-repo'));
    expect(unexpectedErrors).toHaveLength(0);
  });

  test('widget host element exists', async ({ page }) => {
    await page.goto('/test/');
    await page.locator('#bugdrop-host').locator('css=.bd-trigger').waitFor();

    // Widget creates a host element
    const host = page.locator('#bugdrop-host');
    await expect(host).toBeAttached();
  });

  test('feedback button is visible in shadow DOM', async ({ page }) => {
    await page.goto('/test/');
    await page.locator('#bugdrop-host').locator('css=.bd-trigger').waitFor();

    // Access button inside shadow DOM
    const button = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(button).toBeVisible();
  });
});

test.describe('Widget Interaction', () => {
  test('clicking feedback button triggers modal', async ({ page }) => {
    await page.goto('/test/');

    // Wait for widget to be ready
    const button = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(button).toBeVisible({ timeout: 5000 });

    // Click the trigger button
    await button.click();

    // Modal should appear (or installation prompt if not installed)
    const modal = page.locator('#bugdrop-host').locator('css=.bd-modal');
    await expect(modal).toBeVisible({ timeout: 5000 });
  });

  test('element picker handles SVG elements without errors', async ({ page }) => {
    // Track console errors - specifically looking for className.split errors
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    page.on('pageerror', err => {
      errors.push(err.message);
    });

    // Mock the installation check to return installed: true
    await page.route('**/api/check/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ installed: true }),
      });
    });

    await page.goto('/test/');

    // Wait for widget to be ready
    const button = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(button).toBeVisible({ timeout: 5000 });

    // Click the trigger button to open modal
    await button.click();

    const modal = page.locator('#bugdrop-host').locator('css=.bd-modal');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // New flow: Click "Get Started" on welcome screen
    const getStartedBtn = page.locator('#bugdrop-host').locator('css=[data-action="continue"]');
    await expect(getStartedBtn).toBeVisible({ timeout: 5000 });
    await getStartedBtn.click();

    // Fill in the feedback form and check "Include screenshot"
    const titleInput = page.locator('#bugdrop-host').locator('css=#title');
    await expect(titleInput).toBeVisible({ timeout: 5000 });
    await titleInput.fill('Test feedback for SVG');

    const screenshotCheckbox = page.locator('#bugdrop-host').locator('css=#include-screenshot');
    await screenshotCheckbox.check();

    // Click Continue to proceed to screenshot options
    const continueBtn = page.locator('#bugdrop-host').locator('css=#submit-btn');
    await continueBtn.click();

    // Click "Select Element" option
    const selectElementBtn = page.locator('#bugdrop-host').locator('css=[data-action="element"]');
    await expect(selectElementBtn).toBeVisible({ timeout: 5000 });
    await selectElementBtn.click();

    // Wait for element picker mode to be active
    await page.waitForTimeout(300);

    // Click on the SVG element - this previously caused className.split error
    const svgElement = page.locator('#test-svg');
    await expect(svgElement).toBeVisible();
    await svgElement.click();

    // Check for the className.split error that was previously occurring
    const classNameErrors = errors.filter(
      e => e.includes('className.split') || e.includes('split is not a function')
    );

    expect(classNameErrors).toHaveLength(0);

    // Annotation canvas should appear (indicating flow continued successfully to annotation step)
    const annotationCanvas = page.locator('#bugdrop-host').locator('css=#annotation-canvas');
    await expect(annotationCanvas).toBeVisible({ timeout: 5000 });
  });

  test('element picker handles nested SVG child elements without errors', async ({ page }) => {
    // Track console errors - the fix must handle nested SVG elements too
    // since getElementSelector walks up the DOM tree
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    page.on('pageerror', err => {
      errors.push(err.message);
    });

    // Mock the installation check to return installed: true
    await page.route('**/api/check/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ installed: true }),
      });
    });

    await page.goto('/test/');

    // Wait for widget to be ready
    const button = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(button).toBeVisible({ timeout: 5000 });

    // Click the trigger button to open modal
    await button.click();

    const modal = page.locator('#bugdrop-host').locator('css=.bd-modal');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // New flow: Click "Get Started" on welcome screen
    const getStartedBtn = page.locator('#bugdrop-host').locator('css=[data-action="continue"]');
    await expect(getStartedBtn).toBeVisible({ timeout: 5000 });
    await getStartedBtn.click();

    // Fill in the feedback form and check "Include screenshot"
    const titleInput = page.locator('#bugdrop-host').locator('css=#title');
    await expect(titleInput).toBeVisible({ timeout: 5000 });
    await titleInput.fill('Test feedback for nested SVG');

    const screenshotCheckbox = page.locator('#bugdrop-host').locator('css=#include-screenshot');
    await screenshotCheckbox.check();

    // Click Continue to proceed to screenshot options
    const continueBtn = page.locator('#bugdrop-host').locator('css=#submit-btn');
    await continueBtn.click();

    // Click "Select Element" option
    const selectElementBtn = page.locator('#bugdrop-host').locator('css=[data-action="element"]');
    await expect(selectElementBtn).toBeVisible({ timeout: 5000 });
    await selectElementBtn.click();

    // Wait for element picker mode to be active
    await page.waitForTimeout(300);

    // Click on nested SVG child element (text inside SVG)
    // This tests that getElementSelector handles SVG elements when walking up the tree
    const svgText = page.locator('#test-svg text');
    await expect(svgText).toBeVisible();
    await svgText.click();

    // Check for the className.split error
    const classNameErrors = errors.filter(
      e => e.includes('className.split') || e.includes('split is not a function')
    );

    expect(classNameErrors).toHaveLength(0);

    // Annotation canvas should appear
    const annotationCanvas = page.locator('#bugdrop-host').locator('css=#annotation-canvas');
    await expect(annotationCanvas).toBeVisible({ timeout: 5000 });
  });

  test('welcome screen only shows once per repo (default behavior)', async ({ page }) => {
    await page.route('**/api/check/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ installed: true }),
      });
    });

    await page.goto('/test/');

    // Clear welcome-seen state for this repo
    await page.evaluate(() =>
      localStorage.removeItem('bugdrop_welcomed_neonwatty/feedback-widget-test')
    );
    await page.reload();

    const button = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(button).toBeVisible({ timeout: 5000 });

    // First open: welcome should appear
    await button.click();
    const getStartedBtn = page.locator('#bugdrop-host').locator('css=[data-action="continue"]');
    await expect(getStartedBtn).toBeVisible({ timeout: 5000 });
    await getStartedBtn.click();

    // Form should appear
    const titleInput = page.locator('#bugdrop-host').locator('css=#title');
    await expect(titleInput).toBeVisible({ timeout: 5000 });

    // Close the modal
    const cancelBtn = page.locator('#bugdrop-host').locator('css=[data-action="cancel"]');
    await cancelBtn.click();
    const overlay = page.locator('#bugdrop-host').locator('css=.bd-overlay');
    await expect(overlay).not.toBeVisible({ timeout: 5000 });

    // Second open: welcome should be skipped, form appears directly
    await button.click();
    await expect(titleInput).toBeVisible({ timeout: 5000 });

    // Verify "Get Started" button is NOT present (welcome was skipped)
    await expect(getStartedBtn).not.toBeVisible();
  });

  test('data-welcome="false" skips welcome entirely', async ({ page }) => {
    await page.route('**/api/check/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ installed: true }),
      });
    });

    await page.goto('/test/welcome-disabled.html');

    const button = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(button).toBeVisible({ timeout: 5000 });

    await button.click();

    // Form should appear directly, no welcome screen
    const titleInput = page.locator('#bugdrop-host').locator('css=#title');
    await expect(titleInput).toBeVisible({ timeout: 5000 });

    // Welcome "Get Started" button should NOT be present
    const getStartedBtn = page.locator('#bugdrop-host').locator('css=[data-action="continue"]');
    await expect(getStartedBtn).not.toBeVisible();
  });

  test('data-welcome="always" shows welcome every time', async ({ page }) => {
    await page.route('**/api/check/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ installed: true }),
      });
    });

    await page.goto('/test/welcome-always.html');

    const button = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(button).toBeVisible({ timeout: 5000 });

    // First open: welcome should appear
    await button.click();
    const getStartedBtn = page.locator('#bugdrop-host').locator('css=[data-action="continue"]');
    await expect(getStartedBtn).toBeVisible({ timeout: 5000 });
    await getStartedBtn.click();

    // Form should appear
    const titleInput = page.locator('#bugdrop-host').locator('css=#title');
    await expect(titleInput).toBeVisible({ timeout: 5000 });

    // Close the modal and wait for it to disappear
    const cancelBtn = page.locator('#bugdrop-host').locator('css=[data-action="cancel"]');
    await cancelBtn.click();
    const overlay = page.locator('#bugdrop-host').locator('css=.bd-overlay');
    await expect(overlay).not.toBeVisible({ timeout: 5000 });

    // Second open: welcome should appear AGAIN (always mode)
    await button.click();
    await expect(getStartedBtn).toBeVisible({ timeout: 5000 });
  });

  test('BugDrop.open() skips welcome screen', async ({ page }) => {
    await page.route('**/api/check/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ installed: true }),
      });
    });

    await page.goto('/test/');

    // Wait for BugDrop API to be available, then open programmatically
    await page.waitForFunction(() => typeof (window as any).BugDrop !== 'undefined', {
      timeout: 5000,
    });
    await page.evaluate(() => {
      (window as any).BugDrop?.open();
    });

    // Form should appear directly (no welcome screen)
    const titleInput = page.locator('#bugdrop-host').locator('css=#title');
    await expect(titleInput).toBeVisible({ timeout: 5000 });

    // Welcome "Get Started" button should NOT be present
    const getStartedBtn = page.locator('#bugdrop-host').locator('css=[data-action="continue"]');
    await expect(getStartedBtn).not.toBeVisible();
  });

  test('screenshot checkbox is checked by default', async ({ page }) => {
    await page.route('**/api/check/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ installed: true }),
      });
    });

    await page.goto('/test/');

    const button = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(button).toBeVisible({ timeout: 5000 });
    await button.click();

    // Click through welcome
    const getStartedBtn = page.locator('#bugdrop-host').locator('css=[data-action="continue"]');
    await expect(getStartedBtn).toBeVisible({ timeout: 5000 });
    await getStartedBtn.click();

    // Verify screenshot checkbox is checked by default
    const screenshotCheckbox = page.locator('#bugdrop-host').locator('css=#include-screenshot');
    await expect(screenshotCheckbox).toBeChecked();
  });

  test('version number appears on welcome screen but not on form', async ({ page }) => {
    await page.route('**/api/check/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ installed: true }),
      });
    });

    await page.goto('/test/');

    const host = page.locator('#bugdrop-host');
    const button = host.locator('css=.bd-trigger');
    await expect(button).toBeVisible({ timeout: 5000 });
    await button.click();

    // Version should appear on the welcome screen
    const versionEl = host.locator('css=.bd-version');
    await expect(versionEl).toBeVisible({ timeout: 5000 });
    const versionText = await versionEl.textContent();
    expect(versionText).toMatch(/^BugDrop v/);

    // Advance to feedback form
    const getStartedBtn = host.locator('css=[data-action="continue"]');
    await getStartedBtn.click();

    // Version should NOT appear on the form screen
    const titleInput = host.locator('css=#title');
    await expect(titleInput).toBeVisible({ timeout: 5000 });
    await expect(versionEl).not.toBeVisible();
  });

  test('select area button appears and launches area picker overlay', async ({ page }) => {
    await page.route('**/api/check/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ installed: true }),
      });
    });

    await page.goto('/test/');

    const host = page.locator('#bugdrop-host');
    const button = host.locator('css=.bd-trigger');
    await expect(button).toBeVisible({ timeout: 5000 });
    await button.click();

    // Click through welcome screen
    const getStartedBtn = host.locator('css=[data-action="continue"]');
    await expect(getStartedBtn).toBeVisible({ timeout: 5000 });
    await getStartedBtn.click();

    // Fill required title field and ensure screenshot checkbox is checked
    const titleInput = host.locator('css=#title');
    await expect(titleInput).toBeVisible({ timeout: 5000 });
    await titleInput.fill('Test bug report');

    const screenshotCheckbox = host.locator('css=#include-screenshot');
    await screenshotCheckbox.check();

    const submitBtn = host.locator('css=#submit-btn');
    await submitBtn.click();

    // Verify "Select Area" button appears in screenshot options
    const areaBtn = host.locator('css=[data-action="area"]');
    await expect(areaBtn).toBeVisible({ timeout: 5000 });

    // Click Select Area
    await areaBtn.click();

    // Area picker overlay should appear on the page (outside shadow DOM)
    const overlay = page.locator('#bugdrop-area-picker-overlay');
    await expect(overlay).toBeVisible({ timeout: 5000 });

    // Tooltip should be visible
    const tooltip = page.locator('#bugdrop-area-picker-tooltip');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText('Drag to select an area');

    // Press ESC to cancel
    await page.keyboard.press('Escape');

    // Overlay should be removed
    await expect(overlay).not.toBeVisible({ timeout: 3000 });
  });
});

test.describe('API Endpoints', () => {
  test('health endpoint returns ok', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.status).toBe('ok');
    expect(data.environment).toBeDefined();
    expect(data.timestamp).toBeDefined();
  });

  test('health endpoint has CORS headers', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.headers()['access-control-allow-origin']).toBe('*');
  });

  test('feedback endpoint validates required fields', async ({ request }) => {
    // Missing repo
    const res1 = await request.post('/api/feedback', {
      data: { title: 'Test', description: 'Test' },
    });
    expect(res1.status()).toBe(400);

    // Missing title
    const res2 = await request.post('/api/feedback', {
      data: { repo: 'owner/repo', description: 'Test' },
    });
    expect(res2.status()).toBe(400);

    // Missing description (optional — should not return 400)
    const res3 = await request.post('/api/feedback', {
      data: { repo: 'owner/repo', title: 'Test' },
    });
    expect(res3.status()).not.toBe(400);
  });

  test('feedback endpoint rejects invalid repo format', async ({ request }) => {
    const response = await request.post('/api/feedback', {
      data: {
        repo: 'invalid-format',
        title: 'Test',
        description: 'Test',
        metadata: {
          url: 'http://test.com',
          userAgent: 'test',
          viewport: { width: 1920, height: 1080 },
          timestamp: new Date().toISOString(),
        },
      },
    });
    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Invalid repo format');
  });
});

test.describe('Dismissible Button', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage before each test
    await page.goto('/test/dismissible.html');
    await page.evaluate(() => localStorage.removeItem('bugdrop_dismissed'));
  });

  test('close icon appears on hover when dismissible is enabled', async ({ page }) => {
    await page.goto('/test/dismissible.html');

    const trigger = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(trigger).toBeVisible({ timeout: 5000 });

    // Close button should exist but be hidden initially
    const closeBtn = page.locator('#bugdrop-host').locator('css=.bd-trigger-close');
    await expect(closeBtn).toBeAttached();

    // Check that close button has opacity 0 initially (hidden)
    const initialOpacity = await closeBtn.evaluate(el => getComputedStyle(el).opacity);
    expect(parseFloat(initialOpacity)).toBeLessThan(0.5);

    // Hover over the trigger button
    await trigger.hover();

    // Wait for transition and check opacity is now 1 (visible)
    await expect(closeBtn).toHaveCSS('opacity', '1', { timeout: 2000 });
    const hoverOpacity = await closeBtn.evaluate(el => getComputedStyle(el).opacity);
    expect(parseFloat(hoverOpacity)).toBeGreaterThan(0.5);
  });

  test('clicking close icon hides the button', async ({ page }) => {
    await page.goto('/test/dismissible.html');

    const trigger = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(trigger).toBeVisible({ timeout: 5000 });

    // Hover to reveal close button
    await trigger.hover();
    const closeBtn = page.locator('#bugdrop-host').locator('css=.bd-trigger-close');
    await expect(closeBtn).toHaveCSS('opacity', '1', { timeout: 2000 });

    // Click the close button
    await closeBtn.click();

    // Trigger should no longer exist
    await expect(trigger).not.toBeAttached();
  });

  test('clicking close icon does not open feedback modal', async ({ page }) => {
    await page.goto('/test/dismissible.html');

    const trigger = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(trigger).toBeVisible({ timeout: 5000 });

    // Hover to reveal close button
    await trigger.hover();
    const closeBtn = page.locator('#bugdrop-host').locator('css=.bd-trigger-close');
    await expect(closeBtn).toHaveCSS('opacity', '1', { timeout: 2000 });

    // Click the close button
    await closeBtn.click();

    // Modal should not appear
    const modal = page.locator('#bugdrop-host').locator('css=.bd-modal');
    await expect(modal).not.toBeVisible();
  });

  test('button stays hidden after page reload (localStorage persistence)', async ({ page }) => {
    await page.goto('/test/dismissible.html');

    const trigger = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(trigger).toBeVisible({ timeout: 5000 });

    // Hover and click close button
    await trigger.hover();
    const closeBtn = page.locator('#bugdrop-host').locator('css=.bd-trigger-close');
    await expect(closeBtn).toHaveCSS('opacity', '1', { timeout: 2000 });
    await closeBtn.click();

    // Verify button is gone
    await expect(trigger).not.toBeAttached();

    // Reload the page
    await page.reload();
    await page.locator('#bugdrop-host').waitFor({ state: 'attached' });

    // Button should still be hidden
    const triggerAfterReload = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(triggerAfterReload).not.toBeAttached();
  });

  test('button appears normally when dismissible is not enabled', async ({ page }) => {
    // Use the regular test page (no dismissible attribute)
    await page.goto('/test/');

    const trigger = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(trigger).toBeVisible({ timeout: 5000 });

    // Close button should NOT exist
    const closeBtn = page.locator('#bugdrop-host').locator('css=.bd-trigger-close');
    await expect(closeBtn).not.toBeAttached();
  });

  test('localStorage dismissed state is ignored when dismissible is false', async ({ page }) => {
    // Set localStorage as if button was dismissed
    await page.goto('/test/');
    await page.evaluate(() => localStorage.setItem('bugdrop_dismissed', 'true'));

    // Reload page (regular test page without dismissible)
    await page.reload();
    await page.locator('#bugdrop-host').locator('css=.bd-trigger').waitFor();

    // Button should still be visible because dismissible is not enabled
    const trigger = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(trigger).toBeVisible({ timeout: 5000 });
  });

  // === Edge Case Tests ===

  test('dismissible button works in light theme', async ({ page }) => {
    await page.goto('/test/dismissible-light.html');
    await page.evaluate(() => localStorage.removeItem('bugdrop_dismissed'));
    await page.reload();

    const trigger = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(trigger).toBeVisible({ timeout: 5000 });

    // Close button should exist
    const closeBtn = page.locator('#bugdrop-host').locator('css=.bd-trigger-close');
    await expect(closeBtn).toBeAttached();

    // Hover to reveal close button
    await trigger.hover();
    await expect(closeBtn).toHaveCSS('opacity', '1', { timeout: 2000 });

    // Verify close button is visible
    const hoverOpacity = await closeBtn.evaluate(el => getComputedStyle(el).opacity);
    expect(parseFloat(hoverOpacity)).toBeGreaterThan(0.5);

    // Click close and verify dismiss works
    await closeBtn.click();
    await expect(trigger).not.toBeAttached();

    // Verify persistence
    await page.reload();
    await page.locator('#bugdrop-host').waitFor({ state: 'attached' });
    await expect(page.locator('#bugdrop-host').locator('css=.bd-trigger')).not.toBeAttached();
  });

  test('dismissible button works with bottom-left position', async ({ page }) => {
    await page.goto('/test/dismissible-left.html');
    await page.evaluate(() => localStorage.removeItem('bugdrop_dismissed'));
    await page.reload();

    const trigger = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(trigger).toBeVisible({ timeout: 5000 });

    // Verify button is on the left side
    const buttonBox = await trigger.boundingBox();
    expect(buttonBox).not.toBeNull();
    if (buttonBox) {
      // Button should be closer to left edge than right edge
      const viewportWidth = await page.evaluate(() => window.innerWidth);
      expect(buttonBox.x).toBeLessThan(viewportWidth / 2);
    }

    // Close button should exist and work
    const closeBtn = page.locator('#bugdrop-host').locator('css=.bd-trigger-close');
    await expect(closeBtn).toBeAttached();

    // Hover and dismiss
    await trigger.hover();
    await expect(closeBtn).toHaveCSS('opacity', '1', { timeout: 2000 });
    await closeBtn.click();
    await expect(trigger).not.toBeAttached();
  });

  test('close icon is always visible on touch devices', async ({ browser }) => {
    // Create a context with touch device emulation
    const context = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      viewport: { width: 390, height: 844 }, // iPhone 14 Pro dimensions
    });
    const page = await context.newPage();

    await page.goto('/test/dismissible.html');
    await page.evaluate(() => localStorage.removeItem('bugdrop_dismissed'));
    await page.reload();

    const trigger = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(trigger).toBeVisible({ timeout: 5000 });

    const closeBtn = page.locator('#bugdrop-host').locator('css=.bd-trigger-close');
    await expect(closeBtn).toBeAttached();

    // On touch devices, close button should be visible without hover
    // due to @media (hover: none) CSS rule
    const opacity = await closeBtn.evaluate(el => getComputedStyle(el).opacity);
    expect(parseFloat(opacity)).toBe(1);

    // Tap to dismiss should work
    await closeBtn.tap();
    await expect(trigger).not.toBeAttached();

    await context.close();
  });

  test('keyboard accessibility - dismiss with Enter key', async ({ page }) => {
    await page.goto('/test/dismissible.html');
    await page.evaluate(() => localStorage.removeItem('bugdrop_dismissed'));
    await page.reload();

    const trigger = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(trigger).toBeVisible({ timeout: 5000 });

    // Hover to reveal close button
    await trigger.hover();
    const closeBtn = page.locator('#bugdrop-host').locator('css=.bd-trigger-close');
    await expect(closeBtn).toHaveCSS('opacity', '1', { timeout: 2000 });

    // Focus the close button and press Enter
    await closeBtn.focus();
    await page.keyboard.press('Enter');

    // Button should be dismissed
    await expect(trigger).not.toBeAttached();
  });

  test('keyboard accessibility - dismiss with Space key', async ({ page }) => {
    await page.goto('/test/dismissible.html');
    await page.evaluate(() => localStorage.removeItem('bugdrop_dismissed'));
    await page.reload();

    const trigger = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(trigger).toBeVisible({ timeout: 5000 });

    // Hover to reveal close button
    await trigger.hover();
    const closeBtn = page.locator('#bugdrop-host').locator('css=.bd-trigger-close');
    await expect(closeBtn).toHaveCSS('opacity', '1', { timeout: 2000 });

    // Focus the close button and press Space
    await closeBtn.focus();
    await page.keyboard.press('Space');

    // Button should be dismissed
    await expect(trigger).not.toBeAttached();
  });

  test('close icon changes to red/error color on direct hover', async ({ page }) => {
    await page.goto('/test/dismissible.html');
    await page.evaluate(() => localStorage.removeItem('bugdrop_dismissed'));
    await page.reload();

    const trigger = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(trigger).toBeVisible({ timeout: 5000 });

    const closeBtn = page.locator('#bugdrop-host').locator('css=.bd-trigger-close');

    // Hover over trigger first to reveal close button
    await trigger.hover();
    await expect(closeBtn).toHaveCSS('opacity', '1', { timeout: 2000 });

    // Get initial background color
    const initialBg = await closeBtn.evaluate(el => getComputedStyle(el).backgroundColor);

    // Now hover directly on close button
    await closeBtn.hover();
    await page.waitForTimeout(100);

    // Get hovered background color
    const hoveredBg = await closeBtn.evaluate(el => getComputedStyle(el).backgroundColor);

    // Colors should be different (close button turns red on hover)
    expect(hoveredBg).not.toBe(initialBg);

    // Verify it's a reddish color (error color)
    // Parse RGB and check red channel is dominant
    const rgbMatch = hoveredBg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (rgbMatch) {
      const [, r, g, b] = rgbMatch.map(Number);
      expect(r).toBeGreaterThan(200); // High red
      expect(r).toBeGreaterThan(g); // Red > Green
      expect(r).toBeGreaterThan(b); // Red > Blue
    }
  });

  test('localStorage key is set correctly on dismiss (timestamp format)', async ({ page }) => {
    await page.goto('/test/dismissible.html');
    await page.evaluate(() => localStorage.removeItem('bugdrop_dismissed'));
    await page.reload();

    const trigger = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(trigger).toBeVisible({ timeout: 5000 });

    // Verify localStorage is empty before dismiss
    const beforeDismiss = await page.evaluate(() => localStorage.getItem('bugdrop_dismissed'));
    expect(beforeDismiss).toBeNull();

    // Dismiss the button
    await trigger.hover();
    const closeBtn = page.locator('#bugdrop-host').locator('css=.bd-trigger-close');
    await expect(closeBtn).toHaveCSS('opacity', '1', { timeout: 2000 });
    await closeBtn.click();

    // Verify localStorage key is set to a timestamp (number)
    const afterDismiss = await page.evaluate(() => localStorage.getItem('bugdrop_dismissed'));
    expect(afterDismiss).not.toBeNull();
    const timestamp = parseInt(afterDismiss!, 10);
    expect(isNaN(timestamp)).toBe(false);
    // Timestamp should be recent (within last minute)
    expect(Date.now() - timestamp).toBeLessThan(60000);

    // Verify only our key was set (no other bugdrop keys)
    const allKeys = await page.evaluate(() =>
      Object.keys(localStorage).filter(k => k.includes('bugdrop'))
    );
    expect(allKeys).toEqual(['bugdrop_dismissed']);
  });

  test('legacy "true" localStorage value still works (permanent dismiss)', async ({ page }) => {
    await page.goto('/test/dismissible.html');
    // Set legacy 'true' value
    await page.evaluate(() => localStorage.setItem('bugdrop_dismissed', 'true'));
    await page.reload();
    await page.locator('#bugdrop-host').waitFor({ state: 'attached' });

    // Button should be hidden
    const trigger = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(trigger).not.toBeAttached();
  });

  test('BugDrop.show() brings back dismissed button', async ({ page }) => {
    await page.goto('/test/dismissible.html');
    await page.evaluate(() => localStorage.removeItem('bugdrop_dismissed'));
    await page.reload();

    const trigger = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(trigger).toBeVisible({ timeout: 5000 });

    // Dismiss the button
    await trigger.hover();
    const closeBtn = page.locator('#bugdrop-host').locator('css=.bd-trigger-close');
    await expect(closeBtn).toHaveCSS('opacity', '1', { timeout: 2000 });
    await closeBtn.click();

    // Verify button is gone
    await expect(trigger).not.toBeAttached();

    // Verify localStorage is set
    const dismissed = await page.evaluate(() => localStorage.getItem('bugdrop_dismissed'));
    expect(dismissed).not.toBeNull();

    // Call BugDrop.show() to bring button back
    await page.evaluate(() => window.BugDrop?.show());
    await page.locator('#bugdrop-host').locator('css=.bd-trigger').waitFor();

    // Button should be visible again
    const triggerAfterShow = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(triggerAfterShow).toBeVisible();

    // localStorage should be cleared
    const dismissedAfterShow = await page.evaluate(() => localStorage.getItem('bugdrop_dismissed'));
    expect(dismissedAfterShow).toBeNull();
  });

  test('BugDrop.show() works even after page reload when dismissed', async ({ page }) => {
    await page.goto('/test/dismissible.html');
    await page.evaluate(() => localStorage.removeItem('bugdrop_dismissed'));
    await page.reload();

    const trigger = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(trigger).toBeVisible({ timeout: 5000 });

    // Dismiss the button
    await trigger.hover();
    const closeBtn = page.locator('#bugdrop-host').locator('css=.bd-trigger-close');
    await expect(closeBtn).toHaveCSS('opacity', '1', { timeout: 2000 });
    await closeBtn.click();
    await expect(trigger).not.toBeAttached();

    // Reload the page - button should still be hidden
    await page.reload();
    await page.locator('#bugdrop-host').waitFor({ state: 'attached' });
    const triggerAfterReload = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(triggerAfterReload).not.toBeAttached();

    // Call BugDrop.show() to bring button back
    await page.evaluate(() => window.BugDrop?.show());
    await page.locator('#bugdrop-host').locator('css=.bd-trigger').waitFor();

    // Button should be visible
    const triggerAfterShow = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(triggerAfterShow).toBeVisible();
  });

  test('clearing localStorage restores the button', async ({ page }) => {
    await page.goto('/test/dismissible.html');

    // First dismiss the button
    await page.evaluate(() => localStorage.removeItem('bugdrop_dismissed'));
    await page.reload();

    const trigger = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(trigger).toBeVisible({ timeout: 5000 });

    await trigger.hover();
    const closeBtn = page.locator('#bugdrop-host').locator('css=.bd-trigger-close');
    await expect(closeBtn).toHaveCSS('opacity', '1', { timeout: 2000 });
    await closeBtn.click();
    await expect(trigger).not.toBeAttached();

    // Now clear localStorage and reload
    await page.evaluate(() => localStorage.removeItem('bugdrop_dismissed'));
    await page.reload();
    await page.locator('#bugdrop-host').locator('css=.bd-trigger').waitFor();

    // Button should be visible again
    const triggerRestored = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(triggerRestored).toBeVisible({ timeout: 5000 });
  });

  test('widget handles localStorage errors gracefully', async ({ page }) => {
    // Track console errors
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    page.on('pageerror', err => {
      errors.push(err.message);
    });

    await page.goto('/test/dismissible.html');
    await page.evaluate(() => localStorage.removeItem('bugdrop_dismissed'));

    // Override localStorage to throw errors
    await page.evaluate(() => {
      const originalSetItem = localStorage.setItem.bind(localStorage);
      const _originalGetItem = localStorage.getItem.bind(localStorage);

      Object.defineProperty(window, 'localStorage', {
        value: {
          getItem: () => {
            throw new Error('localStorage blocked');
          },
          setItem: () => {
            throw new Error('localStorage blocked');
          },
          removeItem: originalSetItem,
          clear: () => {},
          key: () => null,
          length: 0,
        },
        writable: true,
      });
    });

    // Reload with broken localStorage
    await page.reload();
    await page.locator('#bugdrop-host').locator('css=.bd-trigger').waitFor();

    // Widget should still load (graceful degradation)
    const trigger = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(trigger).toBeVisible({ timeout: 5000 });

    // Dismiss should still work visually (even if not persisted)
    await trigger.hover();
    const closeBtn = page.locator('#bugdrop-host').locator('css=.bd-trigger-close');
    await expect(closeBtn).toHaveCSS('opacity', '1', { timeout: 2000 });
    await closeBtn.click();

    // Button should be hidden
    await expect(trigger).not.toBeAttached();

    // No uncaught errors related to localStorage
    const localStorageErrors = errors.filter(e => e.includes('localStorage'));
    expect(localStorageErrors).toHaveLength(0);
  });

  test('rapid double-click on close button does not cause errors', async ({ page }) => {
    // Track console errors
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    page.on('pageerror', err => {
      errors.push(err.message);
    });

    await page.goto('/test/dismissible.html');
    await page.evaluate(() => localStorage.removeItem('bugdrop_dismissed'));
    await page.reload();

    const trigger = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(trigger).toBeVisible({ timeout: 5000 });

    // Hover to reveal close button
    await trigger.hover();
    const closeBtn = page.locator('#bugdrop-host').locator('css=.bd-trigger-close');
    await expect(closeBtn).toHaveCSS('opacity', '1', { timeout: 2000 });

    // Click the close button
    await closeBtn.click();

    // Button should be removed (pull tab should appear instead)
    await expect(trigger).not.toBeAttached();

    // Pull tab should be visible
    const pullTab = page.locator('#bugdrop-host').locator('css=.bd-pull-tab');
    await expect(pullTab).toBeAttached();

    // No errors should occur
    expect(errors).toHaveLength(0);
  });
});

test.describe('Dismiss Duration', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage before each test
    await page.goto('/test/dismissible-duration.html');
    await page.evaluate(() => localStorage.removeItem('bugdrop_dismissed'));
  });

  test('button reappears when dismiss duration has passed', async ({ page }) => {
    await page.goto('/test/dismissible-duration.html');

    // Set an old timestamp (8 days ago, duration is 7 days)
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    await page.evaluate(
      ts => localStorage.setItem('bugdrop_dismissed', ts.toString()),
      eightDaysAgo
    );

    // Reload the page
    await page.reload();
    await page.locator('#bugdrop-host').locator('css=.bd-trigger').waitFor();

    // Button should be visible again (8 days > 7 day duration)
    const trigger = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(trigger).toBeVisible({ timeout: 5000 });
  });

  test('button stays hidden when dismiss duration has not passed', async ({ page }) => {
    await page.goto('/test/dismissible-duration.html');

    // Set a recent timestamp (3 days ago, duration is 7 days)
    const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
    await page.evaluate(
      ts => localStorage.setItem('bugdrop_dismissed', ts.toString()),
      threeDaysAgo
    );

    // Reload the page
    await page.reload();
    await page.locator('#bugdrop-host').waitFor({ state: 'attached' });

    // Button should still be hidden (3 days < 7 day duration)
    const trigger = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(trigger).not.toBeAttached();
  });

  test('button hidden immediately after dismissing', async ({ page }) => {
    await page.goto('/test/dismissible-duration.html');
    await page.evaluate(() => localStorage.removeItem('bugdrop_dismissed'));
    await page.reload();

    const trigger = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(trigger).toBeVisible({ timeout: 5000 });

    // Dismiss the button
    await trigger.hover();
    const closeBtn = page.locator('#bugdrop-host').locator('css=.bd-trigger-close');
    await expect(closeBtn).toHaveCSS('opacity', '1', { timeout: 2000 });
    await closeBtn.click();

    // Button should be hidden
    await expect(trigger).not.toBeAttached();

    // Reload and verify still hidden
    await page.reload();
    await page.locator('#bugdrop-host').waitFor({ state: 'attached' });
    const triggerAfterReload = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(triggerAfterReload).not.toBeAttached();
  });

  test('dismiss duration is ignored when button is not dismissible', async ({ page }) => {
    // Use regular test page (no dismissible flag)
    await page.goto('/test/');

    // Set an old timestamp
    const oldTimestamp = Date.now() - 100 * 24 * 60 * 60 * 1000;
    await page.evaluate(
      ts => localStorage.setItem('bugdrop_dismissed', ts.toString()),
      oldTimestamp
    );
    await page.reload();
    await page.locator('#bugdrop-host').locator('css=.bd-trigger').waitFor();

    // Button should be visible because dismissible is not enabled
    const trigger = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(trigger).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Keyboard Event Isolation', () => {
  test('typing in widget inputs does not leak keystrokes to host page', async ({ page }) => {
    // Mock the installation check so the feedback form loads
    await page.route('**/api/check/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ installed: true }),
      });
    });

    await page.goto('/test/keyboard-conflict.html');
    await page.locator('#bugdrop-host').locator('css=.bd-trigger').waitFor();

    // Track host-page keydown events that fire while BugDrop is open
    await page.evaluate(() => {
      (window as any).__hostKeystrokeCount = 0;
      document.addEventListener('keydown', () => {
        if (document.getElementById('bugdrop-host')) {
          (window as any).__hostKeystrokeCount++;
        }
      });
    });

    // Open the widget
    const button = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(button).toBeVisible({ timeout: 5000 });
    await button.click();

    const modal = page.locator('#bugdrop-host').locator('css=.bd-modal');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Skip welcome screen if present
    const getStartedBtn = page.locator('#bugdrop-host').locator('css=[data-action="continue"]');
    if (await getStartedBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await getStartedBtn.click();
    }

    // Type into the title INPUT using real keyboard events
    const titleInput = page.locator('#bugdrop-host').locator('css=#title');
    await expect(titleInput).toBeVisible({ timeout: 5000 });
    await titleInput.click();
    await page.keyboard.type('Test keystroke isolation');

    // Type into the description TEXTAREA
    const descInput = page.locator('#bugdrop-host').locator('css=#description');
    await expect(descInput).toBeVisible({ timeout: 5000 });
    await descInput.click();
    await page.keyboard.type('Also testing textarea');

    // Verify text was actually entered (stopPropagation must not swallow input events)
    await expect(titleInput).toHaveValue('Test keystroke isolation');
    await expect(descInput).toHaveValue('Also testing textarea');

    // Host page should NOT have received any keystrokes
    const leakedCount = await page.evaluate(() => (window as any).__hostKeystrokeCount);
    expect(leakedCount).toBe(0);
  });
});

test.describe('Install URL from appName', () => {
  test('uses server-provided appName in install link', async ({ page }) => {
    // Mock /check to return installed: false with a custom appName
    await page.route('**/api/check/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ installed: false, appName: 'my-custom-app' }),
      });
    });

    await page.goto('/test/keyboard-conflict.html');
    await page.locator('#bugdrop-host').locator('css=.bd-trigger').waitFor();

    // Open the widget
    const button = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(button).toBeVisible({ timeout: 5000 });
    await button.click();

    const modal = page.locator('#bugdrop-host').locator('css=.bd-modal');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // The install prompt should contain a link using the server-provided appName
    const installLink = page.locator('#bugdrop-host').locator('css=a.bd-btn-primary');
    await expect(installLink).toBeVisible({ timeout: 5000 });
    await expect(installLink).toHaveAttribute(
      'href',
      'https://github.com/apps/my-custom-app/installations/new'
    );
  });

  test('falls back to URL-derived appName when server omits it', async ({ page }) => {
    // Mock /check to return installed: false without appName
    await page.route('**/api/check/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ installed: false }),
      });
    });

    await page.goto('/test/keyboard-conflict.html');
    await page.locator('#bugdrop-host').locator('css=.bd-trigger').waitFor();

    const button = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(button).toBeVisible({ timeout: 5000 });
    await button.click();

    const modal = page.locator('#bugdrop-host').locator('css=.bd-modal');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Should still show an install link using the fallback-derived name
    const installLink = page.locator('#bugdrop-host').locator('css=a.bd-btn-primary');
    await expect(installLink).toBeVisible({ timeout: 5000 });
    const href = await installLink.getAttribute('href');
    expect(href).toMatch(/^https:\/\/github\.com\/apps\/.+\/installations\/new$/);
    // Should NOT contain the custom app name (proving fallback was used)
    expect(href).not.toContain('my-custom-app');
  });
});

test.describe('Widget Build', () => {
  test('widget.js is accessible', async ({ request }) => {
    const response = await request.get('/widget.js');
    expect(response.ok()).toBeTruthy();

    const content = await response.text();
    expect(content).toContain('use strict');
  });

  test('widget.js is an IIFE bundle', async ({ request }) => {
    const response = await request.get('/widget.js');
    const content = await response.text();

    // IIFE pattern starts with (()=>{ or similar
    expect(content).toMatch(/^\s*["']use strict["'];?\s*\(\s*\(\s*\)\s*=>\s*\{/);
  });

  test('versioned widget files are accessible', async ({ request }) => {
    // Read versions.json to get the actual versioned filenames
    const versionsResp = await request.get('/versions.json');
    expect(versionsResp.ok()).toBeTruthy();

    const manifest = await versionsResp.json();
    const versionedFiles = Object.values(manifest.versions) as string[];

    for (const filename of versionedFiles) {
      const response = await request.get(`/${filename}`);
      expect(response.ok(), `${filename} should be accessible`).toBeTruthy();
    }
  });

  test('versioned widget files contain identical content to widget.js', async ({ request }) => {
    const baseResp = await request.get('/widget.js');
    const baseContent = await baseResp.text();

    const versionsResp = await request.get('/versions.json');
    const manifest = await versionsResp.json();
    const versionedFiles = Object.values(manifest.versions) as string[];

    for (const filename of versionedFiles) {
      const response = await request.get(`/${filename}`);
      const content = await response.text();
      expect(content, `${filename} should match widget.js`).toBe(baseContent);
    }
  });
});

test.describe('JavaScript API', () => {
  test('window.BugDrop exists after widget loads', async ({ page }) => {
    await page.goto('/test/');
    await page.locator('#bugdrop-host').locator('css=.bd-trigger').waitFor();

    const hasBugDrop = await page.evaluate(() => {
      return typeof window.BugDrop === 'object' && window.BugDrop !== null;
    });
    expect(hasBugDrop).toBeTruthy();
  });

  test('BugDrop API has all expected methods', async ({ page }) => {
    await page.goto('/test/');
    await page.locator('#bugdrop-host').locator('css=.bd-trigger').waitFor();

    const apiMethods = await page.evaluate(() => {
      if (!window.BugDrop) return [];
      return Object.keys(window.BugDrop);
    });

    expect(apiMethods).toContain('open');
    expect(apiMethods).toContain('close');
    expect(apiMethods).toContain('hide');
    expect(apiMethods).toContain('show');
    expect(apiMethods).toContain('isOpen');
    expect(apiMethods).toContain('isButtonVisible');
  });

  test('bugdrop:ready event fires after initialization', async ({ page }) => {
    // Use the api-only test page which sets up a listener for the event
    await page.goto('/test/api-only.html');

    // Wait for the status to update (indicating bugdrop:ready was received)
    await page.waitForFunction(
      () => {
        const status = document.getElementById('status');
        return status?.textContent?.includes('BugDrop ready');
      },
      { timeout: 5000 }
    );

    // Verify the event was received
    const statusText = await page.locator('#status').textContent();
    expect(statusText).toContain('BugDrop ready');
  });

  test('BugDrop.open() opens the modal', async ({ page }) => {
    await page.goto('/test/');
    await page.locator('#bugdrop-host').locator('css=.bd-trigger').waitFor();

    // Modal should not be visible initially
    const modalBefore = page.locator('#bugdrop-host').locator('css=.bd-modal');
    await expect(modalBefore).not.toBeVisible();

    // Call open API
    await page.evaluate(() => window.BugDrop?.open());
    await page.locator('#bugdrop-host').locator('css=.bd-modal').waitFor();

    // Modal should now be visible
    const modalAfter = page.locator('#bugdrop-host').locator('css=.bd-modal');
    await expect(modalAfter).toBeVisible();
  });

  test('BugDrop.close() closes the modal', async ({ page }) => {
    await page.goto('/test/');
    await page.locator('#bugdrop-host').locator('css=.bd-trigger').waitFor();

    // Open modal first
    await page.evaluate(() => window.BugDrop?.open());
    await page.locator('#bugdrop-host').locator('css=.bd-modal').waitFor();

    const modal = page.locator('#bugdrop-host').locator('css=.bd-modal');
    await expect(modal).toBeVisible();

    // Close via API
    await page.evaluate(() => window.BugDrop?.close());
    await expect(page.locator('#bugdrop-host').locator('css=.bd-modal')).not.toBeVisible();

    // Modal should be gone
    await expect(modal).not.toBeVisible();
  });

  test('BugDrop.isOpen() returns correct state', async ({ page }) => {
    await page.goto('/test/');
    await page.locator('#bugdrop-host').locator('css=.bd-trigger').waitFor();

    // Should be false initially
    const isOpenBefore = await page.evaluate(() => window.BugDrop?.isOpen());
    expect(isOpenBefore).toBeFalsy();

    // Open modal
    await page.evaluate(() => window.BugDrop?.open());
    await page.locator('#bugdrop-host').locator('css=.bd-modal').waitFor();

    // Should be true now
    const isOpenAfter = await page.evaluate(() => window.BugDrop?.isOpen());
    expect(isOpenAfter).toBeTruthy();

    // Close modal
    await page.evaluate(() => window.BugDrop?.close());
    await expect(page.locator('#bugdrop-host').locator('css=.bd-modal')).not.toBeVisible();

    // Should be false again
    const isOpenFinal = await page.evaluate(() => window.BugDrop?.isOpen());
    expect(isOpenFinal).toBeFalsy();
  });

  test('BugDrop.hide() hides the floating button', async ({ page }) => {
    await page.goto('/test/');
    await page.locator('#bugdrop-host').locator('css=.bd-trigger').waitFor();

    const trigger = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(trigger).toBeVisible();

    // Hide button
    await page.evaluate(() => window.BugDrop?.hide());

    // Button should be hidden
    await expect(trigger).not.toBeVisible();
  });

  test('BugDrop.show() shows the hidden button', async ({ page }) => {
    await page.goto('/test/');
    await page.locator('#bugdrop-host').locator('css=.bd-trigger').waitFor();

    const trigger = page.locator('#bugdrop-host').locator('css=.bd-trigger');

    // Hide then show
    await page.evaluate(() => window.BugDrop?.hide());
    await expect(trigger).not.toBeVisible();

    await page.evaluate(() => window.BugDrop?.show());
    await expect(trigger).toBeVisible();
  });

  test('BugDrop.isButtonVisible() returns correct state', async ({ page }) => {
    await page.goto('/test/');
    await page.locator('#bugdrop-host').locator('css=.bd-trigger').waitFor();

    // Should be true initially
    const isVisibleBefore = await page.evaluate(() => window.BugDrop?.isButtonVisible());
    expect(isVisibleBefore).toBeTruthy();

    // Hide button
    await page.evaluate(() => window.BugDrop?.hide());

    // Should be false now
    const isVisibleAfter = await page.evaluate(() => window.BugDrop?.isButtonVisible());
    expect(isVisibleAfter).toBeFalsy();

    // Show button
    await page.evaluate(() => window.BugDrop?.show());

    // Should be true again
    const isVisibleFinal = await page.evaluate(() => window.BugDrop?.isButtonVisible());
    expect(isVisibleFinal).toBeTruthy();
  });
});

test.describe('Custom Accent Color', () => {
  test('default color is teal when data-color is not set', async ({ page }) => {
    await page.goto('/test/color-default.html');
    await page.locator('#bugdrop-host').locator('css=.bd-trigger').waitFor();

    const trigger = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(trigger).toBeVisible({ timeout: 5000 });

    // Get the background color of the button
    const bgColor = await trigger.evaluate(el => getComputedStyle(el).backgroundColor);

    // Default dark theme color is #22d3ee (rgb(34, 211, 238))
    // Parse RGB values
    const rgbMatch = bgColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    expect(rgbMatch).not.toBeNull();

    if (rgbMatch) {
      const [, r, g, b] = rgbMatch.map(Number);
      // Teal/cyan has high green and blue, low red
      expect(r).toBeLessThan(100); // Low red
      expect(g).toBeGreaterThan(150); // High green
      expect(b).toBeGreaterThan(200); // High blue
    }
  });

  test('custom color is applied when data-color is set', async ({ page }) => {
    await page.goto('/test/color-custom.html');
    await page.locator('#bugdrop-host').locator('css=.bd-trigger').waitFor();

    const trigger = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(trigger).toBeVisible({ timeout: 5000 });

    // Get the background color of the button
    const bgColor = await trigger.evaluate(el => getComputedStyle(el).backgroundColor);

    // Custom color is #9333EA (purple) = rgb(147, 51, 234)
    const rgbMatch = bgColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    expect(rgbMatch).not.toBeNull();

    if (rgbMatch) {
      const [, r, g, b] = rgbMatch.map(Number);
      // Purple has medium red, low green, high blue
      expect(r).toBeGreaterThan(100); // Medium-high red
      expect(g).toBeLessThan(100); // Low green
      expect(b).toBeGreaterThan(200); // High blue
    }
  });

  test('custom color applies to focus ring on form inputs', async ({ page }) => {
    // Mock the installation check to return installed: true
    await page.route('**/api/check/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ installed: true }),
      });
    });

    await page.goto('/test/color-custom.html');

    const trigger = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(trigger).toBeVisible({ timeout: 5000 });

    // Open modal
    await trigger.click();

    const modal = page.locator('#bugdrop-host').locator('css=.bd-modal');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Click "Get Started" on welcome screen
    const getStartedBtn = page.locator('#bugdrop-host').locator('css=[data-action="continue"]');
    await expect(getStartedBtn).toBeVisible({ timeout: 5000 });
    await getStartedBtn.click();

    // Focus on title input
    const titleInput = page.locator('#bugdrop-host').locator('css=#title');
    await expect(titleInput).toBeVisible({ timeout: 5000 });
    await titleInput.focus();

    // Check that the --bd-border-focus CSS variable is set to the custom color
    const root = page.locator('#bugdrop-host').locator('css=.bd-root');
    const borderFocusColor = await root.evaluate(el =>
      getComputedStyle(el).getPropertyValue('--bd-border-focus').trim()
    );

    // Should be the custom purple color
    expect(borderFocusColor).toBe('#9333EA');
  });

  test('custom color persists after modal interactions', async ({ page }) => {
    await page.goto('/test/color-custom.html');

    const trigger = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(trigger).toBeVisible({ timeout: 5000 });

    // Open and close modal
    await trigger.click();
    const modal = page.locator('#bugdrop-host').locator('css=.bd-modal');
    await expect(modal).toBeVisible({ timeout: 5000 });

    const closeBtn = page.locator('#bugdrop-host').locator('css=.bd-close');
    await closeBtn.click();
    await expect(modal).not.toBeVisible();

    // Button should still have custom color
    const bgColor = await trigger.evaluate(el => getComputedStyle(el).backgroundColor);
    const rgbMatch = bgColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    expect(rgbMatch).not.toBeNull();

    if (rgbMatch) {
      const [, r, g, b] = rgbMatch.map(Number);
      // Still purple
      expect(r).toBeGreaterThan(100);
      expect(g).toBeLessThan(100);
      expect(b).toBeGreaterThan(200);
    }
  });
});

test.describe('Pull Tab Restore', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/test/dismissible.html');
    await page.evaluate(() => localStorage.removeItem('bugdrop_dismissed'));
  });

  test('pull tab appears after dismissing the button', async ({ page }) => {
    await page.goto('/test/dismissible.html');

    const trigger = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(trigger).toBeVisible({ timeout: 5000 });

    // Pull tab should not exist initially
    const pullTab = page.locator('#bugdrop-host').locator('css=.bd-pull-tab');
    await expect(pullTab).not.toBeAttached();

    // Dismiss the button
    await trigger.hover();
    const closeBtn = page.locator('#bugdrop-host').locator('css=.bd-trigger-close');
    await expect(closeBtn).toHaveCSS('opacity', '1', { timeout: 2000 });
    await closeBtn.click();

    // Pull tab should now be visible
    await expect(pullTab).toBeVisible({ timeout: 2000 });
  });

  test('clicking pull tab restores the feedback button', async ({ page }) => {
    await page.goto('/test/dismissible.html');

    const trigger = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(trigger).toBeVisible({ timeout: 5000 });

    // Dismiss the button
    await trigger.hover();
    const closeBtn = page.locator('#bugdrop-host').locator('css=.bd-trigger-close');
    await expect(closeBtn).toHaveCSS('opacity', '1', { timeout: 2000 });
    await closeBtn.click();

    // Click the pull tab
    const pullTab = page.locator('#bugdrop-host').locator('css=.bd-pull-tab');
    await expect(pullTab).toBeVisible({ timeout: 2000 });
    await pullTab.click();

    // Button should be visible again
    const triggerAfterRestore = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(triggerAfterRestore).toBeVisible({ timeout: 2000 });

    // Pull tab should be gone
    await expect(pullTab).not.toBeAttached();
  });

  test('pull tab restore clears localStorage dismissed state', async ({ page }) => {
    await page.goto('/test/dismissible.html');

    const trigger = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(trigger).toBeVisible({ timeout: 5000 });

    // Dismiss the button
    await trigger.hover();
    const closeBtn = page.locator('#bugdrop-host').locator('css=.bd-trigger-close');
    await expect(closeBtn).toHaveCSS('opacity', '1', { timeout: 2000 });
    await closeBtn.click();
    await expect(trigger).not.toBeAttached({ timeout: 2000 });

    // Verify localStorage is set
    const dismissedBefore = await page.evaluate(() => localStorage.getItem('bugdrop_dismissed'));
    expect(dismissedBefore).not.toBeNull();

    // Click the pull tab
    const pullTab = page.locator('#bugdrop-host').locator('css=.bd-pull-tab');
    await expect(pullTab).toBeVisible({ timeout: 2000 });
    await pullTab.click();
    await page.locator('#bugdrop-host').locator('css=.bd-trigger').waitFor();

    // localStorage should be cleared
    const dismissedAfter = await page.evaluate(() => localStorage.getItem('bugdrop_dismissed'));
    expect(dismissedAfter).toBeNull();
  });

  test('restored button is fully functional', async ({ page }) => {
    await page.goto('/test/dismissible.html');

    const trigger = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(trigger).toBeVisible({ timeout: 5000 });

    // Dismiss and restore
    await trigger.hover();
    const closeBtn = page.locator('#bugdrop-host').locator('css=.bd-trigger-close');
    await expect(closeBtn).toHaveCSS('opacity', '1', { timeout: 2000 });
    await closeBtn.click();
    await expect(trigger).not.toBeAttached({ timeout: 2000 });

    const pullTab = page.locator('#bugdrop-host').locator('css=.bd-pull-tab');
    await expect(pullTab).toBeVisible({ timeout: 2000 });
    await pullTab.click();
    await page.locator('#bugdrop-host').locator('css=.bd-trigger').waitFor();

    // Click the restored button to open modal
    const restoredTrigger = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await restoredTrigger.click();

    // Modal should open
    const modal = page.locator('#bugdrop-host').locator('css=.bd-modal');
    await expect(modal).toBeVisible({ timeout: 5000 });
  });

  test('restored button can be dismissed again', async ({ page }) => {
    await page.goto('/test/dismissible.html');

    const trigger = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(trigger).toBeVisible({ timeout: 5000 });

    // First dismiss
    await trigger.hover();
    let closeBtn = page.locator('#bugdrop-host').locator('css=.bd-trigger-close');
    await expect(closeBtn).toHaveCSS('opacity', '1', { timeout: 2000 });
    await closeBtn.click();
    await expect(trigger).not.toBeAttached({ timeout: 2000 });

    // Restore via pull tab
    const pullTab = page.locator('#bugdrop-host').locator('css=.bd-pull-tab');
    await expect(pullTab).toBeVisible({ timeout: 2000 });
    await pullTab.click();
    await page.locator('#bugdrop-host').locator('css=.bd-trigger').waitFor();

    // Second dismiss
    const restoredTrigger = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await restoredTrigger.hover();
    closeBtn = page.locator('#bugdrop-host').locator('css=.bd-trigger-close');
    await expect(closeBtn).toHaveCSS('opacity', '1', { timeout: 2000 });
    await closeBtn.click();

    // Button should be gone, pull tab should reappear
    await expect(restoredTrigger).not.toBeAttached({ timeout: 5000 });
    const pullTabAgain = page.locator('#bugdrop-host').locator('css=.bd-pull-tab');
    await expect(pullTabAgain).toBeVisible({ timeout: 2000 });
  });

  test('pull tab is keyboard accessible', async ({ page }) => {
    await page.goto('/test/dismissible.html');

    const trigger = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(trigger).toBeVisible({ timeout: 5000 });

    // Dismiss the button
    await trigger.hover();
    const closeBtn = page.locator('#bugdrop-host').locator('css=.bd-trigger-close');
    await expect(closeBtn).toHaveCSS('opacity', '1', { timeout: 2000 });
    await closeBtn.click();
    await expect(trigger).not.toBeAttached({ timeout: 2000 });

    // Focus the pull tab and press Enter
    const pullTab = page.locator('#bugdrop-host').locator('css=.bd-pull-tab');
    await expect(pullTab).toBeVisible({ timeout: 2000 });
    await pullTab.focus();
    await page.keyboard.press('Enter');

    // Button should be restored
    const restoredTrigger = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(restoredTrigger).toBeVisible({ timeout: 2000 });
  });

  test('pull tab persists after page reload', async ({ page }) => {
    await page.goto('/test/dismissible.html');

    const trigger = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(trigger).toBeVisible({ timeout: 5000 });

    // Dismiss the button
    await trigger.hover();
    const closeBtn = page.locator('#bugdrop-host').locator('css=.bd-trigger-close');
    await expect(closeBtn).toHaveCSS('opacity', '1', { timeout: 2000 });
    await closeBtn.click();
    await expect(trigger).not.toBeAttached({ timeout: 2000 });

    // Reload page
    await page.reload();
    await page.locator('#bugdrop-host').waitFor({ state: 'attached' });

    // Button should still be hidden
    const triggerAfterReload = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(triggerAfterReload).not.toBeAttached();

    // Pull tab should be visible
    const pullTab = page.locator('#bugdrop-host').locator('css=.bd-pull-tab');
    await expect(pullTab).toBeVisible();
  });
});

test.describe('API-Only Mode (data-button="false")', () => {
  test('floating button is not rendered when data-button="false"', async ({ page }) => {
    await page.goto('/test/api-only.html');
    await page.locator('#bugdrop-host').waitFor({ state: 'attached' });

    // Button should not exist
    const trigger = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(trigger).not.toBeAttached();
  });

  test('BugDrop API is still available in API-only mode', async ({ page }) => {
    await page.goto('/test/api-only.html');
    await page.locator('#bugdrop-host').waitFor({ state: 'attached' });

    const hasBugDrop = await page.evaluate(() => {
      return typeof window.BugDrop === 'object' && window.BugDrop !== null;
    });
    expect(hasBugDrop).toBeTruthy();
  });

  test('BugDrop.open() works in API-only mode', async ({ page }) => {
    await page.goto('/test/api-only.html');
    await page.locator('#bugdrop-host').waitFor({ state: 'attached' });

    // Open modal via API
    await page.evaluate(() => window.BugDrop?.open());
    await page.locator('#bugdrop-host').locator('css=.bd-modal').waitFor();

    // Modal should be visible
    const modal = page.locator('#bugdrop-host').locator('css=.bd-modal');
    await expect(modal).toBeVisible();
  });

  test('BugDrop.isButtonVisible() returns false in API-only mode', async ({ page }) => {
    await page.goto('/test/api-only.html');
    await page.locator('#bugdrop-host').waitFor({ state: 'attached' });

    const isVisible = await page.evaluate(() => window.BugDrop?.isButtonVisible());
    expect(isVisible).toBeFalsy();
  });

  test('custom button can trigger BugDrop.open()', async ({ page }) => {
    await page.goto('/test/api-only.html');

    // Wait for BugDrop to be ready
    await page.waitForFunction(
      () => {
        const status = document.getElementById('status');
        return status?.textContent?.includes('BugDrop ready');
      },
      { timeout: 5000 }
    );

    // Click the "Report Bug" link in the nav
    await page.click('#nav-report-bug');

    // Modal should open
    const modal = page.locator('#bugdrop-host').locator('css=.bd-modal');
    await expect(modal).toBeVisible({ timeout: 5000 });
  });

  test('BugDrop.show() does nothing in API-only mode (no button to show)', async ({ page }) => {
    await page.goto('/test/api-only.html');
    await page.locator('#bugdrop-host').waitFor({ state: 'attached' });

    // Try to show button (should do nothing, no errors)
    await page.evaluate(() => window.BugDrop?.show());

    // Button should still not exist
    const trigger = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(trigger).not.toBeAttached();
  });
});

test.describe('Feedback Categories', () => {
  test('category selector is visible on feedback form', async ({ page }) => {
    // Mock installation check
    await page.route('**/api/check/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ installed: true }),
      });
    });

    await page.goto('/test/index.html');

    const trigger = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(trigger).toBeVisible({ timeout: 5000 });

    // Click to open modal
    await trigger.click();
    const modal = page.locator('#bugdrop-host').locator('css=.bd-modal');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Click continue on welcome screen
    const continueBtn = page.locator('#bugdrop-host').locator('css=[data-action="continue"]');
    await continueBtn.click();

    // Wait for form to appear by checking for title input
    const titleInput = page.locator('#bugdrop-host').locator('css=#title');
    await expect(titleInput).toBeVisible({ timeout: 5000 });

    // Category selector should be visible
    const categorySelector = page.locator('#bugdrop-host').locator('css=.bd-category-selector');
    await expect(categorySelector).toBeVisible();

    // All three options should be present
    const bugOption = page
      .locator('#bugdrop-host')
      .locator('css=input[name="category"][value="bug"]');
    const featureOption = page
      .locator('#bugdrop-host')
      .locator('css=input[name="category"][value="feature"]');
    const questionOption = page
      .locator('#bugdrop-host')
      .locator('css=input[name="category"][value="question"]');

    await expect(bugOption).toBeAttached();
    await expect(featureOption).toBeAttached();
    await expect(questionOption).toBeAttached();
  });

  test('bug category is selected by default', async ({ page }) => {
    // Mock installation check
    await page.route('**/api/check/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ installed: true }),
      });
    });

    await page.goto('/test/index.html');

    const trigger = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(trigger).toBeVisible({ timeout: 5000 });
    await trigger.click();
    await page.locator('#bugdrop-host').locator('css=.bd-modal').waitFor();

    const continueBtn = page.locator('#bugdrop-host').locator('css=[data-action="continue"]');
    await continueBtn.click();

    // Wait for form to appear
    const titleInput = page.locator('#bugdrop-host').locator('css=#title');
    await expect(titleInput).toBeVisible({ timeout: 5000 });

    // Bug should be checked by default
    const bugOption = page
      .locator('#bugdrop-host')
      .locator('css=input[name="category"][value="bug"]');
    await expect(bugOption).toBeChecked();
  });

  test('can select different categories', async ({ page }) => {
    // Mock installation check
    await page.route('**/api/check/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ installed: true }),
      });
    });

    await page.goto('/test/index.html');

    const trigger = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(trigger).toBeVisible({ timeout: 5000 });
    await trigger.click();
    await page.locator('#bugdrop-host').locator('css=.bd-modal').waitFor();

    const continueBtn = page.locator('#bugdrop-host').locator('css=[data-action="continue"]');
    await continueBtn.click();

    // Wait for form to appear
    const titleInput = page.locator('#bugdrop-host').locator('css=#title');
    await expect(titleInput).toBeVisible({ timeout: 5000 });

    // Select feature
    const featureOption = page
      .locator('#bugdrop-host')
      .locator('css=input[name="category"][value="feature"]');
    await featureOption.click();
    await expect(featureOption).toBeChecked();

    // Bug should no longer be checked
    const bugOption = page
      .locator('#bugdrop-host')
      .locator('css=input[name="category"][value="bug"]');
    await expect(bugOption).not.toBeChecked();

    // Select question
    const questionOption = page
      .locator('#bugdrop-host')
      .locator('css=input[name="category"][value="question"]');
    await questionOption.click();
    await expect(questionOption).toBeChecked();
    await expect(featureOption).not.toBeChecked();
  });
});

test.describe('Custom Icon', () => {
  test('custom icon renders img element with correct src', async ({ page }) => {
    await page.goto('/test/icon-custom.html');
    await page.locator('#bugdrop-host').locator('css=.bd-trigger').waitFor();

    const trigger = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(trigger).toBeVisible({ timeout: 5000 });

    // Should have an img inside the trigger icon
    const img = page.locator('#bugdrop-host').locator('css=.bd-trigger-icon img');
    await expect(img).toBeVisible();

    // Img src should contain the data URI
    const src = await img.getAttribute('src');
    expect(src).toContain('data:image/png;base64,');
  });

  test('broken icon URL falls back to default emoji', async ({ page }) => {
    // Navigate to a page and inject widget with broken icon URL
    await page.goto('/test/icon-custom.html');
    await page.locator('#bugdrop-host').locator('css=.bd-trigger').waitFor();

    // Modify the page to use a broken URL by evaluating script
    await page.evaluate(() => {
      const host = document.getElementById('bugdrop-host');
      if (host) host.remove();

      const script = document.createElement('script');
      script.src = '/widget.js';
      script.dataset.repo = 'mean-weasel/bugdrop-widget-test';
      script.dataset.theme = 'dark';
      script.dataset.icon = 'https://invalid.example.com/nonexistent.png';
      document.body.appendChild(script);
    });

    const triggerIcon = page.locator('#bugdrop-host').locator('css=.bd-trigger-icon');
    await expect(triggerIcon).toBeVisible({ timeout: 5000 });

    // The img should be hidden (display:none from onerror) and fallback emoji visible
    const fallbackText = await triggerIcon.textContent();
    expect(fallbackText).toContain('🐛');
  });

  test('default emoji shows when no data-icon is set', async ({ page }) => {
    await page.goto('/test/index.html');
    await page.locator('#bugdrop-host').locator('css=.bd-trigger').waitFor();

    const triggerIcon = page.locator('#bugdrop-host').locator('css=.bd-trigger-icon');
    await expect(triggerIcon).toBeVisible({ timeout: 5000 });

    // Should NOT have an img element
    const img = page.locator('#bugdrop-host').locator('css=.bd-trigger-icon img');
    await expect(img).not.toBeAttached();

    // Should have the default emoji
    const text = await triggerIcon.textContent();
    expect(text).toContain('🐛');
  });
});

test.describe('Screenshot Crash Prevention (#67)', () => {
  const STUB_PNG =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  // Mock the html-to-image CDN with a custom toPng implementation
  function mockHtmlToImage(page: Page, toPngBody: string) {
    return page.route('**/html-to-image**', async route => {
      await route.fulfill({
        contentType: 'application/javascript',
        body: `window.htmlToImage = { toPng: ${toPngBody} };`,
      });
    });
  }

  // Spy mock: records opts and returns a valid PNG
  function spyToPng() {
    return `function(el, opts) {
      window.__captureOpts = opts;
      return Promise.resolve('${STUB_PNG}');
    }`;
  }

  test.beforeEach(async ({ page }) => {
    await page.route('**/api/check/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ installed: true }),
      });
    });
  });

  // Helper: navigate widget to screenshot options and click "Full Page"
  async function navigateToFullPageCapture(page: Page) {
    const host = page.locator('#bugdrop-host');

    // Open widget
    const button = host.locator('css=.bd-trigger');
    await expect(button).toBeVisible({ timeout: 5000 });
    await button.click();

    // Click through welcome screen
    const getStartedBtn = host.locator('css=[data-action="continue"]');
    await expect(getStartedBtn).toBeVisible({ timeout: 5000 });
    await getStartedBtn.click();

    // Fill minimal form and check "Include screenshot"
    const titleInput = host.locator('css=#title');
    await expect(titleInput).toBeVisible({ timeout: 5000 });
    await titleInput.fill('Screenshot test');

    const screenshotCheckbox = host.locator('css=#include-screenshot');
    await screenshotCheckbox.check();

    // Continue to screenshot options
    const continueBtn = host.locator('css=#submit-btn');
    await continueBtn.click();

    // Click "Full Page"
    const captureBtn = host.locator('css=[data-action="capture"]');
    await expect(captureBtn).toBeVisible({ timeout: 5000 });
    await captureBtn.click();
  }

  test('reduces pixelRatio on complex DOM pages (>3000 nodes)', async ({ page }) => {
    await mockHtmlToImage(page, spyToPng());
    await page.goto('/test/complex-dom.html');

    // Verify the page actually has >3000 nodes
    const nodeCount = await page.evaluate(() => document.body.querySelectorAll('*').length);
    expect(nodeCount).toBeGreaterThan(3000);

    await navigateToFullPageCapture(page);

    // Wait for annotation step (capture succeeded)
    const annotationCanvas = page.locator('#bugdrop-host').locator('css=#annotation-canvas');
    await expect(annotationCanvas).toBeVisible({ timeout: 10000 });

    // Verify pixelRatio was reduced to 1 due to complex DOM
    const captureOpts = await page.evaluate(() => (window as any).__captureOpts);
    expect(captureOpts.pixelRatio).toBe(1);
  });

  test('uses normal pixelRatio on simple pages', async ({ page }) => {
    await mockHtmlToImage(page, spyToPng());
    await page.goto('/test/');

    // Verify simple page has <3000 nodes
    const nodeCount = await page.evaluate(() => document.body.querySelectorAll('*').length);
    expect(nodeCount).toBeLessThan(3000);

    await navigateToFullPageCapture(page);

    // Wait for annotation step
    const annotationCanvas = page.locator('#bugdrop-host').locator('css=#annotation-canvas');
    await expect(annotationCanvas).toBeVisible({ timeout: 10000 });

    // pixelRatio should be >= 2 (default min scale)
    const captureOpts = await page.evaluate(() => (window as any).__captureOpts);
    expect(captureOpts.pixelRatio).toBeGreaterThanOrEqual(2);
  });

  test('no unhandled rejections after successful capture', async ({ page }) => {
    // Track unhandled promise rejections — verifies the timer is cleaned up
    const rejections: string[] = [];
    page.on('pageerror', err => rejections.push(err.message));

    await mockHtmlToImage(page, spyToPng());
    await page.goto('/test/');
    await navigateToFullPageCapture(page);

    const annotationCanvas = page.locator('#bugdrop-host').locator('css=#annotation-canvas');
    await expect(annotationCanvas).toBeVisible({ timeout: 10000 });

    // Wait long enough for a leaked timer to fire (timeout is 15s, capture is instant)
    await page.waitForTimeout(2000);

    const timeoutRejections = rejections.filter(m => m.includes('timed out'));
    expect(timeoutRejections).toHaveLength(0);
  });

  test('shows error modal when capture times out', async ({ page }) => {
    await mockHtmlToImage(page, 'function() { return new Promise(function() {}); }');
    await page.goto('/test/');
    await navigateToFullPageCapture(page);

    // The 15s timeout should fire and the error modal should appear
    const host = page.locator('#bugdrop-host');
    const errorText = host.locator('css=.bd-error-message__text');
    await expect(errorText).toBeVisible({ timeout: 20000 });
    await expect(errorText).toContainText('Failed to capture screenshot');

    // Verify retry and skip buttons are available
    const skipBtn = host.locator('css=[data-action="skip"]');
    const retryBtn = host.locator('css=[data-action="retry"]');
    await expect(skipBtn).toBeVisible();
    await expect(retryBtn).toBeVisible();
  });

  test('skip button on error modal continues without screenshot', async ({ page }) => {
    await mockHtmlToImage(page, "function() { return Promise.reject(new Error('mock failure')); }");
    await page.goto('/test/');
    await navigateToFullPageCapture(page);

    // Wait for error modal
    const host = page.locator('#bugdrop-host');
    const errorText = host.locator('css=.bd-error-message__text');
    await expect(errorText).toBeVisible({ timeout: 5000 });

    // Click "Skip Screenshot" — should proceed to submission (no annotation step)
    const skipBtn = host.locator('css=[data-action="skip"]');
    await skipBtn.click();

    // Error modal should be gone and submission should proceed
    await expect(errorText).not.toBeVisible({ timeout: 3000 });
  });

  test('retry button on error modal re-attempts capture', async ({ page }) => {
    // First call fails, second call succeeds
    await mockHtmlToImage(
      page,
      `function(el, opts) {
        if (!window.__retryAttempted) {
          window.__retryAttempted = true;
          return Promise.reject(new Error('first attempt fails'));
        }
        return Promise.resolve('${STUB_PNG}');
      }`
    );

    await page.goto('/test/');
    await navigateToFullPageCapture(page);

    // Wait for error modal from first failure
    const host = page.locator('#bugdrop-host');
    const errorText = host.locator('css=.bd-error-message__text');
    await expect(errorText).toBeVisible({ timeout: 5000 });

    // Click "Try Again"
    const retryBtn = host.locator('css=[data-action="retry"]');
    await retryBtn.click();

    // Second attempt succeeds — annotation canvas should appear
    const annotationCanvas = host.locator('css=#annotation-canvas');
    await expect(annotationCanvas).toBeVisible({ timeout: 10000 });
  });
});

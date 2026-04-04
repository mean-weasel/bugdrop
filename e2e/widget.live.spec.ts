import { test, expect } from '@playwright/test';

/**
 * Live E2E tests for BugDrop widget on a real cross-origin deployment.
 *
 * These tests run against the Vercel preview of bugdrop-widget-test,
 * which loads the widget from the CF Workers preview deployment.
 * They validate cross-origin behavior that local tests cannot cover.
 *
 * Run with: LIVE_TARGET=preview PLAYWRIGHT_BASE_URL=<vercel-url> npx playwright test --project=chromium-live
 */

test.describe('Widget Loading (Live)', () => {
  test('widget loads and renders on cross-origin site', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && !msg.text().includes('BugDrop')) {
        errors.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForTimeout(2000);

    // Widget host element should exist
    const host = page.locator('#bugdrop-host');
    await expect(host).toBeAttached({ timeout: 10_000 });

    // Feedback button should be visible in shadow DOM
    const button = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(button).toBeVisible({ timeout: 10_000 });

    // No unexpected console errors
    const unexpectedErrors = errors.filter(e => !e.includes('Missing data-repo'));
    expect(unexpectedErrors).toHaveLength(0);
  });

  test('widget.js is served from the preview worker', async ({ request }) => {
    const response = await request.get('/');
    expect(response.ok()).toBeTruthy();

    const html = await response.text();
    // The page should contain a script tag pointing to the bugdrop widget
    expect(html).toContain('widget.js');
  });
});

test.describe('Feedback Button (Live)', () => {
  test('feedback button is visible and clickable', async ({ page }) => {
    await page.goto('/');

    const button = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(button).toBeVisible({ timeout: 10_000 });

    // Click should open the modal
    await button.click();

    const modal = page.locator('#bugdrop-host').locator('css=.bd-modal');
    await expect(modal).toBeVisible({ timeout: 5_000 });
  });
});

test.describe('Welcome Flow (Live)', () => {
  test('welcome screen shows on first visit', async ({ page }) => {
    await page.goto('/');

    const button = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(button).toBeVisible({ timeout: 10_000 });
    await button.click();

    const modal = page.locator('#bugdrop-host').locator('css=.bd-modal');
    await expect(modal).toBeVisible({ timeout: 5_000 });

    // Fresh Playwright context = first visit = welcome screen
    const getStartedBtn = page.locator('#bugdrop-host').locator('css=[data-action="continue"]');
    await expect(getStartedBtn).toBeVisible({ timeout: 5_000 });
  });

  test('can proceed past welcome screen to feedback form', async ({ page }) => {
    await page.goto('/');

    const button = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(button).toBeVisible({ timeout: 10_000 });
    await button.click();

    // Click "Get Started" on welcome screen
    const getStartedBtn = page.locator('#bugdrop-host').locator('css=[data-action="continue"]');
    await expect(getStartedBtn).toBeVisible({ timeout: 5_000 });
    await getStartedBtn.click();

    // Feedback form should appear with title input
    const titleInput = page.locator('#bugdrop-host').locator('css=#title');
    await expect(titleInput).toBeVisible({ timeout: 5_000 });
  });
});

test.describe('Cross-Origin API (Live)', () => {
  test('widget derives API URL correctly from cross-origin script src', async ({ page }) => {
    // Register listener before navigation to capture all API calls
    const apiCalls: string[] = [];
    page.on('request', req => {
      if (req.url().includes('/api/')) {
        apiCalls.push(req.url());
      }
    });

    await page.goto('/');

    // Wait for widget to load
    const host = page.locator('#bugdrop-host');
    await expect(host).toBeAttached({ timeout: 10_000 });

    // Open the modal to trigger the installation check
    const button = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(button).toBeVisible({ timeout: 10_000 });
    await button.click();

    // Wait for the API call to fire
    await page.waitForTimeout(3_000);

    // At least one API call should have been made
    expect(apiCalls.length).toBeGreaterThan(0);

    // All API calls should go to the workers.dev domain (not the Vercel domain)
    for (const url of apiCalls) {
      expect(url).toContain('workers.dev');
    }
  });

  test('CORS headers are present on cross-origin API requests', async ({ page }) => {
    await page.goto('/');

    // Intercept the API response to check CORS headers
    const corsHeaders: Record<string, string> = {};
    page.on('response', res => {
      if (res.url().includes('/api/check/')) {
        const headers = res.headers();
        if (headers['access-control-allow-origin']) {
          corsHeaders['access-control-allow-origin'] = headers['access-control-allow-origin'];
        }
      }
    });

    // Open the modal to trigger the installation check API call
    const button = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(button).toBeVisible({ timeout: 10_000 });
    await button.click();

    // Wait for the API response
    await page.waitForTimeout(3_000);

    // CORS header should be present
    expect(corsHeaders['access-control-allow-origin']).toBeDefined();
  });
});

test.describe('Powered By Link (Live)', () => {
  test('powered by BugDrop link is visible', async ({ page }) => {
    await page.goto('/');

    const button = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(button).toBeVisible({ timeout: 10_000 });
    await button.click();

    const modal = page.locator('#bugdrop-host').locator('css=.bd-modal');
    await expect(modal).toBeVisible({ timeout: 5_000 });

    const poweredBy = page.locator('#bugdrop-host').locator('css=.bd-powered-by');
    await expect(poweredBy).toBeVisible();
  });
});

test.describe('Screenshot Capture (Live)', () => {
  test('screenshot option is available in cross-origin context', async ({ page }) => {
    // Mock the installation check to return installed: true
    await page.route('**/api/check/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ installed: true }),
      });
    });

    await page.goto('/');

    const button = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(button).toBeVisible({ timeout: 10_000 });
    await button.click();

    // Click "Get Started" on welcome screen
    const getStartedBtn = page.locator('#bugdrop-host').locator('css=[data-action="continue"]');
    await expect(getStartedBtn).toBeVisible({ timeout: 5_000 });
    await getStartedBtn.click();

    // Fill in feedback form
    const titleInput = page.locator('#bugdrop-host').locator('css=#title');
    await expect(titleInput).toBeVisible({ timeout: 5_000 });
    await titleInput.fill('Live test feedback');

    // Screenshot checkbox should be available
    const screenshotCheckbox = page.locator('#bugdrop-host').locator('css=#include-screenshot');
    await expect(screenshotCheckbox).toBeVisible();
    await screenshotCheckbox.check();

    // Click Continue to get to screenshot options
    const continueBtn = page.locator('#bugdrop-host').locator('css=#submit-btn');
    await continueBtn.click();

    // Screenshot capture options should appear
    const fullPageBtn = page.locator('#bugdrop-host').locator('css=[data-action="fullpage"]');
    const elementBtn = page.locator('#bugdrop-host').locator('css=[data-action="element"]');

    // At least one screenshot option should be available
    const fullPageVisible = await fullPageBtn.isVisible().catch(() => false);
    const elementVisible = await elementBtn.isVisible().catch(() => false);
    expect(fullPageVisible || elementVisible).toBeTruthy();
  });
});

test.describe('Feedback Submission (Live)', () => {
  test('feedback form submits and gets expected response', async ({ page }) => {
    // Mock the installation check to return installed: true
    await page.route('**/api/check/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ installed: true }),
      });
    });

    await page.goto('/');

    const button = page.locator('#bugdrop-host').locator('css=.bd-trigger');
    await expect(button).toBeVisible({ timeout: 10_000 });
    await button.click();

    // Click "Get Started" on welcome screen
    const getStartedBtn = page.locator('#bugdrop-host').locator('css=[data-action="continue"]');
    await expect(getStartedBtn).toBeVisible({ timeout: 5_000 });
    await getStartedBtn.click();

    // Fill in feedback form
    const titleInput = page.locator('#bugdrop-host').locator('css=#title');
    await expect(titleInput).toBeVisible({ timeout: 5_000 });
    await titleInput.fill('Live E2E test submission');

    // Submit without screenshot
    const submitBtn = page.locator('#bugdrop-host').locator('css=#submit-btn');
    await submitBtn.click();

    // Wait for submission to complete
    await page.waitForTimeout(5_000);

    // Check that the widget is showing either a success or error state
    // (not stuck in the form state, which would indicate a CORS/network failure)
    const successScreen = page.locator('#bugdrop-host').locator('css=.bd-success');
    const errorMessage = page.locator('#bugdrop-host').locator('css=.bd-error');

    const hasSuccess = await successScreen.isVisible().catch(() => false);
    const hasError = await errorMessage.isVisible().catch(() => false);

    // Either success or error is fine — both mean the cross-origin request completed
    expect(hasSuccess || hasError).toBeTruthy();
  });
});

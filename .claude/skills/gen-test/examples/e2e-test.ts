/**
 * Example E2E test pattern for BugDrop widget.
 *
 * Key patterns:
 * - Import from @playwright/test: test, expect, type Page
 * - Widget lives in shadow DOM: page.locator('#bugdrop-host').locator('css=...')
 * - Intercept CDN requests with page.route() glob patterns
 * - Mock API responses with page.route() glob patterns
 * - Use helpers to reduce boilerplate across tests
 * - IMPORTANT: Run `npm run build:widget` before E2E if source changed
 */

import { test, expect, type Page } from '@playwright/test';

// Helper: intercept html-to-image CDN and inject mock
async function mockHtmlToImage(page: Page, toPngBody: string) {
  await page.route('**/html-to-image**', route =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `window.htmlToImage = { toPng: ${toPngBody} };`,
    })
  );
}

// Helper: toPng that records options and returns stub PNG
function spyToPng() {
  return `async function(el, opts) {
    window.__captureOpts = opts;
    return 'data:image/png;base64,stub';
  }`;
}

// Helper: navigate widget to full-page screenshot capture
async function navigateToFullPageCapture(page: Page) {
  const host = page.locator('#bugdrop-host');
  await host.locator('css=.bd-trigger').click();
  // ... navigate through widget steps to reach screenshot capture
}

test.describe('Example Widget Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Mock API check endpoint (shared across tests)
    await page.route('**/api/check/**', route =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ installed: true }),
      })
    );
  });

  test('captures screenshot with expected options', async ({ page }) => {
    await mockHtmlToImage(page, spyToPng());
    await page.goto('/test/');
    await navigateToFullPageCapture(page);

    const opts = await page.evaluate(() => (window as any).__captureOpts);
    expect(opts.pixelRatio).toBeGreaterThanOrEqual(1);
  });
});

import { test, expect, type Page } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const NODE_COUNTS = [1000, 2000, 3000, 5000, 7000, 10000, 12000, 15000];

interface BenchmarkResult {
  nodes: number;
  actualNodes: number;
  durationMs: number;
  outcome: 'success' | 'error' | 'timeout';
}

const results: BenchmarkResult[] = [];

// Mock the GitHub App installation check so the widget renders normally
test.beforeEach(async ({ page }) => {
  await page.route('**/api/check/**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ installed: true }),
    });
  });
});

// Navigate widget to the "Full Page" capture button and click it.
// Returns the timestamp immediately after clicking.
async function navigateToFullPageCapture(page: Page): Promise<number> {
  const host = page.locator('#bugdrop-host');

  // Open widget
  const trigger = host.locator('css=.bd-trigger');
  await expect(trigger).toBeVisible({ timeout: 10_000 });
  await trigger.click();

  // Welcome screen — click through
  const getStartedBtn = host.locator('css=[data-action="continue"]');
  await expect(getStartedBtn).toBeVisible({ timeout: 5_000 });
  await getStartedBtn.click();

  // Fill minimal form
  const titleInput = host.locator('css=#title');
  await expect(titleInput).toBeVisible({ timeout: 5_000 });
  await titleInput.fill('Benchmark test');

  // Ensure screenshot checkbox is checked
  const screenshotCheckbox = host.locator('css=#include-screenshot');
  await screenshotCheckbox.check();

  // Submit form
  const submitBtn = host.locator('css=#submit-btn');
  await submitBtn.click();

  // Click "Full Page"
  const captureBtn = host.locator('css=[data-action="capture"]');
  await expect(captureBtn).toBeVisible({ timeout: 5_000 });

  const startTime = Date.now();
  await captureBtn.click();

  return startTime;
}

for (const nodeCount of NODE_COUNTS) {
  test(`capture at ${nodeCount} nodes`, async ({ page }) => {
    // Navigate to fixture with target node count
    await page.goto(`/test/complex-dom.html?nodes=${nodeCount}`, {
      waitUntil: 'networkidle',
    });

    // Verify actual node count
    const actualNodes = await page.evaluate(() => document.body.querySelectorAll('*').length);

    // Drive the widget to Full Page capture
    const startTime = await navigateToFullPageCapture(page);

    const host = page.locator('#bugdrop-host');
    const annotationCanvas = host.locator('css=#annotation-canvas');
    const errorMessage = host.locator('css=.bd-error-message__text');

    try {
      // Wait for either success (annotation step) or failure (error modal)
      // Use 60s inner timeout — Playwright's 90s timeout is the outer safety net
      await Promise.race([
        annotationCanvas.waitFor({ state: 'visible', timeout: 60_000 }),
        errorMessage.waitFor({ state: 'visible', timeout: 60_000 }),
      ]);

      const durationMs = Date.now() - startTime;
      const succeeded = await annotationCanvas.isVisible();

      results.push({
        nodes: nodeCount,
        actualNodes,
        durationMs,
        outcome: succeeded ? 'success' : 'error',
      });
    } catch {
      // Neither appeared within 60s — hard freeze / timeout
      const durationMs = Date.now() - startTime;
      results.push({
        nodes: nodeCount,
        actualNodes,
        durationMs,
        outcome: 'timeout',
      });
    }
  });
}

test.afterAll(() => {
  if (results.length === 0) return;

  // Print markdown table to stdout
  const header = '| Nodes | Actual | Duration (ms) | Outcome |';
  const divider = '|------:|-------:|--------------:|---------|';
  const rows = results.map(
    r => `| ${r.nodes} | ${r.actualNodes} | ${r.durationMs} | ${r.outcome} |`
  );

  console.log('\n## Screenshot Threshold Benchmark Results\n');
  console.log(header);
  console.log(divider);
  rows.forEach(row => console.log(row));
  console.log('');

  // Save JSON
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const resultsDir = join(__dirname, 'results');
  mkdirSync(resultsDir, { recursive: true });
  const outPath = join(resultsDir, `screenshot-threshold-${timestamp}.json`);

  const output = {
    timestamp: new Date().toISOString(),
    userAgent: 'Playwright Chromium (headless)',
    results,
  };

  writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`Results saved to: ${outPath}\n`);
});

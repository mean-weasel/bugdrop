import { test, expect, type Page } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { cpus, totalmem, platform, release, arch } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));

const NODE_COUNTS = [1000, 2000, 3000, 5000, 7000, 10000, 12000, 15000];

interface BenchmarkResult {
  nodes: number;
  actualNodes: number;
  durationMs: number;
  outcome: 'success' | 'error' | 'timeout' | 'full_page_disabled';
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
// Returns the timestamp immediately after clicking, or null if the button
// is hidden (DOM too complex — widget disables full-page capture at 10k+ nodes).
async function navigateToFullPageCapture(page: Page): Promise<number | null> {
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

  // Wait for screenshot options to appear
  const elementBtn = host.locator('css=[data-action="element"]');
  await expect(elementBtn).toBeVisible({ timeout: 5_000 });

  // Check if "Full Page" button exists (hidden when DOM ≥ 10k nodes)
  const captureBtn = host.locator('css=[data-action="capture"]');
  const isVisible = await captureBtn.isVisible();
  if (!isVisible) return null;

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

    // Verify actual node count matches what was requested
    const actualNodes = await page.evaluate(() => document.body.querySelectorAll('*').length);
    expect(actualNodes).toBeGreaterThanOrEqual(nodeCount);

    // Drive the widget to Full Page capture
    const startTime = await navigateToFullPageCapture(page);

    // Widget hides "Full Page" button when DOM is too complex (≥10k nodes)
    if (startTime === null) {
      results.push({
        nodes: nodeCount,
        actualNodes,
        durationMs: 0,
        outcome: 'full_page_disabled',
      });
      return;
    }

    const host = page.locator('#bugdrop-host');
    const annotationCanvas = host.locator('css=#annotation-canvas');
    const errorMessage = host.locator('css=.bd-error-message__text');

    try {
      // Wait for either success (annotation step) or failure (error modal)
      // locator.or() avoids dangling promises that Promise.race would leave
      const outcome = annotationCanvas.or(errorMessage);
      await outcome.waitFor({ state: 'visible', timeout: 60_000 });

      const durationMs = Date.now() - startTime;
      const succeeded = await annotationCanvas.isVisible();

      results.push({
        nodes: nodeCount,
        actualNodes,
        durationMs,
        outcome: succeeded ? 'success' : 'error',
      });
    } catch (error) {
      // Neither appeared within 60s — hard freeze / timeout
      const durationMs = Date.now() - startTime;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[${nodeCount} nodes] Benchmark failed after ${durationMs}ms: ${message}`);
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

  const cpuInfo = cpus();
  const machine = {
    os: `${platform()} ${release()} (${arch()})`,
    cpu: cpuInfo[0]?.model || 'unknown',
    cores: cpuInfo.length,
    ramGb: Math.round(totalmem() / 1024 / 1024 / 1024),
  };

  // Print markdown table to stdout
  console.log('\n## Screenshot Threshold Benchmark Results\n');
  console.log(
    `**Machine:** ${machine.cpu} | ${machine.cores} cores | ${machine.ramGb} GB RAM | ${machine.os}\n`
  );
  console.log('| Nodes (target) | Nodes (actual) | Duration (ms) | Outcome |');
  console.log('|---------------:|---------------:|--------------:|---------|');
  const outcomeFlags: Record<string, string> = {
    timeout: ' ⚠️',
    error: ' ❌',
    full_page_disabled: ' ⏭️',
  };

  for (const r of results) {
    const flag = outcomeFlags[r.outcome] ?? '';
    console.log(`| ${r.nodes} | ${r.actualNodes} | ${r.durationMs} | ${r.outcome}${flag} |`);
  }
  console.log(
    '\n*Nodes (target) = requested via ?nodes=N; Nodes (actual) = total DOM nodes counted after generation*'
  );
  console.log('');

  // Save JSON
  const now = new Date().toISOString();
  const resultsDir = join(__dirname, 'results');
  mkdirSync(resultsDir, { recursive: true });
  const outPath = join(resultsDir, `screenshot-threshold-${now.replace(/[:.]/g, '-')}.json`);

  const output = {
    timestamp: now,
    machine,
    results,
  };

  writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`Results saved to: ${outPath}\n`);
});

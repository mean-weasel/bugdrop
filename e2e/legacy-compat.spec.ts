import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';

interface HistoricalPayload {
  repo: string;
  title: string;
  description: string;
  screenshot: null;
  metadata: {
    url: string;
    userAgent: string;
    viewport: { width: number; height: number };
    timestamp: string;
    elementSelector: null;
  };
}

const fixtureRoot = new URL('../test/fixtures/legacy-compat/', import.meta.url);
const historicalBundle = await readFile(new URL('v1.1.0/widget.js', fixtureRoot), 'utf8');
const currentLegacyBundle = await readFile(new URL('v1.53.1/widget.js', fixtureRoot), 'utf8');
const legacyPayloads = JSON.parse(
  await readFile(new URL('legacy-payload.json', fixtureRoot), 'utf8')
) as { historicalV1_1_0Submission: HistoricalPayload };
const legacyResponse = JSON.parse(
  await readFile(new URL('legacy-response.json', fixtureRoot), 'utf8')
) as Record<string, unknown>;

async function mountHistoricalWidget(
  page: Page,
  options: { repo?: string; buttonDismissible?: boolean; bundle?: string } = {}
) {
  const repo = options.repo ?? legacyPayloads.historicalV1_1_0Submission.repo;
  const dismissible = options.buttonDismissible ? ' data-button-dismissible="true"' : '';

  await page.route('**/legacy-compat-fixture', route =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><body><main>Legacy host</main><script src="/widget.js" data-repo="${repo}"${dismissible}></script></body></html>`,
    })
  );
  await page.route('**/widget.js', route =>
    route.fulfill({ contentType: 'text/javascript', body: options.bundle ?? historicalBundle })
  );
  await page.route('**/api/check/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"installed":true}' })
  );
  await page.goto('/legacy-compat-fixture');
  await expect(page.locator('#bugdrop-host').locator('css=.bd-trigger')).toBeVisible();
}

async function fillCurrentLegacyScreenshotFreeForm(page: Page) {
  const root = page.locator('#bugdrop-host');
  await root.locator('css=.bd-trigger').click();
  await root.locator('css=[data-action="continue"]').click();
  await root.locator('css=#title').fill('Current legacy compatibility');
  await root.locator('css=#description').fill('Tag-reconstructed v1.53.1 browser submission');
  const screenshotCheckbox = root.locator('css=#include-screenshot');
  if (await screenshotCheckbox.count()) await screenshotCheckbox.uncheck();
  await root.locator('css=#submit-btn').click();
}

async function fillHistoricalScreenshotFreeForm(page: Page) {
  const root = page.locator('#bugdrop-host');
  await root.locator('css=.bd-trigger').click();
  await root.locator('css=[data-action="skip"]').click();
  await root.locator('css=#title').fill(legacyPayloads.historicalV1_1_0Submission.title);
  await root
    .locator('css=#description')
    .fill(legacyPayloads.historicalV1_1_0Submission.description);
  await root.locator('css=#submit-btn').click();
}

test.describe('tag-reconstructed v1.1.0 compatibility', () => {
  test('emits the frozen screenshot-free request and accepts the frozen response', async ({
    page,
  }) => {
    let submittedPayload: HistoricalPayload | undefined;
    await page.route('**/api/feedback', async route => {
      submittedPayload = route.request().postDataJSON() as HistoricalPayload;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(legacyResponse),
      });
    });
    await mountHistoricalWidget(page);

    await fillHistoricalScreenshotFreeForm(page);

    await expect(page.locator('#bugdrop-host').locator('css=.bd-success-content')).toBeVisible();
    expect(submittedPayload).toBeDefined();
    const normalizedPayload = {
      ...submittedPayload!,
      metadata: {
        ...submittedPayload!.metadata,
        url: new URL(submittedPayload!.metadata.url).pathname,
        userAgent: '<user-agent>',
        timestamp: '<timestamp>',
      },
    };
    expect(normalizedPayload).toEqual(legacyPayloads.historicalV1_1_0Submission);
  });

  test('is parsed by the candidate Worker before a deliberately impossible repository is rejected', async ({
    page,
  }) => {
    const impossibleOwner = 'x'.repeat(40);
    await mountHistoricalWidget(page, { repo: `${impossibleOwner}/legacy-compat` });
    const feedbackResponse = page.waitForResponse(response =>
      response.url().endsWith('/api/feedback')
    );

    await fillHistoricalScreenshotFreeForm(page);

    const response = await feedbackResponse;
    expect(response.status()).not.toBe(400);
    expect(response.status()).not.toBe(200);
    await expect(page.locator('#bugdrop-host').locator('css=.bd-error-message')).toBeVisible();
  });

  test('keeps the legacy open shadow root and dismissal storage contract', async ({ page }) => {
    await mountHistoricalWidget(page, { buttonDismissible: true });
    const host = page.locator('#bugdrop-host');

    expect(await host.evaluate(element => element.shadowRoot?.mode)).toBe('open');
    await host.locator('css=.bd-trigger-close').click();

    await expect(host.locator('css=.bd-trigger')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('bugdrop_dismissed'))).toBe('true');
  });
});

test.describe('tag-reconstructed v1.53.1 compatibility', () => {
  test('keeps the current legacy bootstrap and is parsed by the candidate Worker', async ({
    page,
  }) => {
    const impossibleOwner = 'x'.repeat(40);
    await mountHistoricalWidget(page, {
      repo: `${impossibleOwner}/legacy-compat`,
      bundle: currentLegacyBundle,
    });
    const host = page.locator('#bugdrop-host');
    expect(await host.evaluate(element => element.shadowRoot?.mode)).toBe('open');
    expect(
      await page.evaluate(() => ({
        hasLegacyOpen: typeof window.BugDrop?.open === 'function',
        hasLegacyClose: typeof window.BugDrop?.close === 'function',
        hasVariantRegistration: typeof window.BugDrop?.registerVariant === 'function',
      }))
    ).toEqual({ hasLegacyOpen: true, hasLegacyClose: true, hasVariantRegistration: false });

    const feedbackResponse = page.waitForResponse(response =>
      response.url().endsWith('/api/feedback')
    );
    await fillCurrentLegacyScreenshotFreeForm(page);

    const response = await feedbackResponse;
    expect(response.status()).not.toBe(400);
    expect(response.status()).not.toBe(200);
    await expect(host.locator('css=.bd-error-message')).toBeVisible();
  });
});

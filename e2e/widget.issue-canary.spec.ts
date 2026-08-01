import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { expect, test, type Page, type Request } from '@playwright/test';

const TEST_REPO = 'mean-weasel/bugdrop-widget-test';
const PREVIEW_WIDGET_ORIGIN = 'https://bugdrop-preview.neonwatty.workers.dev';
const TITLE_PREFIX = '[BugDrop CI canary]';

type CanaryEnvironment = {
  baseUrl: string;
  expectedWidgetOrigin: string;
  expectedWidgetSha256: string;
  expectedWorkerSha: string;
  marker: string;
  resultFile: string;
};

type FeedbackResult = {
  success?: unknown;
  issueNumber?: unknown;
  issueUrl?: unknown;
};

test.describe.configure({ mode: 'serial', retries: 0 });

test('legacy preview widget creates one real Issue with exact deployment identity', async ({
  page,
  request,
}) => {
  const environment = requireCanaryEnvironment();
  await installVercelBypass(page);

  await page.goto('/');
  const widgetSrc = await page.evaluate(() => {
    return Array.from(document.scripts)
      .map(script => script.src)
      .find(src => new URL(src).pathname === '/widget.js');
  });
  expect(widgetSrc, 'The fixed venue must load widget.js').toBeTruthy();

  const widgetUrl = new URL(widgetSrc!);
  expect(widgetUrl.origin).toBe(environment.expectedWidgetOrigin);
  expect(widgetUrl.pathname).toBe('/widget.js');

  const widgetResponse = await request.get(widgetUrl.href);
  expect(widgetResponse.ok()).toBe(true);
  expect(sha256(await widgetResponse.body())).toBe(environment.expectedWidgetSha256);

  const feedbackPosts: Request[] = [];
  let rejectedRequest: string | undefined;
  await page.route('**/feedback', async route => {
    const outgoing = route.request();
    if (outgoing.method() !== 'POST') {
      await route.continue();
      return;
    }

    const outgoingUrl = new URL(outgoing.url());
    expect(outgoingUrl.origin).toBe(environment.expectedWidgetOrigin);
    expect(outgoingUrl.pathname).toBe('/api/feedback');

    feedbackPosts.push(outgoing);
    if (feedbackPosts.length > 1) {
      rejectedRequest = 'The widget attempted more than one feedback POST';
      await route.abort('blockedbyclient');
      return;
    }

    const payload = outgoing.postDataJSON() as Record<string, unknown>;
    expect(payload.repo).toBe(TEST_REPO);
    expect(payload.title).toBe(`${TITLE_PREFIX} ${environment.marker}`);
    expect(payload.description).toContain(environment.marker);
    expect(payload.category).toBe('bug');
    expect(payload.screenshot).toBeNull();
    await route.continue();
  });

  const host = page.locator('#bugdrop-host');
  await expect(host.locator('css=.bd-trigger')).toBeVisible({ timeout: 10_000 });
  await host.locator('css=.bd-trigger').click();
  await expect(host.locator('css=[data-action="continue"]')).toBeVisible({ timeout: 5_000 });
  await host.locator('css=[data-action="continue"]').click();

  await expect(host.locator('css=#title')).toBeVisible({ timeout: 5_000 });
  await host.locator('css=input[name="category"][value="bug"]').check();
  await host.locator('css=#title').fill(`${TITLE_PREFIX} ${environment.marker}`);
  await host.locator('css=#description').fill(environment.marker);
  const screenshotCheckbox = host.locator('css=#include-screenshot');
  await screenshotCheckbox.uncheck();
  await expect(screenshotCheckbox).not.toBeChecked();

  const feedbackResponsePromise = page.waitForResponse(response => {
    const responseUrl = new URL(response.url());
    return (
      response.request().method() === 'POST' &&
      responseUrl.origin === environment.expectedWidgetOrigin &&
      responseUrl.pathname === '/api/feedback'
    );
  });
  await host.locator('css=#submit-btn').click();
  const feedbackResponse = await feedbackResponsePromise;

  const feedbackUrl = new URL(feedbackResponse.url());
  expect(feedbackUrl.origin).toBe(environment.expectedWidgetOrigin);
  expect(feedbackUrl.pathname).toBe('/api/feedback');
  expect(feedbackResponse.status()).toBe(200);
  expect(feedbackResponse.headers()['x-bugdrop-build-sha']).toBe(environment.expectedWorkerSha);
  const result = (await feedbackResponse.json()) as FeedbackResult;
  expect(result.success).toBe(true);
  expect(Number.isInteger(result.issueNumber) && Number(result.issueNumber) > 0).toBe(true);
  const issueNumber = Number(result.issueNumber);
  const issueUrl = `https://github.com/${TEST_REPO}/issues/${issueNumber}`;
  expect(result.issueUrl).toBe(issueUrl);

  await expect(host.locator('css=.bd-success-content')).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(1_000);
  expect(rejectedRequest).toBeUndefined();
  expect(feedbackPosts).toHaveLength(1);

  await mkdir(dirname(environment.resultFile), { recursive: true });
  await writeFile(
    environment.resultFile,
    `${JSON.stringify({
      marker: environment.marker,
      issueNumber,
      issueUrl,
      workerSha: environment.expectedWorkerSha,
    })}\n`,
    { encoding: 'utf8', flag: 'wx' }
  );
});

function requireCanaryEnvironment(): CanaryEnvironment {
  if (process.env.BUGDROP_CANARY_GITHUB_TOKEN) {
    throw new Error('BUGDROP_CANARY_GITHUB_TOKEN must never be available to Playwright');
  }
  if (process.env.LIVE_TARGET !== 'preview') {
    throw new Error('LIVE_TARGET must equal preview for the Issue canary');
  }

  const baseUrl = requireEnvironment('PLAYWRIGHT_BASE_URL');
  const expectedWidgetOrigin = requireEnvironment('EXPECTED_WIDGET_ORIGIN');
  const expectedWidgetSha256 = requireEnvironment('EXPECTED_WIDGET_SHA256');
  const expectedWorkerSha = requireEnvironment('EXPECTED_WORKER_SHA');
  const marker = requireEnvironment('BUGDROP_CANARY_MARKER');
  const resultFile = requireEnvironment('BUGDROP_CANARY_RESULT_FILE');

  const venueUrl = new URL(baseUrl);
  if (venueUrl.protocol !== 'https:' || !venueUrl.hostname.endsWith('.vercel.app')) {
    throw new Error('PLAYWRIGHT_BASE_URL must be the HTTPS Vercel preview venue');
  }
  const widgetOriginUrl = new URL(expectedWidgetOrigin);
  if (
    widgetOriginUrl.origin !== expectedWidgetOrigin ||
    expectedWidgetOrigin !== PREVIEW_WIDGET_ORIGIN
  ) {
    throw new Error(`EXPECTED_WIDGET_ORIGIN must equal ${PREVIEW_WIDGET_ORIGIN}`);
  }
  if (!/^[a-f0-9]{64}$/.test(expectedWidgetSha256)) {
    throw new Error('EXPECTED_WIDGET_SHA256 must be a lowercase SHA-256 digest');
  }
  if (!/^[a-f0-9]{40}$/.test(expectedWorkerSha)) {
    throw new Error('EXPECTED_WORKER_SHA must be a full lowercase Git SHA');
  }
  if (!new RegExp(`^bugdrop-ci-canary:[0-9]+:[0-9]+:${expectedWorkerSha}$`).test(marker)) {
    throw new Error('BUGDROP_CANARY_MARKER must identify this run, attempt, and Worker SHA');
  }

  return {
    baseUrl,
    expectedWidgetOrigin,
    expectedWidgetSha256,
    expectedWorkerSha,
    marker,
    resultFile,
  };
}

function requireEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for the Issue canary`);
  return value;
}

async function installVercelBypass(page: Page): Promise<void> {
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (!bypassSecret) return;
  await page.route('**/*.vercel.app/**', async route => {
    await route.continue({
      headers: {
        ...route.request().headers(),
        'x-vercel-protection-bypass': bypassSecret,
      },
    });
  });
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

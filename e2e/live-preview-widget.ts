import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test as base, type BrowserContext, type Page, type Response } from '@playwright/test';

type ExactPreviewWidgetOptions = {
  fixturePath: string;
  expectedSha256: string;
  widgetOrigin: string;
};

type ExactPreviewWidgetFixtures = {
  exactPreviewWidget: void;
};

export const test = base.extend<ExactPreviewWidgetFixtures>({
  exactPreviewWidget: [
    async ({ context }, use) => {
      await installExactPreviewWidgetFromEnvironment(context);
      await use();
    },
    { auto: true },
  ],
});

export async function installExactPreviewWidgetFromEnvironment(
  context: BrowserContext
): Promise<void> {
  const fixturePath = process.env.EXACT_WIDGET_FIXTURE_PATH?.trim();
  const expectedSha256 = process.env.EXPECTED_WIDGET_SHA256?.trim();
  const widgetOrigin = process.env.EXPECTED_WIDGET_ORIGIN?.trim();

  if (!fixturePath && !expectedSha256 && !widgetOrigin) return;
  if (!fixturePath || !expectedSha256 || !widgetOrigin) {
    throw new Error(
      'EXACT_WIDGET_FIXTURE_PATH, EXPECTED_WIDGET_SHA256, and EXPECTED_WIDGET_ORIGIN must be set together'
    );
  }
  await installExactPreviewWidget(context, { fixturePath, expectedSha256, widgetOrigin });
}

export async function installExactPreviewWidget(
  context: BrowserContext,
  options: ExactPreviewWidgetOptions
): Promise<void> {
  const expectedSha256 = requireSha256(options.expectedSha256);
  const widgetOrigin = requireOrigin(options.widgetOrigin);
  const body = await readFile(options.fixturePath);
  const actualSha256 = sha256(body);

  if (actualSha256 !== expectedSha256) {
    throw new Error(
      `Exact preview widget fixture hash is ${actualSha256}, expected ${expectedSha256}`
    );
  }

  await context.route(`${widgetOrigin}/widget.js`, async route => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      headers: {
        'access-control-allow-origin': '*',
        'cache-control': 'no-store',
        'x-bugdrop-widget-sha256': expectedSha256,
      },
      body,
    });
  });
}

export function waitForPreviewWidgetResponse(page: Page, widgetOrigin: string): Promise<Response> {
  const origin = requireOrigin(widgetOrigin);
  return page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.origin === origin && url.pathname === '/widget.js';
  });
}

export async function assertExactPreviewWidgetResponse(
  response: Response,
  expectedSha256: string
): Promise<void> {
  if (!response.ok()) {
    throw new Error(`Preview widget response failed with ${response.status()}`);
  }
  const expected = requireSha256(expectedSha256);
  const actual = sha256(await response.body());
  if (actual !== expected) {
    throw new Error(`Browser loaded preview widget hash ${actual}, expected ${expected}`);
  }
}

export function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function requireOrigin(value: string): string {
  const url = new URL(value);
  if (url.origin !== value) {
    throw new Error(`Expected an origin without a path: ${value}`);
  }
  return url.origin;
}

function requireSha256(value: string): string {
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new Error('Expected a lowercase SHA-256 digest');
  }
  return value;
}

import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import {
  assertExactPreviewWidgetResponse,
  installExactPreviewWidget,
  sha256,
  waitForPreviewWidgetResponse,
} from './live-preview-widget';

const fixturePath = 'test/fixtures/legacy-compat/v1.1.0/widget.js';

test('pins a browser script request to the verified widget fixture', async ({ context, page }) => {
  const widgetOrigin = 'https://unresolvable-preview-widget.invalid';
  const expectedSha256 = sha256(await readFile(fixturePath));
  await installExactPreviewWidget(context, { fixturePath, expectedSha256, widgetOrigin });

  const responsePromise = waitForPreviewWidgetResponse(page, widgetOrigin);
  await page.setContent(
    `<script src="${widgetOrigin}/widget.js" data-repo="mean-weasel/bugdrop-widget-test"></script>`
  );
  const response = await responsePromise;

  await assertExactPreviewWidgetResponse(response, expectedSha256);
  expect(response.headers()['x-bugdrop-widget-sha256']).toBe(expectedSha256);
});

test('rejects a fixture whose bytes do not match the expected deployment hash', async ({
  context,
}) => {
  await expect(
    installExactPreviewWidget(context, {
      fixturePath,
      expectedSha256: '0'.repeat(64),
      widgetOrigin: 'https://unresolvable-preview-widget.invalid',
    })
  ).rejects.toThrow('Exact preview widget fixture hash');
});

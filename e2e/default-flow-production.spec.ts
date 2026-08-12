import { expect, test, type Page } from '@playwright/test';

type FeedbackPayload = Record<string, unknown> & {
  title: string;
  screenshot: string | null;
  metadata: Record<string, unknown> & { viewport?: { width: number; height: number } };
};

type AccessibilityTrace = {
  step: string;
  semanticName?: string | null;
  heading?: string | null;
  focus?: string | null;
  liveRegions?: Array<{ id: string; politeness: string | null }>;
  keyboard?: string;
  mobileBounds?: { x: number; width: number; viewportWidth: number };
  transitionDuration?: string;
};

function host(page: Page) {
  return page.locator('#bugdrop-host');
}

async function waitForWidget(page: Page) {
  await expect(host(page).locator('css=.bd-trigger')).toBeVisible({ timeout: 5000 });
}

test('serves a test-hook-free authoritative artifact with the unchanged API', async ({ page }) => {
  const manifest = await page.request.get('/versions.json').then(response => response.json());
  expect(manifest).toMatchObject({ authoritative: true, mode: 'release', current: '9.9.9' });
  expect((await page.request.get('/static-package.json')).ok()).toBe(true);

  await page.route('**/api/check/**', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ installed: true }),
    })
  );
  await page.goto('/test/');
  await waitForWidget(page);

  expect(
    await page.evaluate(() => ({
      api: Object.keys(window.BugDrop ?? {}).sort(),
      runtimeSelector: (window as Window & { __bugdropDefaultFlowRuntime?: unknown })
        .__bugdropDefaultFlowRuntime,
      captureHook: (window as Window & { __bugdropMockToPng?: unknown }).__bugdropMockToPng,
    }))
  ).toEqual({
    api: [
      'close',
      'hide',
      'isButtonVisible',
      'isOpen',
      'open',
      'registerFlow',
      'registerVariant',
      'setTheme',
      'show',
    ],
    runtimeSelector: undefined,
    captureHook: undefined,
  });
});

test('owns preflight without opening details or submitting', async ({ page }) => {
  let feedbackRequests = 0;
  await page.route('**/api/check/**', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ installed: false, appName: 'production-proof' }),
    })
  );
  await page.route('**/feedback', route => {
    feedbackRequests += 1;
    return route.abort();
  });
  await page.goto('/test/');
  await waitForWidget(page);
  await page.evaluate(() => window.BugDrop?.open());

  await expect(host(page).locator('css=.bd-title')).toHaveText('Install Required');
  await expect(host(page).locator('css=#title')).not.toBeAttached();
  expect(await page.evaluate(() => window.BugDrop?.isOpen())).toBe(true);
  expect(feedbackRequests).toBe(0);
});

test('captures and submits a real screenshot without test hooks or mocked bytes', async ({
  page,
}) => {
  const requests: FeedbackPayload[] = [];
  await page.route('**/api/check/**', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ installed: true }),
    })
  );
  await page.route('**/feedback', async route => {
    requests.push(route.request().postDataJSON() as FeedbackPayload);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        issueNumber: 98,
        issueUrl: 'https://github.com/example/project/issues/98',
        isPublic: false,
      }),
    });
  });
  await page.goto('/test/');
  await waitForWidget(page);
  await page.evaluate(() => window.BugDrop?.open());

  const widget = host(page);
  await widget.locator('css=#title').fill('Real release capture');
  await widget
    .locator('css=#description')
    .fill('Bundled html-to-image capture with no browser test globals');
  await widget.locator('css=#submit-btn').click();
  await widget.locator('css=[data-action="capture"]').click();
  await expect(widget.locator('css=#annotation-canvas canvas')).toBeVisible({ timeout: 15000 });
  expect(
    await page.evaluate(() => ({
      captureHook: (window as Window & { __bugdropMockToPng?: unknown }).__bugdropMockToPng,
      viewportHook: (window as Window & { __bugdropMockViewportCapture?: unknown })
        .__bugdropMockViewportCapture,
    }))
  ).toEqual({ captureHook: undefined, viewportHook: undefined });
  await widget.locator('css=[data-action="done"]').click();
  await expect(widget.locator('css=.bd-success-icon')).toBeVisible({ timeout: 10000 });

  expect(requests).toHaveLength(1);
  expect(requests[0].screenshot).toMatch(/^data:image\/png;base64,/);
  expect(requests[0].screenshot!.length).toBeGreaterThan(1000);
  expect(requests[0].metadata).toMatchObject({
    elementSelector: null,
    fullElementSelector: null,
  });
});

test('normalizes modal, inline, and headless variants without changing their envelope', async ({
  page,
}) => {
  const requests: Array<Record<string, unknown>> = [];
  await page.route('**/api/check/**', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ installed: true }),
    })
  );
  await page.route('**/api/feedback', route => {
    requests.push(route.request().postDataJSON() as Record<string, unknown>);
    const issueNumber = 300 + requests.length;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        issueNumber,
        issueUrl: `https://github.com/mean-weasel/bugdrop-widget-test/issues/${issueNumber}`,
        isPublic: false,
      }),
    });
  });
  await page.goto('/test/?private=redacted#secret');
  await waitForWidget(page);

  await page.evaluate(async () => {
    const inlineConfig = {
      id: 'release-inline',
      presentation: { kind: 'inline' as const },
      content: { title: 'Release inline', submitLabel: 'Send inline' },
      fields: [{ id: 'answer', type: 'shortText' as const, label: 'Inline answer' }],
      issue: { title: 'Inline {{answer}}' },
    };
    const slot = document.createElement('div');
    slot.id = 'release-inline-slot';
    document.body.appendChild(slot);
    window.BugDrop!.registerVariant(inlineConfig).mount(slot);

    await window
      .BugDrop!.registerVariant({
        ...inlineConfig,
        id: 'release-headless',
        issue: { title: 'Headless {{answer}}' },
      })
      .submit(
        { answer: 'exact' },
        { context: { surface: 'release' }, submissionId: 'release-headless-proof' }
      );

    const modal = window.BugDrop!.registerVariant({
      id: 'release-modal',
      presentation: { kind: 'modal', size: 'compact' },
      content: { title: 'Release modal', submitLabel: 'Send modal' },
      fields: [{ id: 'answer', type: 'longText', label: 'Modal answer', required: true }],
      issue: { title: 'Modal {{answer}}' },
    });
    (window as Window & { __openReleaseModal?: () => void }).__openReleaseModal = () => {
      modal.open();
    };
  });

  const inline = page.locator('#release-inline-slot > [data-bugdrop-owned]');
  await inline.getByRole('textbox', { name: 'Inline answer' }).fill('visible');
  await inline.getByRole('button', { name: 'Send inline' }).click();
  await expect(inline.getByRole('heading', { name: 'Thanks for your feedback!' })).toBeVisible();

  await page.evaluate(() => {
    (window as Window & { __openReleaseModal?: () => void }).__openReleaseModal?.();
  });
  const modal = page.locator('body > [data-bugdrop-owned]');
  await expect(modal.getByRole('dialog', { name: 'Release modal' })).toBeVisible();
  await modal.getByRole('textbox', { name: 'Modal answer' }).fill('visible');
  await modal.getByRole('button', { name: 'Send modal' }).click();
  await expect(modal.getByRole('heading', { name: 'Thanks for your feedback!' })).toBeVisible();

  expect(requests).toHaveLength(3);
  for (const request of requests) {
    expect(Object.keys(request).sort()).toEqual([
      'issue',
      'kind',
      'metadata',
      'repo',
      'schemaVersion',
      'submissionId',
      'variantId',
    ]);
    expect(request).toMatchObject({
      kind: 'bugdrop.variant-submission',
      schemaVersion: 1,
      repo: 'mean-weasel/bugdrop-widget-test',
      metadata: { url: 'http://bugdrop.localhost:8787/test/' },
    });
  }
  expect(requests.map(request => request.variantId)).toEqual([
    'release-headless',
    'release-inline',
    'release-modal',
  ]);
  expect(requests[0]).toMatchObject({
    submissionId: 'release-headless-proof',
    issue: { title: 'Headless exact' },
  });
  expect(requests[1]).toMatchObject({ issue: { title: 'Inline visible' } });
  expect(requests[2]).toMatchObject({ issue: { title: 'Modal visible' } });
});

test('records payload and an explicit accessibility, keyboard, mobile, and motion trace', async ({
  page,
}) => {
  const requests: FeedbackPayload[] = [];
  const accessibilityTrace: AccessibilityTrace[] = [];
  await page.setViewportSize({ width: 390, height: 720 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/check/**', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ installed: true }),
    })
  );
  await page.route('**/feedback', async route => {
    requests.push(route.request().postDataJSON() as FeedbackPayload);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        issueNumber: 99,
        issueUrl: 'https://github.com/example/project/issues/99',
        isPublic: false,
      }),
    });
  });
  await page.goto('/test/?showIssueLink=always&showName=true&sendConsoleLogs=true');
  await waitForWidget(page);

  await expect(host(page).locator('css=.bd-trigger')).toHaveAttribute(
    'aria-label',
    'Report a bug or send feedback'
  );
  accessibilityTrace.push({
    step: 'trigger',
    semanticName: await host(page).locator('css=.bd-trigger').getAttribute('aria-label'),
  });
  await page.evaluate(() => window.BugDrop?.open());
  const widget = host(page);
  await expect(widget.locator('css=.bd-title')).toHaveText('Send Feedback');
  await expect(widget.locator('css=label[for="title"]')).toContainText('Title');
  await expect(widget.locator('css=#attachment-list')).toHaveAttribute('aria-live', 'polite');
  accessibilityTrace.push({
    step: 'details',
    heading: await widget.locator('css=.bd-title').textContent(),
    semanticName: await widget.locator('css=label[for="title"]').textContent(),
    liveRegions: await widget.locator('css=[aria-live]').evaluateAll(elements =>
      elements.map(element => ({
        id: element.id,
        politeness: element.getAttribute('aria-live'),
      }))
    ),
  });

  await widget.locator('css=#submit-btn').click();
  const invalidFocus = await widget
    .locator('css=#title')
    .evaluate(element => (element.getRootNode() as ShadowRoot).activeElement?.id ?? null);
  expect(invalidFocus).toBe('title');

  const modalBox = await widget.locator('css=.bd-modal').boundingBox();
  expect(modalBox).not.toBeNull();
  expect(modalBox!.x).toBeGreaterThanOrEqual(0);
  expect(modalBox!.width).toBeLessThanOrEqual(390);
  const transitionDuration = await widget
    .locator('css=.bd-modal')
    .evaluate(element => getComputedStyle(element).transitionDuration);
  expect(transitionDuration).toBe('1e-05s');
  accessibilityTrace.push({
    step: 'invalid-submit',
    focus: invalidFocus,
    mobileBounds: { x: modalBox!.x, width: modalBox!.width, viewportWidth: 390 },
    transitionDuration,
  });

  await widget.locator('css=#title').fill('Production parity');
  await widget.locator('css=#description').fill('Production-built private and fixed proof');
  await widget.locator('css=#name').fill('Release proof');
  await widget.locator('css=#include-screenshot').uncheck();
  await widget.locator('css=#title').press('Enter');
  await expect(widget.locator('css=.bd-success-icon')).toBeVisible();
  await expect(widget.locator('css=.bd-issue-link')).toHaveAttribute(
    'href',
    'https://github.com/example/project/issues/99'
  );
  accessibilityTrace.push({
    step: 'keyboard-success',
    keyboard: 'Enter',
    heading: await widget.locator('css=.bd-title').textContent(),
    semanticName: await widget.locator('css=.bd-issue-link').textContent(),
  });

  expect(accessibilityTrace).toEqual([
    { step: 'trigger', semanticName: 'Report a bug or send feedback' },
    {
      step: 'details',
      heading: 'Send Feedback',
      semanticName: 'Title *',
      liveRegions: [{ id: 'attachment-list', politeness: 'polite' }],
    },
    {
      step: 'invalid-submit',
      focus: 'title',
      mobileBounds: expect.objectContaining({ viewportWidth: 390 }),
      transitionDuration: '1e-05s',
    },
    {
      step: 'keyboard-success',
      keyboard: 'Enter',
      heading: 'Feedback Submitted!',
      semanticName: expect.stringContaining('View on GitHub'),
    },
  ]);

  expect(requests).toHaveLength(1);
  expect(Object.keys(requests[0]).sort()).toEqual([
    'attachments',
    'category',
    'consoleLogs',
    'description',
    'metadata',
    'repo',
    'screenshot',
    'submitter',
    'title',
  ]);
  expect(requests[0]).toMatchObject({
    repo: 'mean-weasel/bugdrop-widget-test',
    title: 'Production parity',
    screenshot: null,
    metadata: { viewport: { width: 390, height: 720 } },
  });
});

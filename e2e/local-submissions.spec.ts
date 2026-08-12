import { expect, test } from '@playwright/test';

function widget(page: import('@playwright/test').Page) {
  return page.locator('#bugdrop-host');
}

function watchForProhibitedRequests(page: import('@playwright/test').Page): string[] {
  const prohibitedRequests: string[] = [];
  page.on('request', request => {
    const url = new URL(request.url());
    const isLocal =
      url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1' ||
      url.hostname.endsWith('.localhost');
    const isGitHub = url.hostname === 'github.com' || url.hostname === 'api.github.com';
    const isFeedbackApi =
      url.pathname.endsWith('/feedback') || url.pathname.includes('/api/check/');
    if (!isLocal && (isGitHub || isFeedbackApi)) {
      prohibitedRequests.push(request.url());
    }
  });
  return prohibitedRequests;
}

test('local QA fails closed when the submissions helper cannot load', async ({ page }) => {
  const escapedRequests: string[] = [];
  const widgetRequests: string[] = [];
  page.on('request', request => {
    const url = request.url();
    if (url.includes('/api/check/') || url.includes('/feedback')) escapedRequests.push(url);
    if (new URL(url).pathname === '/widget.js') widgetRequests.push(url);
  });
  await page.route('**/test/local-submissions.js', route => route.abort());

  await page.goto('/test/?localQa=1');
  await page.waitForTimeout(500);

  await expect(widget(page)).toHaveCount(0);
  expect(widgetRequests).toEqual([]);
  expect(escapedRequests).toEqual([]);
});

test('local QA submissions can be created, viewed, edited, and deleted', async ({ page }) => {
  const prohibitedRequests = watchForProhibitedRequests(page);
  await page.goto('/test/?localQa=1&showName=true&showIssueLink=always');
  await expect(page.getByRole('link', { name: 'Local submissions' })).toBeVisible();

  await widget(page).locator('.bd-trigger').click();
  const getStarted = widget(page).getByRole('button', { name: 'Get Started' });
  await expect(getStarted).toBeVisible();
  await getStarted.click();

  const title = widget(page).getByLabel('Title *', { exact: true });
  await expect(title).toBeVisible();
  await title.fill('Local CRUD submission');
  await widget(page).getByLabel('Description', { exact: true }).fill('Created from the widget.');
  await widget(page).getByLabel('Name', { exact: true }).fill('Local tester');
  await widget(page).getByLabel('📸 Include a screenshot').uncheck();
  await widget(page).getByRole('button', { name: 'Continue' }).click();

  await expect(widget(page).getByRole('heading', { name: 'Feedback Submitted!' })).toBeVisible();
  const localIssueLink = widget(page).getByRole('link', { name: 'View local submission' });
  await expect(localIssueLink).toHaveText('View local submission');
  await expect(localIssueLink).toHaveAttribute('href', /\/test\/submissions\.html\?id=\d+$/);

  const [viewer] = await Promise.all([page.waitForEvent('popup'), localIssueLink.click()]);
  await viewer.waitForLoadState('domcontentloaded');

  await expect(viewer.getByRole('heading', { name: /Submission #\d+/ })).toBeVisible();
  await expect(viewer.getByLabel('Title')).toHaveValue('Local CRUD submission');
  await expect(viewer.getByText('Local CRUD submission', { exact: true })).toBeVisible();

  await viewer.getByLabel('Title').fill('Edited local submission');
  await viewer.getByRole('button', { name: 'Save changes' }).click();
  await expect(viewer.getByRole('status')).toHaveText('Saved.');
  await expect(viewer.getByText('Edited local submission', { exact: true })).toBeVisible();

  await viewer.getByRole('button', { name: 'Delete submission' }).click();
  await expect(viewer.getByText('No local submissions yet.')).toBeVisible();
  await expect(
    viewer.getByText('Select a submission or create one from the widget.')
  ).toBeVisible();
  expect(prohibitedRequests).toEqual([]);
});

test('local QA preserves native fetch pass-through input forms', async ({ page }) => {
  const prohibitedRequests = watchForProhibitedRequests(page);
  const requests: Array<{ url: string; method: string; body: string | null }> = [];
  await page.route('**/test/fetch-passthrough/**', async route => {
    const request = route.request();
    requests.push({
      url: request.url(),
      method: request.method(),
      body: request.postData(),
    });
    await route.fulfill({ status: 204 });
  });

  await page.goto('/test/?localQa=1');
  const origin = new URL(page.url()).origin;
  const statuses = await page.evaluate(async () => {
    const origin = window.location.origin;
    const responses = await Promise.all([
      fetch('/test/fetch-passthrough/string', { method: 'POST', body: 'string-body' }),
      fetch(
        new Request(origin + '/test/fetch-passthrough/request', {
          method: 'POST',
          body: 'request-body',
        })
      ),
      fetch(new URL('/test/fetch-passthrough/url', origin), {
        method: 'POST',
        body: 'url-body',
      }),
    ]);
    return responses.map(response => response.status);
  });

  expect(statuses).toEqual([204, 204, 204]);
  expect(requests).toEqual([
    {
      url: origin + '/test/fetch-passthrough/string',
      method: 'POST',
      body: 'string-body',
    },
    {
      url: origin + '/test/fetch-passthrough/request',
      method: 'POST',
      body: 'request-body',
    },
    {
      url: origin + '/test/fetch-passthrough/url',
      method: 'POST',
      body: 'url-body',
    },
  ]);
  expect(prohibitedRequests).toEqual([]);
});

test('local QA variants submit headlessly and through inline and modal presentations', async ({
  page,
}) => {
  const prohibitedRequests = watchForProhibitedRequests(page);
  await page.goto('/test/?localQa=1');
  await page.waitForFunction(() => Boolean(window.BugDrop?.registerVariant));

  const headlessResult = await page.evaluate(async () => {
    const baseConfig = {
      presentation: { kind: 'inline' as const },
      content: { title: 'Local variant' },
      fields: [{ id: 'answer', type: 'shortText' as const, label: 'Answer', required: true }],
      issue: { title: 'Local {{answer}}' },
    };
    const headless = window.BugDrop!.registerVariant({
      ...baseConfig,
      id: 'local-headless',
    });
    const inline = window.BugDrop!.registerVariant({
      ...baseConfig,
      id: 'local-inline',
      content: { title: 'Local inline', submitLabel: 'Send inline' },
    });
    const inlineSlot = document.createElement('div');
    inlineSlot.id = 'local-inline-slot';
    document.body.appendChild(inlineSlot);
    inline.mount(inlineSlot);

    const modal = window.BugDrop!.registerVariant({
      ...baseConfig,
      id: 'local-modal',
      presentation: { kind: 'modal' as const },
      content: { title: 'Local modal', submitLabel: 'Send modal' },
    });
    (window as Window & { openLocalModal?: () => void }).openLocalModal = () => {
      modal.open();
    };
    return headless.submit(
      { answer: 'headless answer' },
      { submissionId: 'local-headless-submission' }
    );
  });

  expect(headlessResult).toMatchObject({
    issueNumber: expect.any(Number),
    issueUrl: `https://github.com/mean-weasel/bugdrop-widget-test/issues/${headlessResult.issueNumber}`,
    isPublic: true,
  });

  const inline = page.locator('#local-inline-slot > [data-bugdrop-owned]');
  await inline.getByRole('textbox', { name: 'Answer' }).fill('inline answer');
  await inline.getByRole('button', { name: 'Send inline' }).click();
  await expect(inline.getByRole('heading', { name: 'Thanks for your feedback!' })).toBeVisible();
  const inlineLink = inline.getByRole('link', { name: 'View local submission' });
  await expect(inlineLink).toHaveAttribute('href', /\/test\/submissions\.html\?id=\d+$/);

  const [inlineViewer] = await Promise.all([page.waitForEvent('popup'), inlineLink.click()]);
  await inlineViewer.waitForLoadState('domcontentloaded');
  await expect(inlineViewer.locator('#raw-payload')).toContainText('"variantId": "local-inline"');
  await inlineViewer.close();

  await page.evaluate(() => {
    (window as Window & { openLocalModal?: () => void }).openLocalModal?.();
  });
  const modal = page.locator('body > [data-bugdrop-owned]').last();
  await modal.getByRole('textbox', { name: 'Answer' }).fill('modal answer');
  await modal.getByRole('button', { name: 'Send modal' }).click();
  await expect(modal.getByRole('heading', { name: 'Thanks for your feedback!' })).toBeVisible();
  const modalLink = modal.getByRole('link', { name: 'View local submission' });
  await expect(modalLink).toHaveAttribute('href', /\/test\/submissions\.html\?id=\d+$/);

  const [modalViewer] = await Promise.all([page.waitForEvent('popup'), modalLink.click()]);
  await modalViewer.waitForLoadState('domcontentloaded');
  await expect(modalViewer.locator('#raw-payload')).toContainText('"variantId": "local-modal"');
  await modalViewer.close();

  const headlessViewer = await page.context().newPage();
  await headlessViewer.goto(`/test/submissions.html?id=${headlessResult.issueNumber}`);
  await expect(headlessViewer.locator('#raw-payload')).toContainText(
    '"variantId": "local-headless"'
  );
  await expect(headlessViewer.locator('#raw-payload')).toContainText(
    '"submissionId": "local-headless-submission"'
  );
  expect(prohibitedRequests).toEqual([]);
});

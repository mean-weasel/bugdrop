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
    if (!isLocal && (isGitHub || isFeedbackApi)) prohibitedRequests.push(request.url());
  });
  return prohibitedRequests;
}

function watchContextHttpRequests(context: import('@playwright/test').BrowserContext): string[] {
  const prohibitedRequests: string[] = [];
  context.on('request', request => {
    const url = new URL(request.url());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
    const isLocal =
      url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1' ||
      url.hostname.endsWith('.localhost');
    if (!isLocal) prohibitedRequests.push(request.url());
  });
  return prohibitedRequests;
}

async function readRawPayload(viewer: import('@playwright/test').Page) {
  const rawPayload = viewer.locator('#raw-payload');
  let parsedPayload: Record<string, unknown> | undefined;

  await expect
    .poll(async () => {
      const textContent = await rawPayload.textContent();
      try {
        const candidate: unknown = JSON.parse(textContent ?? '');
        if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
          return false;
        }
        parsedPayload = candidate as Record<string, unknown>;
        return true;
      } catch {
        return false;
      }
    })
    .toBe(true);

  if (!parsedPayload) throw new Error('Expected viewer-rendered raw payload JSON');
  return parsedPayload;
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

test('invalid data-app-version warns, omits metadata, and keeps submission available', async ({
  page,
}) => {
  const prohibitedRequests = watchForProhibitedRequests(page);
  const warnings: string[] = [];
  page.on('console', message => {
    if (message.type() === 'warning') warnings.push(message.text());
  });

  await page.goto(`/test/?localQa=1&appVersion=${'v'.repeat(129)}`);
  await page.waitForFunction(() => Boolean(window.BugDrop?.registerVariant));
  const result = await page.evaluate(() => {
    const handle = window.BugDrop!.registerVariant({
      id: 'invalid-app-version',
      presentation: { kind: 'inline' },
      content: { title: 'Invalid application version' },
      fields: [{ id: 'answer', type: 'shortText', label: 'Answer', required: true }],
      issue: { title: 'Invalid application version {{answer}}' },
    });
    return handle.submit(
      { answer: 'still submits' },
      { submissionId: 'invalid-app-version-submission' }
    );
  });

  expect(warnings).toContain(
    '[BugDrop] Invalid data-app-version. Expected 1 to 128 printable characters.'
  );
  const viewer = await page.context().newPage();
  await viewer.goto(`/test/submissions.html?id=${result.issueNumber}`);
  const payload = await readRawPayload(viewer);
  expect(payload.metadata).not.toHaveProperty('appVersion');
  expect(prohibitedRequests).toEqual([]);
  await viewer.close();
});

test('local QA submissions can be created, viewed, edited, and deleted', async ({ page }) => {
  const prohibitedRequests = watchForProhibitedRequests(page);
  await page.goto(
    '/test/?localQa=1&showName=true&showIssueLink=always&appVersion=%20v1.2.3%2Bdesktop%20'
  );
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
  expect(await readRawPayload(viewer)).toMatchObject({
    metadata: { appVersion: 'v1.2.3+desktop' },
  });

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
  await page.goto('/test/?localQa=1&appVersion=%20v1.2.3%2Bdesktop%20');
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
  await page.evaluate(() => {
    const host = document.querySelector('#local-inline-slot > [data-bugdrop-owned]');
    if (!host?.shadowRoot) throw new Error('Expected an open inline variant shadow root');
    const state = {
      activationHref: null as string | null,
      attempted: false,
      mutationTypes: [] as string[],
    };
    (window as Window & { localLinkRace?: typeof state }).localLinkRace = state;
    const observer = new MutationObserver(records => {
      state.mutationTypes.push(...records.map(record => record.type));
      const link = host.shadowRoot?.querySelector<HTMLAnchorElement>('.bdv-success-link');
      if (!link?.hasAttribute('href') || state.attempted) return;
      state.attempted = true;
      window.setTimeout(() => {
        state.activationHref = link.href;
        link.click();
        observer.disconnect();
      }, 0);
    });
    observer.observe(host.shadowRoot, {
      attributes: true,
      attributeFilter: ['href'],
      childList: true,
      subtree: true,
    });
  });
  await inline.getByRole('textbox', { name: 'Answer' }).fill('inline answer');
  const inlineViewerPromise = page.waitForEvent('popup');
  await inline.getByRole('button', { name: 'Send inline' }).click();
  await expect(inline.getByRole('heading', { name: 'Thanks for your feedback!' })).toBeVisible();
  const inlineLink = inline.getByRole('link', { name: 'View local submission' });
  await expect(inlineLink).toHaveAttribute('href', /\/test\/submissions\.html\?id=\d+$/);
  const linkRace = await page.evaluate(
    () => (window as Window & { localLinkRace?: unknown }).localLinkRace
  );
  expect(linkRace).toMatchObject({
    activationHref: expect.stringMatching(/\/test\/submissions\.html\?id=\d+$/),
    attempted: true,
    mutationTypes: expect.arrayContaining(['childList', 'attributes']),
  });

  const inlineViewer = await inlineViewerPromise;
  await inlineViewer.waitForLoadState('domcontentloaded');
  const inlineViewerHostname = new URL(inlineViewer.url()).hostname;
  expect(
    inlineViewerHostname === 'localhost' ||
      inlineViewerHostname === '127.0.0.1' ||
      inlineViewerHostname.endsWith('.localhost')
  ).toBe(true);
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
  await expect(headlessViewer.locator('#raw-payload')).toContainText(
    '"appVersion": "v1.2.3+desktop"'
  );
  expect(prohibitedRequests).toEqual([]);
});

test('public flows submit and can be inspected through isolated local feedback storage', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const prohibitedRequests = watchContextHttpRequests(page.context());
  await page.goto(
    'http://bugdrop.localhost:8787/test/welcome-disabled?localQa=1&showIssueLink=always&font=inherit&appVersion=%20v1.2.3%2Bdesktop%20'
  );
  expect(new URL(page.url()).hostname).toBe('bugdrop.localhost');
  expect(new URL(page.url()).pathname).toBe('/test/welcome-disabled');
  await page.waitForFunction(() => Boolean(window.BugDrop?.registerFlow));
  expect(prohibitedRequests).toEqual([]);
  await page.evaluate(async () => {
    const localStore = (window as Window & { BugDropLocalSubmissions?: { clear(): Promise<void> } })
      .BugDropLocalSubmissions;
    if (!localStore) throw new Error('Expected isolated local submission storage');
    await localStore.clear();
  });

  await page.evaluate(() => {
    window
      .BugDrop!.registerFlow({
        configVersion: 1,
        id: 'local-default-shaped-flow',
        presentation: { kind: 'modal' },
        forms: [
          {
            id: 'details',
            title: 'Tell us what happened',
            fields: [
              { id: 'summary', type: 'shortText', label: 'Title', required: true },
              { id: 'description', type: 'longText', label: 'Description' },
              { id: 'attachments', type: 'attachments', label: 'Attachments' },
              { id: 'send-logs', type: 'checkbox', label: 'Include console logs' },
              { id: 'name', type: 'shortText', label: 'Name' },
              { id: 'email', type: 'shortText', label: 'Email' },
            ],
          },
        ],
        screens: [
          { id: 'welcome', type: 'message', title: 'Share feedback' },
          { id: 'details-screen', type: 'form', form: 'details' },
          { id: 'screenshot', type: 'screenshot', mode: 'optional' },
        ],
        issue: {
          classification: 'bug',
          title: '{{details.summary}}',
          sections: [
            {
              heading: 'Description',
              answer: 'details.description',
              omitWhenEmpty: true,
            },
          ],
        },
        evidence: {
          attachments: 'details.attachments',
          sendConsoleLogs: 'details.send-logs',
          submitter: { name: 'details.name', email: 'details.email' },
        },
      })
      .open();
  });

  const defaultFlow = page.locator('body > [data-bugdrop-flow="local-default-shaped-flow"]');
  await expect(defaultFlow.getByRole('heading', { name: 'Share feedback' })).toBeVisible();
  await defaultFlow.getByRole('button', { name: 'Continue' }).click();
  await defaultFlow.getByLabel('Title').fill('Default-shaped local feedback');
  await defaultFlow.getByLabel('Description').fill('Stored through the legacy feedback recipe.');
  await defaultFlow.getByLabel('Name').fill('Local Flow Tester');
  await defaultFlow.getByLabel('Include console logs').check();
  await page.evaluate(() => console.info('default-shaped flow local audit'));
  await defaultFlow.getByRole('button', { name: 'Continue' }).click();
  await defaultFlow.getByLabel('Include a screenshot', { exact: true }).uncheck();
  await defaultFlow.getByRole('button', { name: 'Submit' }).click();
  await expect(
    defaultFlow.getByRole('heading', { name: 'Thanks for your feedback!' })
  ).toBeVisible();
  const defaultLink = defaultFlow.getByRole('link', { name: 'View local submission' });
  await expect(defaultLink).toHaveAttribute('href', /\/test\/submissions\.html\?id=\d+$/);
  const [defaultViewer] = await Promise.all([page.waitForEvent('popup'), defaultLink.click()]);
  await defaultViewer.waitForLoadState('domcontentloaded');
  expect(new URL(defaultViewer.url()).hostname).toBe('bugdrop.localhost');
  const defaultPayload = await readRawPayload(defaultViewer);
  expect(defaultPayload).toMatchObject({
    repo: 'mean-weasel/bugdrop-widget-test',
    title: 'Default-shaped local feedback',
    description: '## Description\n\nStored through the legacy feedback recipe.',
    category: 'bug',
    screenshot: null,
    attachments: [],
    submitter: { name: 'Local Flow Tester' },
    metadata: {
      appVersion: 'v1.2.3+desktop',
      url: 'http://bugdrop.localhost:8787/test/welcome-disabled',
    },
  });
  expect(defaultPayload.consoleLogs).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ level: 'info', message: 'default-shaped flow local audit' }),
    ])
  );
  expect(defaultPayload.kind).toBeUndefined();
  expect(prohibitedRequests).toEqual([]);
  await defaultViewer.close();
  await defaultFlow.getByRole('button', { name: 'Done' }).click();

  await page.evaluate(() => {
    window
      .BugDrop!.registerFlow({
        configVersion: 1,
        id: 'local-product-triage-flow',
        presentation: { kind: 'modal' },
        forms: [
          {
            id: 'triage',
            title: 'Classify your feedback',
            fields: [
              {
                id: 'kind',
                type: 'singleChoice',
                label: 'Type',
                required: true,
                options: [
                  { value: 'bug', label: 'Bug' },
                  { value: 'idea', label: 'Idea' },
                ],
              },
              { id: 'rating', type: 'rating', label: 'Experience', required: true },
              { id: 'summary', type: 'shortText', label: 'Summary', required: true },
            ],
          },
          {
            id: 'detail',
            title: 'Add diagnostic detail',
            fields: [{ id: 'steps', type: 'longText', label: 'Steps to reproduce' }],
          },
        ],
        screens: [
          { id: 'intro', type: 'message', title: 'Help us prioritize' },
          { id: 'triage-screen', type: 'form', form: 'triage' },
          {
            id: 'detail-screen',
            type: 'form',
            form: 'detail',
            when: {
              any: [
                { answer: 'triage.kind', equals: 'bug' },
                { answer: 'triage.rating', equals: 1 },
              ],
            },
          },
          {
            id: 'screenshot',
            type: 'screenshot',
            mode: 'optional',
            when: {
              any: [
                { answer: 'triage.kind', equals: 'bug' },
                { answer: 'triage.rating', equals: 1 },
              ],
            },
          },
        ],
        issue: {
          classification: 'bug',
          title: '{{triage.summary}}',
          sections: [
            { heading: 'Type', answer: 'triage.kind', format: 'choice' },
            { heading: 'Experience', answer: 'triage.rating', format: 'stars' },
            { heading: 'Steps', answer: 'detail.steps', omitWhenEmpty: true },
          ],
        },
      })
      .open();
  });

  const triageFlow = page.locator('body > [data-bugdrop-flow="local-product-triage-flow"]');
  await triageFlow.getByRole('button', { name: 'Continue' }).click();
  await triageFlow.getByLabel('Bug').click();
  await triageFlow.getByRole('radio', { name: '1 star' }).click();
  await triageFlow.getByLabel('Summary').fill('Initial bug report');
  await triageFlow.getByRole('button', { name: 'Continue' }).click();
  await triageFlow.getByLabel('Steps to reproduce').fill('Hidden stale diagnostic detail');
  await triageFlow.getByRole('button', { name: 'Continue' }).click();
  await triageFlow.getByRole('button', { name: 'Back' }).click();
  await expect(triageFlow.getByLabel('Steps to reproduce')).toHaveValue(
    'Hidden stale diagnostic detail'
  );
  await triageFlow.getByRole('button', { name: 'Back' }).click();
  await expect(triageFlow.getByLabel('Summary')).toHaveValue('Initial bug report');
  await triageFlow.getByLabel('Idea').click();
  await triageFlow.getByRole('radio', { name: '5 stars' }).click();
  await triageFlow.getByLabel('Summary').fill('A different product idea');
  await expect(triageFlow.getByRole('button', { name: 'Submit' })).toBeVisible();
  await triageFlow.getByRole('button', { name: 'Submit' }).click();
  await expect(
    triageFlow.getByRole('heading', { name: 'Thanks for your feedback!' })
  ).toBeVisible();
  const triageLink = triageFlow.getByRole('link', { name: 'View local submission' });
  await expect(triageLink).toHaveAttribute('href', /\/test\/submissions\.html\?id=\d+$/);
  const [triageViewer] = await Promise.all([page.waitForEvent('popup'), triageLink.click()]);
  await triageViewer.waitForLoadState('domcontentloaded');
  expect(new URL(triageViewer.url()).hostname).toBe('bugdrop.localhost');
  const triagePayload = await readRawPayload(triageViewer);
  expect(triagePayload).toMatchObject({
    repo: 'mean-weasel/bugdrop-widget-test',
    title: 'A different product idea',
    description: '## Type\n\nIdea\n\n## Experience\n\n★★★★★ (5/5)',
    category: 'bug',
    screenshot: null,
    attachments: [],
    metadata: { url: 'http://bugdrop.localhost:8787/test/welcome-disabled' },
  });
  expect(triagePayload.description).not.toContain('Hidden stale diagnostic detail');
  expect(triagePayload.kind).toBeUndefined();
  expect(prohibitedRequests).toEqual([]);
  await triageViewer.close();
});

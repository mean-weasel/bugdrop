import { expect, test, type Page } from '@playwright/test';

async function ready(page: Page) {
  await page.route('**/api/check/**', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ installed: true, appName: 'neonwatty-bugdrop' }),
    })
  );
  await page.goto('/test/welcome-disabled.html?private=redacted#secret');
  await expect
    .poll(() => page.evaluate(() => typeof window.BugDrop?.registerFlow))
    .toBe('function');
}

async function register(page: Page) {
  await page.evaluate(() => {
    const opened = window
      .BugDrop!.registerFlow({
        configVersion: 1,
        id: 'public-triage',
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
              { id: 'summary', type: 'shortText', label: 'Summary', required: true },
            ],
          },
          {
            id: 'detail',
            title: 'Describe the bug',
            fields: [{ id: 'description', type: 'longText', label: 'Steps' }],
          },
        ],
        screens: [
          {
            id: 'intro',
            type: 'message',
            title: 'Help us improve',
            when: { context: 'surface', equals: 'browser-test' },
          },
          { id: 'triage-screen', type: 'form', form: 'triage' },
          {
            id: 'detail-screen',
            type: 'form',
            form: 'detail',
            when: { answer: 'triage.kind', equals: 'bug' },
          },
          {
            id: 'screenshot',
            type: 'screenshot',
            mode: 'optional',
            when: { answer: 'triage.kind', equals: 'bug' },
          },
        ],
        issue: {
          classification: 'bug',
          title: '{{triage.summary}}',
          sections: [{ heading: 'Steps', answer: 'detail.description', omitWhenEmpty: true }],
        },
      })
      .open({ context: { surface: 'browser-test' } });
    (window as Window & { __publicFlow?: typeof opened }).__publicFlow = opened;
  });
}

test.describe('public modal FlowConfig V1', () => {
  test('navigates conditionally, retains Back values, submits the legacy recipe, retries, and restores focus', async ({
    page,
  }) => {
    const submissions: Array<Record<string, unknown>> = [];
    let attempt = 0;
    await page.route('**/api/feedback', route => {
      submissions.push(route.request().postDataJSON() as Record<string, unknown>);
      attempt += 1;
      return route.fulfill(
        attempt === 1
          ? {
              status: 500,
              contentType: 'application/json',
              body: JSON.stringify({ error: 'Temporary failure' }),
            }
          : {
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                success: true,
                issueNumber: 44,
                issueUrl: 'https://github.com/mean-weasel/bugdrop-widget-test/issues/44',
                isPublic: false,
              }),
            }
      );
    });
    await ready(page);
    const trigger = page.getByRole('button', { name: /feedback/i });
    await trigger.focus();
    await register(page);
    const host = page.locator('body > [data-bugdrop-flow="public-triage"]');
    await expect(host.getByRole('heading', { name: 'Help us improve' })).toBeVisible();
    await host.getByRole('button', { name: 'Continue' }).click();
    await host.getByLabel('Bug').click();
    await host.getByLabel('Summary').fill('Save crashes');
    await host.getByRole('button', { name: 'Continue' }).click();
    await host.getByLabel('Steps').fill('Click save twice');
    await host.getByRole('button', { name: 'Back' }).click();
    await expect(host.getByLabel('Summary')).toHaveValue('Save crashes');
    await host.getByRole('button', { name: 'Continue' }).click();
    await expect(host.getByLabel('Steps')).toHaveValue('Click save twice');
    await host.getByRole('button', { name: 'Continue' }).click();
    await host.getByLabel('Include a screenshot', { exact: true }).click();
    await host.getByRole('button', { name: 'Submit' }).click();
    await expect(host.getByText('Temporary failure')).toBeVisible();
    await host.getByRole('button', { name: 'Try again' }).click();
    await expect(host.getByRole('heading', { name: 'Thanks for your feedback!' })).toBeVisible();
    expect(submissions).toHaveLength(2);
    expect(submissions[0]).toMatchObject({
      repo: 'mean-weasel/bugdrop-widget-test',
      title: 'Save crashes',
      description: '## Steps\n\nClick save twice',
      screenshot: null,
      attachments: [],
    });
    expect(submissions[0]?.kind).toBeUndefined();
    await host.getByRole('button', { name: 'Done' }).click();
    await expect(trigger).toBeFocused();
  });

  test('clears hidden answers after predicate changes and shares modal ownership', async ({
    page,
  }) => {
    const submissions: Array<Record<string, unknown>> = [];
    await page.route('**/api/feedback', route => {
      submissions.push(route.request().postDataJSON() as Record<string, unknown>);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          issueNumber: 45,
          issueUrl: 'https://github.com/mean-weasel/bugdrop-widget-test/issues/45',
          isPublic: false,
        }),
      });
    });
    await ready(page);
    await register(page);
    const host = page.locator('body > [data-bugdrop-flow="public-triage"]');
    await host.getByRole('button', { name: 'Continue' }).click();
    await host.getByLabel('Bug').click();
    await host.getByLabel('Summary').fill('First');
    await host.getByRole('button', { name: 'Continue' }).click();
    await host.getByLabel('Steps').fill('Secret stale detail');
    await host.getByRole('button', { name: 'Back' }).click();
    await host.getByLabel('Idea').click();
    await host.getByLabel('Summary').fill('Idea title');
    await host.getByRole('button', { name: 'Submit' }).click();
    await expect(host.getByRole('heading', { name: 'Thanks for your feedback!' })).toBeVisible();
    expect(submissions[0]).toMatchObject({ title: 'Idea title', description: '' });
  });

  test('close tears down an in-progress screenshot chooser', async ({ page }) => {
    await ready(page);
    await register(page);
    const host = page.locator('body > [data-bugdrop-flow="public-triage"]');
    await host.getByRole('button', { name: 'Continue' }).click();
    await host.getByLabel('Bug').click();
    await host.getByLabel('Summary').fill('Close capture');
    await host.getByRole('button', { name: 'Continue' }).click();
    await host.getByRole('button', { name: 'Continue' }).click();
    await host.getByRole('button', { name: 'Submit' }).click();
    const chooser = page.locator('#bugdrop-host .bd-overlay');
    await expect(chooser.getByRole('heading', { name: 'Capture Screenshot' })).toBeVisible();
    await page.evaluate(() =>
      (window as Window & { __publicFlow?: { close(): void } }).__publicFlow?.close()
    );
    await expect(host).toHaveCount(0);
    await expect(chooser).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as Window & { __publicFlow?: { result: Promise<unknown> } }).__publicFlow
              ?.result
        )
      )
      .toEqual({ status: 'closed' });
  });
});

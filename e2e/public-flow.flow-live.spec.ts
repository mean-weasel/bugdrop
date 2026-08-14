import { expect, type Page } from '@playwright/test';
import {
  assertExactPreviewWidgetResponse,
  test,
  waitForPreviewWidgetResponse,
} from './live-preview-widget';

const expectedWidgetOrigin = process.env.EXPECTED_WIDGET_ORIGIN;
const expectedWidgetSha256 = process.env.EXPECTED_WIDGET_SHA256;
const venuePath = process.env.LIVE_VENUE_PATH || '/';
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

if (bypassSecret) {
  test.beforeEach(async ({ context }) => {
    await context.route('**/*.vercel.app/**', route =>
      route.continue({
        headers: {
          ...route.request().headers(),
          'x-vercel-protection-bypass': bypassSecret,
        },
      })
    );
  });
}

async function loadFlowWidget(page: Page): Promise<void> {
  const response = expectedWidgetOrigin
    ? waitForPreviewWidgetResponse(page, expectedWidgetOrigin)
    : undefined;
  await page.goto(venuePath);
  await expect
    .poll(() => page.evaluate(() => typeof window.BugDrop?.registerFlow))
    .toBe('function');
  if (response && expectedWidgetSha256) {
    await assertExactPreviewWidgetResponse(await response, expectedWidgetSha256);
  }
}

test('runs a conditional multi-screen FlowConfig through the exact preview widget', async ({
  page,
}) => {
  await page.route('**/api/check/**', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ installed: true, appName: 'neonwatty-bugdrop' }),
    })
  );
  const submissions: Array<Record<string, unknown>> = [];
  await page.route('**/api/feedback', route => {
    submissions.push(route.request().postDataJSON() as Record<string, unknown>);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        issueNumber: 902,
        issueUrl: 'https://github.com/mean-weasel/bugdrop-widget-test/issues/902',
        isPublic: false,
      }),
    });
  });

  await loadFlowWidget(page);
  await page.evaluate(() => {
    window
      .BugDrop!.registerFlow({
        configVersion: 1,
        id: 'merge-queue-composable-flow',
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
            fields: [{ id: 'description', type: 'longText', label: 'Steps', required: true }],
          },
        ],
        screens: [
          { id: 'intro', type: 'message', title: 'Help us improve' },
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
          sections: [{ heading: 'Steps', answer: 'detail.description' }],
        },
      })
      .open();
  });

  const host = page.locator('body > [data-bugdrop-flow="merge-queue-composable-flow"]');
  await expect(host.getByRole('heading', { name: 'Help us improve' })).toBeVisible();
  await host.getByRole('button', { name: 'Continue' }).click();
  await host.getByLabel('Bug').click();
  await host.getByLabel('Summary').fill('Preview flow failure');
  await host.getByRole('button', { name: 'Continue' }).click();
  await host.getByLabel('Steps').fill('Open the preview and submit');
  await host.getByRole('button', { name: 'Continue' }).click();
  await host.getByLabel('Include a screenshot', { exact: true }).uncheck();
  await host.getByRole('button', { name: 'Submit' }).click();
  await expect(host.getByRole('heading', { name: 'Thanks for your feedback!' })).toBeVisible();

  expect(submissions).toHaveLength(1);
  expect(submissions[0]).toMatchObject({
    repo: 'mean-weasel/bugdrop-widget-test',
    title: 'Preview flow failure',
    description: '## Steps\n\nOpen the preview and submit',
    category: 'bug',
    screenshot: null,
    attachments: [],
  });
  expect(submissions[0]?.kind).toBeUndefined();
});

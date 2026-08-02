import { expect, test, type Page } from '@playwright/test';

async function ready(page: Page) {
  await page.goto('/test/welcome-disabled.html?private=redacted#secret');
  await expect
    .poll(() => page.evaluate(() => typeof window.BugDrop?.registerVariant))
    .toBe('function');
}

async function registerProviderQuestion(page: Page) {
  await page.evaluate(() => {
    const cta = document.createElement('button');
    cta.id = 'provider-cta';
    cta.textContent = 'Request a provider';
    document.body.appendChild(cta);
    const handle = window.BugDrop!.registerVariant({
      id: 'provider-question-rendered',
      presentation: { kind: 'modal', size: 'compact' },
      content: {
        title: 'Which cloud provider should we support next?',
        description: 'Tell us what would fit your workflow.',
        submitLabel: 'Send idea',
        cancelLabel: 'Not now',
        successTitle: 'Thanks for the idea!',
      },
      fields: [
        {
          id: 'response',
          type: 'longText',
          label: 'Your answer',
          required: true,
          minLength: 2,
          maxLength: 1000,
        },
      ],
      issue: {
        classification: 'feature',
        title: 'Cloud provider request — {{response}}',
        sections: [
          { heading: 'Requested provider or workflow', field: 'response' },
          { heading: 'Surface', context: 'surface', format: 'code' },
        ],
      },
    });
    cta.addEventListener('click', () => {
      const opened = handle.open({ context: { surface: 'studio-upload' } });
      (window as Window & { __providerOpened?: typeof opened }).__providerOpened = opened;
    });
  });
}

test.describe('rendered CTA modal variant', () => {
  test('creates the exact draft only after explicit Submit and settles submitted', async ({
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
          issueNumber: 206,
          issueUrl: 'https://github.com/mean-weasel/bugdrop-widget-test/issues/206',
          isPublic: true,
        }),
      });
    });
    await ready(page);
    await registerProviderQuestion(page);
    await page.getByRole('button', { name: 'Request a provider' }).click();

    const host = page.locator('body > [data-bugdrop-owned]');
    const dialog = host.getByRole('dialog', {
      name: 'Which cloud provider should we support next?',
    });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    const answer = host.getByRole('textbox', { name: 'Your answer' });
    await expect(answer).toBeFocused();
    await answer.fill('  Oracle Cloud for regulated workloads  ');
    await answer.press('Enter');
    expect(submissions).toHaveLength(0);
    await host.getByRole('button', { name: 'Send idea' }).click();
    await expect(host.getByRole('heading', { name: 'Thanks for the idea!' })).toBeVisible();
    expect(submissions).toHaveLength(1);
    expect(submissions[0]).toMatchObject({
      kind: 'bugdrop.variant-submission',
      schemaVersion: 1,
      repo: 'mean-weasel/bugdrop-widget-test',
      variantId: 'provider-question-rendered',
      issue: {
        title: 'Cloud provider request — Oracle Cloud for regulated workloads',
        classification: 'feature',
        sections: [
          {
            heading: 'Requested provider or workflow',
            value: 'Oracle Cloud for regulated workloads',
            format: 'text',
          },
          { heading: 'Surface', value: 'studio-upload', format: 'code' },
        ],
      },
      metadata: { url: 'http://localhost:8787/test/welcome-disabled' },
    });
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const opened = (
            window as Window & {
              __providerOpened?: { result: Promise<{ status: string }> };
            }
          ).__providerOpened;
          return (await opened?.result)?.status;
        })
      )
      .toBe('submitted');
  });

  test('focuses errors, traps focus, restores focus/scroll, and closes on Escape', async ({
    page,
  }) => {
    await ready(page);
    await registerProviderQuestion(page);
    await page.evaluate(() => {
      document.body.style.overflow = 'clip';
    });
    const cta = page.getByRole('button', { name: 'Request a provider' });
    await cta.click();
    const host = page.locator('body > [data-bugdrop-owned]');
    const answer = host.getByRole('textbox', { name: 'Your answer' });
    await host.getByRole('button', { name: 'Send idea' }).click();
    await expect(answer).toHaveAttribute('aria-invalid', 'true');
    await expect(answer).toBeFocused();
    await host.getByRole('button', { name: 'Not now' }).focus();
    await page.keyboard.press('Tab');
    await expect(host.getByRole('button', { name: 'Close' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(host).toHaveCount(0);
    await expect(cta).toBeFocused();
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('clip');
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const opened = (
            window as Window & {
              __providerOpened?: { result: Promise<{ status: string }> };
            }
          ).__providerOpened;
          return (await opened?.result)?.status;
        })
      )
      .toBe('closed');
  });

  test('follows legacy arbitration in both directions without broadening legacy close', async ({
    page,
  }) => {
    await page.route('**/api/check**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"installed":true}' })
    );
    await ready(page);
    await registerProviderQuestion(page);
    await page.evaluate(() => window.BugDrop!.open());
    const legacyModal = page.locator('#bugdrop-host').locator('css=.bd-modal');
    await expect(legacyModal).toBeVisible();
    const busy = await page.evaluate(async () => {
      const cta = document.getElementById('provider-cta')!;
      cta.click();
      const opened = (
        window as Window & {
          __providerOpened?: { result: Promise<{ status: string }> };
        }
      ).__providerOpened!;
      return (await opened.result).status;
    });
    expect(busy).toBe('busy');
    await expect(page.locator('body > [data-bugdrop-owned]')).toHaveCount(0);
    await expect(legacyModal).toBeVisible();

    await page.evaluate(() => window.BugDrop!.close());
    await page.evaluate(() => document.getElementById('provider-cta')!.click());
    const variantHost = page.locator('body > [data-bugdrop-owned]');
    await expect(variantHost.getByRole('dialog')).toBeVisible();
    await page.evaluate(() => window.BugDrop!.close());
    await expect(variantHost).toHaveCount(1);
    await page.evaluate(() => window.BugDrop!.open());
    await expect(variantHost).toHaveCount(0);
    await expect(legacyModal).toBeVisible();
  });
});

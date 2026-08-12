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

async function openCompactSuggestion(page: Page) {
  await page.evaluate(() => {
    window
      .BugDrop!.registerVariant({
        id: 'compact-suggestion',
        presentation: { kind: 'modal', size: 'default' },
        content: { title: 'Share an idea', submitLabel: 'Submit idea' },
        fields: [
          {
            id: 'summary',
            type: 'shortText',
            label: 'Idea',
            required: true,
            maxLength: 120,
          },
          {
            id: 'detail',
            type: 'longText',
            label: 'How would this help?',
            maxLength: 2_000,
          },
        ],
        issue: {
          classification: 'feature',
          title: '[Idea] {{summary}}',
          sections: [
            { heading: 'Idea', field: 'summary' },
            { heading: 'Why it would help', field: 'detail', omitWhenEmpty: true },
          ],
        },
      })
      .open();
  });
}

async function openTallSuggestion(page: Page) {
  await page.evaluate(() => {
    window
      .BugDrop!.registerVariant({
        id: 'tall-suggestion',
        presentation: { kind: 'modal', size: 'default' },
        content: { title: 'Tall suggestion', submitLabel: 'Send tall suggestion' },
        fields: Array.from({ length: 6 }, (_, index) => ({
          id: `detail-${index + 1}`,
          type: 'longText' as const,
          label: `Detail ${index + 1}`,
          required: index === 0,
        })),
        issue: {
          classification: 'feature',
          title: 'Tall suggestion — {{detail-1}}',
        },
      })
      .open();
  });
}

async function modalGeometry(host: import('@playwright/test').Locator) {
  return host.evaluate(element => {
    const overlay = element.shadowRoot?.querySelector<HTMLElement>('.bdv-overlay');
    const surface = element.shadowRoot?.querySelector<HTMLElement>('.bdv-surface');
    if (!overlay || !surface) throw new Error('Expected rendered modal geometry');
    const overlayRect = overlay.getBoundingClientRect();
    const surfaceRect = surface.getBoundingClientRect();
    const style = getComputedStyle(overlay);
    return {
      overlayTop: overlayRect.top,
      overlayBottom: overlayRect.bottom,
      overlayClientHeight: overlay.clientHeight,
      overlayScrollHeight: overlay.scrollHeight,
      overlayScrollTop: overlay.scrollTop,
      surfaceTop: surfaceRect.top,
      surfaceBottom: surfaceRect.bottom,
      paddingTop: Number.parseFloat(style.paddingTop),
      paddingBottom: Number.parseFloat(style.paddingBottom),
    };
  });
}

test.describe('rendered CTA modal variant', () => {
  for (const viewport of [
    { name: 'desktop', width: 1280, height: 720 },
    { name: 'mobile', width: 375, height: 667 },
  ]) {
    test(`centers short dialogs and makes tall controls ${viewport.name}-actionable`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.route('**/api/feedback', route =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            issueNumber: 207,
            issueUrl: 'https://github.com/mean-weasel/bugdrop-widget-test/issues/207',
            isPublic: false,
          }),
        })
      );
      await ready(page);
      await registerProviderQuestion(page);
      await page.getByRole('button', { name: 'Request a provider' }).click();

      const shortHost = page.locator('body > [data-bugdrop-owned]');
      const short = await modalGeometry(shortHost);
      expect(short.overlayClientHeight).toBe(viewport.height);
      expect(short.overlayScrollHeight).toBe(short.overlayClientHeight);
      expect(Math.abs(short.surfaceTop - (short.overlayBottom - short.surfaceBottom))).toBeLessThan(
        2
      );
      await shortHost.getByRole('button', { name: 'Not now' }).click();

      await openTallSuggestion(page);
      const tallHost = page.locator('body > [data-bugdrop-owned]');
      const firstDetail = tallHost.getByRole('textbox', { name: 'Detail 1' });
      const submit = tallHost.getByRole('button', { name: 'Send tall suggestion' });
      const initial = await modalGeometry(tallHost);
      expect(initial.overlayClientHeight).toBe(viewport.height);
      expect(initial.overlayScrollHeight).toBeGreaterThan(initial.overlayClientHeight);
      expect(initial.surfaceTop - initial.overlayTop).toBeGreaterThanOrEqual(
        initial.paddingTop - 1
      );
      expect(initial.overlayScrollHeight - initial.surfaceBottom).toBeGreaterThanOrEqual(
        initial.paddingBottom - 1
      );

      await firstDetail.fill(`${viewport.name} tall modal`);
      if (viewport.name === 'desktop') {
        await submit.hover();
        const scrolled = await modalGeometry(tallHost);
        expect(scrolled.overlayScrollTop).toBeGreaterThan(0);
        await submit.click();
      } else {
        await expect(firstDetail).toBeFocused();
        for (let index = 0; index < 6; index += 1) await page.keyboard.press('Tab');
        await expect(submit).toBeFocused();
        const submitBox = await submit.boundingBox();
        expect(submitBox).not.toBeNull();
        expect(submitBox!.y).toBeGreaterThanOrEqual(0);
        expect(submitBox!.y + submitBox!.height).toBeLessThanOrEqual(viewport.height);
        const scrolled = await modalGeometry(tallHost);
        expect(scrolled.overlayScrollTop).toBeGreaterThan(0);
        await page.keyboard.press('Enter');
      }
      await expect(
        tallHost.getByRole('heading', { name: 'Thanks for your feedback!' })
      ).toBeVisible();
    });
  }

  test('composes the compact suggestion and intercepts its exact draft', async ({ page }) => {
    const submissions: Array<Record<string, unknown>> = [];
    await page.route('**/api/feedback', route => {
      submissions.push(route.request().postDataJSON() as Record<string, unknown>);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          issueNumber: 205,
          issueUrl: 'https://github.com/mean-weasel/bugdrop-widget-test/issues/205',
          isPublic: false,
        }),
      });
    });
    await ready(page);
    await openCompactSuggestion(page);

    const host = page.locator('body > [data-bugdrop-owned]');
    await expect(host.getByRole('dialog', { name: 'Share an idea' })).toBeVisible();
    const summary = host.getByRole('textbox', { name: 'Idea' });
    await host.getByRole('button', { name: 'Submit idea' }).click();
    await expect(summary).toHaveAttribute('aria-invalid', 'true');
    await expect(summary).toBeFocused();
    expect(submissions).toHaveLength(0);

    await summary.fill('  Add keyboard shortcuts  ');
    await summary.press('Enter');
    expect(submissions).toHaveLength(0);
    await host
      .getByRole('textbox', { name: 'How would this help?' })
      .fill('  They would speed up repeated triage.  ');
    await host.getByRole('button', { name: 'Submit idea' }).click();
    await expect(host.getByRole('heading', { name: 'Thanks for your feedback!' })).toBeVisible();

    expect(submissions).toHaveLength(1);
    expect(submissions[0]).toMatchObject({
      kind: 'bugdrop.variant-submission',
      schemaVersion: 1,
      repo: 'mean-weasel/bugdrop-widget-test',
      variantId: 'compact-suggestion',
      issue: {
        title: '[Idea] Add keyboard shortcuts',
        classification: 'feature',
        sections: [
          { heading: 'Idea', value: 'Add keyboard shortcuts', format: 'text' },
          {
            heading: 'Why it would help',
            value: 'They would speed up repeated triage.',
            format: 'text',
          },
        ],
      },
    });
  });

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

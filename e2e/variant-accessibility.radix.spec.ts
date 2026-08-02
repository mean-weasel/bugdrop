import { expect, test } from '@playwright/test';

test('rating keyboard behavior requires explicit Submit', async ({ page }) => {
  let submissionCount = 0;
  await page.route('**/feedback', route => {
    if (route.request().method() !== 'POST') return route.continue();
    submissionCount += 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        issueNumber: 301,
        issueUrl: 'https://github.com/mean-weasel/bugdrop-widget-test/issues/301',
        isPublic: false,
      }),
    });
  });
  await page.goto('/test/');
  await expect
    .poll(() => page.evaluate(() => typeof window.BugDrop?.registerVariant))
    .toBe('function');
  await page.evaluate(() => {
    const slot = document.createElement('div');
    slot.id = 'cross-browser-rating-slot';
    document.body.appendChild(slot);
    window
      .BugDrop!.registerVariant({
        id: 'cross-browser-rating',
        presentation: { kind: 'inline' },
        content: { title: 'Rate accessibility', submitLabel: 'Submit rating' },
        fields: [{ id: 'rating', type: 'rating', label: 'Rating', required: true, scale: 5 }],
        issue: { title: 'Accessibility rating {{rating}}' },
      })
      .mount(slot);
  });

  const host = page.locator('#cross-browser-rating-slot > [data-bugdrop-owned]');
  const rating = host.getByRole('radiogroup', { name: 'Rating' });
  const submit = host.getByRole('button', { name: 'Submit rating' });
  await submit.click();
  await expect(rating).toHaveAttribute('aria-invalid', 'true');
  const first = rating.getByRole('radio', { name: '1 star' });
  await expect(first).toBeFocused();
  await first.press('ArrowRight');
  const second = rating.getByRole('radio', { name: '2 stars' });
  await expect(second).toBeFocused();
  await expect(second).toHaveAttribute('aria-checked', 'true');
  await second.press('Enter');
  await second.press('Space');
  expect(submissionCount).toBe(0);
  await submit.click();
  await expect(host.getByRole('heading', { name: 'Thanks for your feedback!' })).toBeVisible();
  expect(submissionCount).toBe(1);
});

test('modal focus is contained and Escape restores the host page', async ({ page }) => {
  await page.goto('/test/');
  await expect
    .poll(() => page.evaluate(() => typeof window.BugDrop?.registerVariant))
    .toBe('function');
  await page.evaluate(() => {
    document.body.style.overflow = 'clip';
    const cta = document.createElement('button');
    cta.id = 'cross-browser-modal-cta';
    cta.textContent = 'Open provider question';
    document.body.appendChild(cta);
    const handle = window.BugDrop!.registerVariant({
      id: 'cross-browser-modal',
      presentation: { kind: 'modal', size: 'compact' },
      content: { title: 'Provider question', submitLabel: 'Send', cancelLabel: 'Not now' },
      fields: [{ id: 'response', type: 'longText', label: 'Your answer', required: true }],
      issue: { title: 'Provider {{response}}' },
    });
    cta.addEventListener('click', () => {
      const opened = handle.open();
      opened.result.then(outcome => {
        (
          window as Window & {
            __crossBrowserModalOutcome?: string;
          }
        ).__crossBrowserModalOutcome = outcome.status;
      });
    });
  });

  const cta = page.getByRole('button', { name: 'Open provider question' });
  await cta.focus();
  await page.keyboard.press('Enter');
  const host = page.locator('body > [data-bugdrop-owned]');
  await expect(host.getByRole('dialog', { name: 'Provider question' })).toBeVisible();
  await expect(host.getByRole('textbox', { name: 'Your answer' })).toBeFocused();
  await host.getByRole('button', { name: 'Not now' }).focus();
  await page.keyboard.press('Tab');
  await expect(host.getByRole('button', { name: 'Close' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(host).toHaveCount(0);
  await expect(cta).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('clip');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as Window & { __crossBrowserModalOutcome?: string }).__crossBrowserModalOutcome
      )
    )
    .toBe('closed');
});

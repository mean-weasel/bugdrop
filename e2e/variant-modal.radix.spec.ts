import { expect, test } from '@playwright/test';

test('variant modal remains interactive inside Radix-style host dismissal and focus traps', async ({
  page,
}) => {
  await page.goto('/test/welcome-disabled.html');
  await expect
    .poll(() => page.evaluate(() => typeof window.BugDrop?.registerVariant))
    .toBe('function');
  await page.evaluate(() => {
    const hostDialog = document.createElement('div');
    hostDialog.id = 'host-dialog';
    hostDialog.tabIndex = -1;
    document.body.appendChild(hostDialog);
    hostDialog.focus();
    (window as Window & { __variantHostDismissed?: boolean }).__variantHostDismissed = false;
    document.addEventListener(
      'pointerdown',
      event => {
        const owned = document.querySelector('[data-bugdrop-owned]');
        if (!owned || !event.composedPath().includes(owned)) return;
        const outside = new CustomEvent('dismissableLayer.pointerDownOutside', {
          cancelable: true,
          detail: { originalEvent: event },
        });
        document.dispatchEvent(outside);
        if (!outside.defaultPrevented) {
          (window as Window & { __variantHostDismissed?: boolean }).__variantHostDismissed = true;
        }
      },
      true
    );
    document.addEventListener(
      'focusin',
      event => {
        const owned = document.querySelector('[data-bugdrop-owned]');
        if (owned && event.composedPath().includes(owned)) hostDialog.focus();
      },
      true
    );
    const handle = window.BugDrop!.registerVariant({
      id: 'radix-provider-question',
      presentation: { kind: 'modal', size: 'compact' },
      content: { title: 'Which provider?', submitLabel: 'Send' },
      fields: [{ id: 'response', type: 'longText', label: 'Your answer', required: true }],
      issue: { title: 'Provider {{response}}' },
    });
    handle.open();
  });

  const host = page.locator('body > [data-bugdrop-owned]');
  const answer = host.getByRole('textbox', { name: 'Your answer' });
  await answer.click();
  await answer.fill('OpenStack');
  await expect(answer).toHaveValue('OpenStack');
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).not.toBe('host-dialog');
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as Window & { __variantHostDismissed?: boolean }).__variantHostDismissed
      )
    )
    .toBe(false);
});

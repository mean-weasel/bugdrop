import { expect, type Page } from '@playwright/test';
import { test } from './live-preview-widget';

const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const venuePath = process.env.LIVE_VENUE_PATH || '/';

declare global {
  interface Window {
    BugDrop?: {
      open: () => void;
    };
    __hostModalOpen?: boolean;
    __hostDismissEvents?: string[];
    __hostFocusOutTrapEvents?: string[];
  }
}

if (bypassSecret) {
  test.beforeEach(async ({ context }) => {
    await context.route('**/*.vercel.app/**', async route => {
      await route.continue({
        headers: {
          ...route.request().headers(),
          'x-vercel-protection-bypass': bypassSecret,
        },
      });
    });
  });
}

async function mockInstalledRepo(page: Page): Promise<void> {
  await page.route('**/api/check/**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ installed: true }),
    });
  });
}

async function openFeedbackForm(page: Page) {
  const host = page.locator('#bugdrop-host');
  const triggerLabel = host.locator('css=.bd-trigger-label');
  await expect(triggerLabel).toBeVisible({ timeout: 10_000 });
  await triggerLabel.click();

  const getStartedBtn = host.locator('css=[data-action="continue"]');
  const titleInput = host.locator('css=#title');
  await expect
    .poll(async () => (await getStartedBtn.isVisible()) || (await titleInput.isVisible()), {
      timeout: 5_000,
    })
    .toBe(true);

  if (await getStartedBtn.isVisible()) {
    await getStartedBtn.click();
  }

  await expect(titleInput).toBeVisible({ timeout: 5_000 });
  return host;
}

async function openFeedbackFormWithApi(page: Page) {
  const host = page.locator('#bugdrop-host');
  await expect(host.locator('css=.bd-trigger')).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => page.evaluate(() => typeof window.BugDrop?.open)).toBe('function');

  await page.evaluate(() => {
    window.BugDrop?.open();
  });

  await expect(host.locator('css=#title')).toBeVisible({ timeout: 5_000 });
  return host;
}

async function expectPageResponsive(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<number>(resolve => {
            requestAnimationFrame(timestamp => resolve(timestamp));
          })
      )
    )
    .toBeGreaterThan(0);
}

test.describe('Radix dialog compatibility (Live)', () => {
  test('deployed widget pointer interactions do not dismiss Radix-style host modals', async ({
    page,
  }) => {
    await mockInstalledRepo(page);
    await page.goto(venuePath);
    await page.evaluate(() => {
      window.__hostModalOpen = true;
      window.__hostDismissEvents = [];
      document.body.style.pointerEvents = 'none';

      document.addEventListener(
        'pointerdown',
        event => {
          const host = document.getElementById('bugdrop-host');
          if (!host || !event.composedPath().includes(host)) {
            return;
          }

          for (const eventType of [
            'dismissableLayer.pointerDownOutside',
            'dismissableLayer.interactOutside',
          ]) {
            const outsideEvent = new CustomEvent(eventType, {
              bubbles: true,
              cancelable: true,
              composed: true,
              detail: { originalEvent: event },
            });

            window.__hostDismissEvents?.push(eventType);
            document.dispatchEvent(outsideEvent);

            if (!outsideEvent.defaultPrevented) {
              window.__hostModalOpen = false;
            }
          }
        },
        true
      );
    });

    const host = page.locator('#bugdrop-host');
    await expect(host).toHaveCSS('pointer-events', 'auto');
    await openFeedbackForm(page);
    await expectPageResponsive(page);

    await expect.poll(() => page.evaluate(() => window.__hostModalOpen)).toBe(true);
    await expect
      .poll(() => page.evaluate(() => window.__hostDismissEvents?.length ?? 0))
      .toBeGreaterThanOrEqual(2);

    await page.evaluate(() => {
      window.__hostDismissEvents = [];
    });

    await host.locator('css=#title').click();
    await expectPageResponsive(page);

    await expect.poll(() => page.evaluate(() => window.__hostModalOpen)).toBe(true);
    await expect
      .poll(() => page.evaluate(() => window.__hostDismissEvents))
      .toEqual(['dismissableLayer.pointerDownOutside', 'dismissableLayer.interactOutside']);
  });

  test('deployed widget fields stay editable inside Radix-style focusout traps', async ({
    page,
  }) => {
    await mockInstalledRepo(page);
    await page.goto(venuePath);
    await page.evaluate(() => {
      window.__hostFocusOutTrapEvents = [];

      const hostDialog = document.createElement('div');
      hostDialog.id = 'host-dialog-content';
      hostDialog.innerHTML = '<input id="host-title" aria-label="Host title" />';
      document.body.appendChild(hostDialog);

      const hostTitle = document.getElementById('host-title') as HTMLInputElement;
      document.addEventListener('focusout', event => {
        const relatedTarget = event.relatedTarget as Node | null;
        if (!relatedTarget || hostDialog.contains(relatedTarget)) {
          return;
        }

        window.__hostFocusOutTrapEvents?.push((relatedTarget as Element).id || 'bugdrop-host');
        hostTitle.focus();
      });

      hostTitle.focus();
    });

    const host = await openFeedbackFormWithApi(page);
    await expectPageResponsive(page);

    await page.locator('#host-title').focus();
    const titleInput = host.locator('css=#title');
    await titleInput.focus();
    await expect(titleInput).toBeFocused();
    await titleInput.fill('Live Radix title');
    await expect(titleInput).toHaveValue('Live Radix title');
    await expectPageResponsive(page);

    await page.locator('#host-title').focus();
    const descriptionInput = host.locator('css=#description');
    await descriptionInput.focus();
    await expect(descriptionInput).toBeFocused();
    await descriptionInput.fill('Live Radix description');
    await expect(descriptionInput).toHaveValue('Live Radix description');
    await expectPageResponsive(page);

    await expect.poll(() => page.evaluate(() => window.__hostFocusOutTrapEvents)).toEqual([]);
  });
});

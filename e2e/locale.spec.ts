import { test, expect, type Page } from '@playwright/test';

/**
 * E2E tests for widget localization (data-locale).
 *
 * These tests load /test/ with ?locale=... (mapped to data-locale by the test
 * harness in public/test/index.html), open the widget, and assert on the
 * welcome-screen title inside the shadow DOM — the title is rendered from the
 * active locale dictionary, so it proves the full resolve → setLocale → render
 * chain.
 */

const WELCOME_TITLES = {
  en: 'Share Your Feedback',
  nl: 'Deel uw feedback',
  pl: 'Podziel się opinią',
} as const;

async function openWidget(page: Page, params: Record<string, string> = {}) {
  await page.route('**/api/check**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ installed: true }),
    });
  });

  const qs = new URLSearchParams(params).toString();
  await page.goto(`/test/${qs ? '?' + qs : ''}`);
  // Force the welcome screen so its (translated) title is what opens first.
  await page.evaluate(() =>
    localStorage.removeItem('bugdrop_welcomed_mean-weasel/bugdrop-widget-test')
  );

  const button = page.locator('#bugdrop-host').locator('css=.bd-trigger');
  await expect(button).toBeVisible({ timeout: 5000 });
  await button.evaluate(trigger => {
    if (!(trigger instanceof HTMLElement)) {
      throw new Error('BugDrop trigger not found');
    }
    trigger.click();
  });

  await expect(page.locator('#bugdrop-host').locator('css=.bd-modal')).toHaveCount(1, {
    timeout: 5000,
  });
}

function modalTitle(page: Page) {
  return page.locator('#bugdrop-host').locator('css=.bd-title');
}

test.describe('Widget localization', () => {
  test('defaults to English without data-locale', async ({ page }) => {
    await openWidget(page);
    await expect(modalTitle(page)).toHaveText(WELCOME_TITLES.en);
  });

  test('data-locale="nl" renders the Dutch UI', async ({ page }) => {
    await openWidget(page, { locale: 'nl' });
    await expect(modalTitle(page)).toHaveText(WELCOME_TITLES.nl);
  });

  test('data-locale="pl" renders the Polish UI', async ({ page }) => {
    await openWidget(page, { locale: 'pl' });
    await expect(modalTitle(page)).toHaveText(WELCOME_TITLES.pl);
  });

  test('region subtags resolve to the base language', async ({ page }) => {
    await openWidget(page, { locale: 'nl-NL' });
    await expect(modalTitle(page)).toHaveText(WELCOME_TITLES.nl);
  });

  test('unsupported locale falls back to English and warns', async ({ page }) => {
    const warnings: string[] = [];
    page.on('console', msg => {
      const type = msg.type();
      if (type === 'warning' || type === 'warn') {
        warnings.push(msg.text());
      }
    });

    await openWidget(page, { locale: 'xx' });
    await expect(modalTitle(page)).toHaveText(WELCOME_TITLES.en);
    expect(warnings.some(w => w.includes('[BugDrop] Unsupported data-locale'))).toBe(true);
  });
});

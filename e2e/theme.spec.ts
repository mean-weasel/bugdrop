import { test, expect, type Page } from '@playwright/test';

/**
 * E2E tests for the runtime theme API (window.BugDrop.setTheme).
 *
 * These tests load /test/ with ?theme=... to seed the initial theme via the
 * test harness in public/test/index.html, then exercise the runtime API and
 * assert on the bd-root class list inside the shadow DOM.
 */

type BugDropWindow = Window & {
  BugDrop?: {
    setTheme: (mode: unknown) => void;
  };
};

async function gotoWidget(page: Page, params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString();
  await page.goto(`/test/${qs ? '?' + qs : ''}`);
  // Wait for the widget to install its global API AND mount its root element.
  // `.bd-root` is a layout-only wrapper and may not be visible, so wait for
  // attachment rather than visibility.
  await page.locator('#bugdrop-host').locator('css=.bd-root').waitFor({ state: 'attached' });
  await page.waitForFunction(() => (window as BugDropWindow).BugDrop != null);
}

async function rootClassList(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const host = document.getElementById('bugdrop-host');
    const shadow = host?.shadowRoot;
    const root = shadow?.querySelector('.bd-root') as HTMLElement | null;
    return root ? Array.from(root.classList) : [];
  });
}

test.describe('Runtime theme switching', () => {
  test('setTheme("dark") adds bd-dark to the root', async ({ page }) => {
    await gotoWidget(page, { theme: 'light' });
    expect(await rootClassList(page)).not.toContain('bd-dark');

    await page.evaluate(() => {
      (window as BugDropWindow).BugDrop!.setTheme('dark');
    });

    expect(await rootClassList(page)).toContain('bd-dark');
  });

  test('setTheme("light") removes bd-dark from the root', async ({ page }) => {
    await gotoWidget(page, { theme: 'dark' });
    expect(await rootClassList(page)).toContain('bd-dark');

    await page.evaluate(() => {
      (window as BugDropWindow).BugDrop!.setTheme('light');
    });

    expect(await rootClassList(page)).not.toContain('bd-dark');
  });

  test('setTheme("blue") warns and does not change the class', async ({ page }) => {
    const warnings: string[] = [];
    page.on('console', msg => {
      const type = msg.type();
      if (type === 'warning' || type === 'warn') {
        warnings.push(msg.text());
      }
    });

    await gotoWidget(page, { theme: 'light' });
    expect(await rootClassList(page)).not.toContain('bd-dark');

    await page.evaluate(() => {
      // Deliberately invalid runtime input.
      (window as BugDropWindow).BugDrop!.setTheme('blue');
    });

    expect(await rootClassList(page)).not.toContain('bd-dark');
    expect(warnings.some(w => w.includes('[BugDrop] Invalid theme'))).toBe(true);
  });

  test('auto mode follows OS theme changes via page.emulateMedia', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await gotoWidget(page, { theme: 'auto' });
    expect(await rootClassList(page)).not.toContain('bd-dark');

    await page.emulateMedia({ colorScheme: 'dark' });
    // Give the matchMedia change event a tick to propagate
    await page.waitForFunction(() => {
      const host = document.getElementById('bugdrop-host') as HTMLElement | null;
      const root = host?.shadowRoot?.querySelector('.bd-root') as HTMLElement | null;
      return root?.classList.contains('bd-dark') === true;
    });
    expect(await rootClassList(page)).toContain('bd-dark');
  });

  test('setTheme("auto") resolves to current emulated OS theme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await gotoWidget(page, { theme: 'light' });
    expect(await rootClassList(page)).not.toContain('bd-dark');
    await page.evaluate(() => (window as BugDropWindow).BugDrop!.setTheme('auto'));
    expect(await rootClassList(page)).toContain('bd-dark');
  });

  test('bgColor + setTheme re-derives --bd-bg-secondary via color-mix', async ({ page }) => {
    await gotoWidget(page, { theme: 'light', bg: '#fffef0' });

    const readSecondary = () =>
      page.evaluate(() => {
        const host = document.getElementById('bugdrop-host') as HTMLElement | null;
        const root = host?.shadowRoot?.querySelector('.bd-root') as HTMLElement | null;
        return root?.style.getPropertyValue('--bd-bg-secondary') ?? '';
      });

    const lightValue = await readSecondary();
    expect(lightValue).toContain('black'); // light-mode mix

    await page.evaluate(() => (window as BugDropWindow).BugDrop!.setTheme('dark'));
    const darkValue = await readSecondary();
    expect(darkValue).toContain('white'); // dark-mode mix
    expect(darkValue).not.toBe(lightValue);
  });

  test('explicit setTheme("light") resists subsequent OS theme flip to dark', async ({ page }) => {
    // Gate-behavior proof: when the host has explicitly chosen a mode via
    // setTheme, the matchMedia listener must NOT stomp that choice when the
    // OS theme flips.
    await page.emulateMedia({ colorScheme: 'light' });
    await gotoWidget(page, { theme: 'auto' });
    expect(await rootClassList(page)).not.toContain('bd-dark');

    // Lock in explicit light mode.
    await page.evaluate(() => (window as BugDropWindow).BugDrop!.setTheme('light'));
    expect(await rootClassList(page)).not.toContain('bd-dark');

    // Now flip the OS to dark. The listener fires but the gate should block it.
    await page.emulateMedia({ colorScheme: 'dark' });
    // Give the matchMedia change event a moment to propagate — we expect
    // the class to still be light, so use a small timeout instead of waitForFunction.
    await page.waitForTimeout(100);
    expect(await rootClassList(page)).not.toContain('bd-dark');
  });

  test('auto mode + bgColor re-derives --bd-bg-secondary on OS theme flip', async ({ page }) => {
    // Integration: auto mode + custom bgColor. When the OS theme flips, the
    // matchMedia listener must call BOTH applyThemeClass (flip bd-dark) AND
    // applyCustomStyles (re-derive --bd-bg-secondary via color-mix with the
    // new theme's mix target). Exercises the full callback in Task 11.
    await page.emulateMedia({ colorScheme: 'light' });
    await gotoWidget(page, { theme: 'auto', bg: '#fffef0' });

    const readSecondary = () =>
      page.evaluate(() => {
        const host = document.getElementById('bugdrop-host') as HTMLElement | null;
        const root = host?.shadowRoot?.querySelector('.bd-root') as HTMLElement | null;
        return root?.style.getPropertyValue('--bd-bg-secondary') ?? '';
      });

    const lightValue = await readSecondary();
    expect(lightValue).toContain('black'); // light-mode mix

    await page.emulateMedia({ colorScheme: 'dark' });
    // Wait for the class flip to confirm the listener fired.
    await page.waitForFunction(() => {
      const host = document.getElementById('bugdrop-host') as HTMLElement | null;
      const root = host?.shadowRoot?.querySelector('.bd-root') as HTMLElement | null;
      return root?.classList.contains('bd-dark') === true;
    });

    const darkValue = await readSecondary();
    expect(darkValue).toContain('white'); // dark-mode mix re-derived
    expect(darkValue).not.toBe(lightValue);
  });
});

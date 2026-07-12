import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

/**
 * E2E coverage for the multi-tenant embed loader (`/t/:key.js`) and the per-tenant
 * API enforcement layer (`/api/t/:key/*`) — contract docs/plans/multi-tenant-embed.md,
 * card M1-04.
 *
 * The admin-seeded tests below create/delete a real tenant through the admin CRUD API
 * (src/routes/admin.ts) against the running `wrangler dev` server, so they need the
 * same ADMIN_TOKEN the dev server was started with. That value lives in the
 * developer's local, gitignored `.dev.vars` (see `.dev.vars.example`) — it is read
 * straight from disk here instead of requiring a second, easy-to-forget copy in the
 * shell environment. CI runs `wrangler dev` with no `.dev.vars` at all, so
 * ADMIN_TOKEN is unset there and every admin-seeded test skips itself (mirroring how
 * GitHub-credential-dependent assertions already degrade gracefully elsewhere in this
 * suite, e.g. e2e/api.spec.ts's `expect([403, 500])`), while the legacy-embed
 * regression guard below still runs unconditionally.
 */
function readAdminTokenFromDevVars(): string | undefined {
  let content: string;
  try {
    content = readFileSync(join(process.cwd(), '.dev.vars'), 'utf8');
  } catch {
    return undefined;
  }
  const match = content.match(/^ADMIN_TOKEN\s*=\s*(.+?)\s*$/m);
  if (!match) return undefined;
  const value = match[1].trim().replace(/^['"]|['"]$/g, '');
  return value.length > 0 ? value : undefined;
}

const ADMIN_TOKEN = readAdminTokenFromDevVars();
const TEST_THEME_COLOR = '#2563eb';

function randomSuffix(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function randomTenantKey(): string {
  return `e2e-${randomSuffix()}`;
}

function randomRepo(): string {
  return `bugdrop-e2e/${randomSuffix()}`;
}

function requireBaseUrl(baseURL: string | undefined): string {
  if (!baseURL) {
    throw new Error('playwright.config baseURL is required for multi-tenant E2E coverage');
  }
  return new URL(baseURL).origin;
}

interface TenantSeed {
  key: string;
  repo: string;
  origins: string[];
  theme?: Record<string, unknown>;
}

async function createTenant(request: APIRequestContext, seed: TenantSeed): Promise<void> {
  const res = await request.post('/api/admin/tenants', {
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    data: {
      key: seed.key,
      name: `E2E tenant ${seed.key}`,
      repo: seed.repo,
      origins: seed.origins,
      status: 'active',
      ...(seed.theme ? { theme: seed.theme } : {}),
    },
  });
  expect(res.ok(), `create tenant failed: ${res.status()} ${await res.text()}`).toBeTruthy();
}

async function deleteTenant(request: APIRequestContext, key: string): Promise<void> {
  await request.delete(`/api/admin/tenants/${key}`, {
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
  });
}

/**
 * Navigates to a same-origin document with no widget pre-loaded, then injects the
 * tenant loader script (`/t/{key}.js`) exactly as a customer's page tag would —
 * proving the loader (not a hand-written data-tenant fixture) drives the boot.
 */
async function loadTenantEmbed(page: Page, key: string): Promise<void> {
  await page.goto('/api/health');
  await page.setContent('<!DOCTYPE html><html><head></head><body></body></html>');
  await page.addScriptTag({ url: `/t/${key}.js` });
}

function widgetHost(page: Page) {
  return page.locator('#bugdrop-host');
}

function widgetTrigger(page: Page) {
  return widgetHost(page).locator('css=.bd-trigger');
}

function rootPrimaryColor(page: Page): Promise<string> {
  return page.evaluate(() => {
    const host = document.getElementById('bugdrop-host');
    const root = host?.shadowRoot?.querySelector('.bd-root') as HTMLElement | null;
    return root?.style.getPropertyValue('--bd-primary') ?? '';
  });
}

test.describe('Multi-tenant embed (M1-04)', () => {
  test.beforeEach(() => {
    test.skip(
      !ADMIN_TOKEN,
      'ADMIN_TOKEN not set in .dev.vars — see .dev.vars.example to enable multi-tenant admin-seeded E2E coverage locally.'
    );
  });

  test('widget renders the tenant theme color and opens the feedback modal', async ({
    page,
    request,
    baseURL,
  }) => {
    const key = randomTenantKey();
    const origin = requireBaseUrl(baseURL);
    await createTenant(request, {
      key,
      repo: randomRepo(),
      origins: [origin],
      theme: { color: TEST_THEME_COLOR },
    });

    try {
      await loadTenantEmbed(page, key);

      const trigger = widgetTrigger(page);
      await expect(trigger).toBeVisible({ timeout: 5000 });
      expect(await rootPrimaryColor(page)).toBe(TEST_THEME_COLOR);

      await trigger.click();
      await expect(widgetHost(page).locator('css=.bd-modal')).toBeVisible({ timeout: 5000 });
    } finally {
      await deleteTenant(request, key);
    }
  });

  test('feedback submission POSTs to the tenant-scoped endpoint and succeeds', async ({
    page,
    request,
    baseURL,
  }) => {
    const key = randomTenantKey();
    const repo = randomRepo();
    const origin = requireBaseUrl(baseURL);
    await createTenant(request, { key, repo, origins: [origin] });

    try {
      const payloads: Array<Record<string, unknown>> = [];
      await page.route(`**/api/t/${key}/check/**`, route =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ installed: true }),
        })
      );
      await page.route(`**/api/t/${key}/feedback`, async route => {
        payloads.push(route.request().postDataJSON());
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, issueNumber: 1, issueUrl: '#', isPublic: false }),
        });
      });

      await loadTenantEmbed(page, key);
      const host = widgetHost(page);
      const trigger = widgetTrigger(page);
      await expect(trigger).toBeVisible({ timeout: 5000 });
      await trigger.click();

      const getStartedBtn = host.locator('css=[data-action="continue"]');
      await expect(getStartedBtn).toBeVisible({ timeout: 5000 });
      await getStartedBtn.click();

      await host.locator('css=#title').fill('Multi-tenant E2E feedback');
      await host.locator('css=#include-screenshot').uncheck();
      await host.locator('css=#submit-btn').click();

      await expect(host.locator('css=.bd-success-icon')).toBeVisible({ timeout: 10000 });
      expect(payloads).toHaveLength(1);
      expect(payloads[0].repo).toBe(repo);
    } finally {
      await deleteTenant(request, key);
    }
  });

  test('a disallowed Origin is rejected 403; the tenant origin reaches the real handler', async ({
    request,
  }) => {
    // Deliberately NOT baseURL's own origin: wrangler dev's local proxy rewrites an
    // incoming Origin header that literally matches its own bind address
    // (http://localhost:8787) to the zone_name from wrangler.toml's `routes` before
    // the Worker ever sees it — a dev-only quirk, verified by hand against the real
    // server, unrelated to src/routes/tenantApi.ts's origin check. An arbitrary
    // synthetic origin sidesteps that rewrite and still exercises the same
    // `tenant.origins.includes(origin)` code path faithfully.
    const allowedOrigin = 'https://allowed.bugdrop-e2e.test';
    const key = randomTenantKey();
    const repo = randomRepo();
    await createTenant(request, { key, repo, origins: [allowedOrigin] });

    try {
      const denied = await request.post(`/api/t/${key}/feedback`, {
        headers: { Origin: 'https://evil.example.test', 'Content-Type': 'application/json' },
        data: { repo, title: 'should be rejected' },
      });
      expect(denied.status()).toBe(403);
      const deniedBody = await denied.json();
      expect(deniedBody.error).toContain('Origin not allowed');

      // Same tenant, allowed Origin, deliberately invalid body (missing required
      // fields): a 400 (not 403/CORS-blocked) proves this request cleared the origin
      // gate and reached handleFeedbackRequest's own validation.
      const allowed = await request.post(`/api/t/${key}/feedback`, {
        headers: { Origin: allowedOrigin, 'Content-Type': 'application/json' },
        data: {},
      });
      expect(allowed.status()).toBe(400);
    } finally {
      await deleteTenant(request, key);
    }
  });
});

test.describe('Legacy embed regression guard (M1-04)', () => {
  // Runs unconditionally (no ADMIN_TOKEN needed): proves the new /api/t/:key mount
  // (registered before /api in src/index.ts, see the mount-order note atop
  // src/routes/tenantApi.ts) did not change where the legacy embed's feedback
  // submission lands.
  test('legacy embed (no data-tenant) still posts to /api/feedback, not a tenant-scoped path', async ({
    page,
  }) => {
    const requestPaths: string[] = [];
    await page.route('**/feedback', async route => {
      requestPaths.push(new URL(route.request().url()).pathname);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, issueNumber: 1, issueUrl: '#', isPublic: false }),
      });
    });
    await page.route('**/api/check**', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ installed: true }),
      })
    );

    await page.goto('/test/');
    const scriptTag = page.locator('script[src="/widget.js"]');
    await expect(scriptTag).toBeAttached();
    expect(
      await scriptTag.evaluate(el => (el as HTMLScriptElement).dataset.tenant)
    ).toBeUndefined();

    const host = widgetHost(page);
    await widgetTrigger(page).click();
    await host.locator('css=[data-action="continue"]').click();
    await host.locator('css=#title').fill('Legacy embed regression guard');
    await host.locator('css=#include-screenshot').uncheck();
    await host.locator('css=#submit-btn').click();

    await expect(host.locator('css=.bd-success-icon')).toBeVisible({ timeout: 10000 });
    expect(requestPaths).toEqual(['/api/feedback']);
  });
});

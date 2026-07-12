import { describe, expect, it, beforeEach } from 'vitest';
import loader from '../src/routes/loader';
import { tenantToDataAttributes, type TenantConfig } from '../src/lib/tenants';
import type { Env } from '../src/types';

function storedTenant(overrides: Partial<TenantConfig> = {}): TenantConfig {
  return {
    version: 1,
    key: 'acme',
    name: 'Acme Corp',
    repo: 'acme/widget',
    origins: ['https://app.acme.com'],
    status: 'active',
    theme: { color: '#111827', position: 'bottom-left' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('loader route', () => {
  let store: Map<string, string>;
  let env: Env;

  beforeEach(() => {
    store = new Map();
    const mockKv = {
      get: async (key: string) => store.get(key) ?? null,
      put: async (key: string, value: string) => {
        store.set(key, value);
      },
      delete: async (key: string) => {
        store.delete(key);
      },
      list: async ({ prefix }: { prefix: string }) => ({
        keys: [...store.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })),
        list_complete: true,
        cursor: '',
      }),
    };
    env = {
      TENANTS: mockKv as unknown as KVNamespace,
      GITHUB_APP_ID: 'test',
      GITHUB_PRIVATE_KEY: 'test',
      ENVIRONMENT: 'test',
      ALLOWED_ORIGINS: '*',
      GITHUB_APP_NAME: 'test',
      MAX_SCREENSHOT_SIZE_MB: '5',
      ASSETS: {} as Fetcher,
    } as Env;
  });

  async function putTenant(tenant: TenantConfig): Promise<void> {
    store.set(`tenant:${tenant.key}`, JSON.stringify(tenant));
  }

  function req(path: string): Request {
    return new Request(`http://localhost${path}`);
  }

  it('serves the correct headers (D9)', async () => {
    await putTenant(storedTenant());
    const res = await loader.fetch(req('/acme.js'), env);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/javascript; charset=utf-8');
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=300');
  });

  it('includes a double-injection guard keyed on the tenant key', async () => {
    await putTenant(storedTenant());
    const body = await (await loader.fetch(req('/acme.js'), env)).text();
    expect(body).toContain('__bugdropLoaded_acme');
    expect(body).toContain('if (window[GUARD]) return;');
    expect(body).toContain('window[GUARD] = true;');
  });

  it('points the injected script at /widget.v1.js with data-tenant', async () => {
    await putTenant(storedTenant());
    const body = await (await loader.fetch(req('/acme.js'), env)).text();
    expect(body).toContain('s.src = "/widget.v1.js";');
    expect(body).toContain('s.setAttribute("data-tenant", TENANT_KEY);');
    expect(body).toContain('var TENANT_KEY = "acme";');
  });

  it('embeds an attribute map matching tenantToDataAttributes, via JSON.stringify', async () => {
    const tenant = storedTenant();
    await putTenant(tenant);
    const body = await (await loader.fetch(req('/acme.js'), env)).text();
    const expectedAttrs = tenantToDataAttributes(tenant);
    expect(body).toContain(`var ATTRS = ${JSON.stringify(expectedAttrs)};`);
  });

  it('returns a 200 warn-only body for an unknown tenant (D10)', async () => {
    const res = await loader.fetch(req('/ghost.js'), env);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('console.warn(');
    expect(body).toContain('unknown tenant key: ghost');
    expect(body).not.toContain('widget.v1.js');
  });

  it('returns a 200 warn-only body for a paused tenant (D4/D10)', async () => {
    await putTenant(storedTenant({ status: 'paused' }));
    const res = await loader.fetch(req('/acme.js'), env);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('console.warn(');
    expect(body).toContain('tenant is paused: acme');
    expect(body).not.toContain('widget.v1.js');
  });

  it('still applies the loader headers on unknown/paused responses', async () => {
    const res = await loader.fetch(req('/ghost.js'), env);
    expect(res.headers.get('Content-Type')).toBe('application/javascript; charset=utf-8');
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=300');
  });
});

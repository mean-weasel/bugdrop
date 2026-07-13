import { describe, expect, it, beforeEach } from 'vitest';
import admin from '../src/routes/admin';
import type { Env } from '../src/types';
import type { TenantConfig } from '../src/lib/tenants';

function validTenantInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    key: 'acme',
    name: 'Acme Corp',
    repo: 'acme/widget',
    origins: ['https://app.acme.com'],
    status: 'active',
    ...overrides,
  };
}

function storedTenant(overrides: Partial<TenantConfig> = {}): TenantConfig {
  return {
    version: 1,
    key: 'acme',
    name: 'Acme Corp',
    repo: 'acme/widget',
    origins: ['https://app.acme.com'],
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('admin routes', () => {
  let mockKv: {
    get: (key: string) => Promise<string | null>;
    put: (key: string, value: string) => Promise<void>;
    delete: (key: string) => Promise<void>;
    list: (opts: { prefix: string }) => Promise<{
      keys: { name: string }[];
      list_complete: boolean;
      cursor: string;
    }>;
  };
  let store: Map<string, string>;
  let env: Env;

  beforeEach(() => {
    store = new Map();
    mockKv = {
      get: async key => store.get(key) ?? null,
      put: async (key, value) => {
        store.set(key, value);
      },
      delete: async key => {
        store.delete(key);
      },
      list: async ({ prefix }) => ({
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
      ADMIN_TOKEN: 'super-secret-admin-token',
    } as Env;
  });

  function req(
    path: string,
    init: RequestInit = {},
    token: string | null | undefined = env.ADMIN_TOKEN
  ): Request {
    const headers = new Headers(init.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (init.body) headers.set('Content-Type', 'application/json');
    return new Request(`http://localhost${path}`, { ...init, headers });
  }

  describe('authz', () => {
    it('returns 503 on every route when ADMIN_TOKEN is not configured', async () => {
      const noTokenEnv = { ...env, ADMIN_TOKEN: undefined };
      const res = await admin.fetch(req('/tenants', {}, null), noTokenEnv);
      expect(res.status).toBe(503);
    });

    it('returns 401 when no Authorization header is sent', async () => {
      const res = await admin.fetch(req('/tenants', {}, null), env);
      expect(res.status).toBe(401);
    });

    it('returns 401 when the token is wrong', async () => {
      const res = await admin.fetch(req('/tenants', {}, 'wrong-token'), env);
      expect(res.status).toBe(401);
    });

    it('returns 200 when the token is correct', async () => {
      const res = await admin.fetch(req('/tenants'), env);
      expect(res.status).toBe(200);
    });

    it('returns 503 when the TENANTS binding is not configured (FIX 4)', async () => {
      const { TENANTS: _unused, ...envWithoutTenants } = env;
      const res = await admin.fetch(req('/tenants'), envWithoutTenants as Env);
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: 'Tenant storage is not configured' });
    });
  });

  describe('CRUD round-trip', () => {
    it('creates, reads, updates, lists and deletes a tenant', async () => {
      const createRes = await admin.fetch(
        req('/tenants', { method: 'POST', body: JSON.stringify(validTenantInput()) }),
        env
      );
      expect(createRes.status).toBe(201);
      const created = (await createRes.json()) as TenantConfig;
      expect(created.key).toBe('acme');
      expect(created.version).toBe(1);
      expect(created.createdAt).toBeTruthy();
      expect(created.updatedAt).toBe(created.createdAt);

      const getRes = await admin.fetch(req('/tenants/acme'), env);
      expect(getRes.status).toBe(200);
      expect(await getRes.json()).toEqual(created);

      const listRes = await admin.fetch(req('/tenants'), env);
      expect(listRes.status).toBe(200);
      expect(await listRes.json()).toEqual({ tenants: [{ key: 'acme', name: 'Acme Corp' }] });

      const putRes = await admin.fetch(
        req('/tenants/acme', {
          method: 'PUT',
          body: JSON.stringify(validTenantInput({ name: 'Acme Corp Updated' })),
        }),
        env
      );
      expect(putRes.status).toBe(200);
      const updated = (await putRes.json()) as TenantConfig;
      expect(updated.name).toBe('Acme Corp Updated');
      expect(updated.createdAt).toBe(created.createdAt);

      const deleteRes = await admin.fetch(req('/tenants/acme', { method: 'DELETE' }), env);
      expect(deleteRes.status).toBe(204);

      const getAfterDeleteRes = await admin.fetch(req('/tenants/acme'), env);
      expect(getAfterDeleteRes.status).toBe(404);
    });

    it('returns 404 for GET on an unknown tenant', async () => {
      const res = await admin.fetch(req('/tenants/ghost'), env);
      expect(res.status).toBe(404);
    });

    it('returns 404 for PUT on an unknown tenant', async () => {
      const res = await admin.fetch(
        req('/tenants/ghost', { method: 'PUT', body: JSON.stringify(validTenantInput()) }),
        env
      );
      expect(res.status).toBe(404);
    });

    it('returns 404 for DELETE on an unknown tenant', async () => {
      const res = await admin.fetch(req('/tenants/ghost', { method: 'DELETE' }), env);
      expect(res.status).toBe(404);
    });

    it('returns 409 when creating a tenant whose key already exists', async () => {
      await store.set('tenant:acme', JSON.stringify(storedTenant()));

      const res = await admin.fetch(
        req('/tenants', { method: 'POST', body: JSON.stringify(validTenantInput()) }),
        env
      );
      expect(res.status).toBe(409);
    });
  });

  describe('validation errors', () => {
    it('returns 400 with errors for an invalid POST body', async () => {
      const res = await admin.fetch(
        req('/tenants', { method: 'POST', body: JSON.stringify({ key: 'acme' }) }),
        env
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as { errors: string[] };
      expect(body.errors.length).toBeGreaterThan(0);
    });

    it('returns 400 for malformed JSON', async () => {
      const res = await admin.fetch(req('/tenants', { method: 'POST', body: '{not json' }), env);
      expect(res.status).toBe(400);
    });

    it('returns 400 when PUT body key does not match the path key', async () => {
      store.set('tenant:acme', JSON.stringify(storedTenant()));

      const res = await admin.fetch(
        req('/tenants/acme', {
          method: 'PUT',
          body: JSON.stringify(validTenantInput({ key: 'other' })),
        }),
        env
      );
      expect(res.status).toBe(400);
    });

    it('rejects unknown fields', async () => {
      const res = await admin.fetch(
        req('/tenants', {
          method: 'POST',
          body: JSON.stringify(validTenantInput({ notARealField: true })),
        }),
        env
      );
      expect(res.status).toBe(400);
    });
  });

  describe('write-only authTokenSecret (D5/M2-01)', () => {
    const KEK = Buffer.alloc(32, 3).toString('base64');

    it('wraps the plaintext into an envelope, stores it, and masks responses', async () => {
      const kekEnv = { ...env, BUGDROP_KEK: KEK } as Env;
      const res = await admin.fetch(
        req('/tenants', {
          method: 'POST',
          body: JSON.stringify(validTenantInput({ authTokenSecret: 'my-plaintext-widget-secret' })),
        }),
        kekEnv
      );
      expect(res.status).toBe(201);
      const created = (await res.json()) as Record<string, unknown>;
      expect(created.hasAuthTokenSecret).toBe(true);
      expect(created.authTokenSecretEnc).toBeUndefined();
      expect(JSON.stringify(created)).not.toContain('my-plaintext-widget-secret');

      const stored = JSON.parse(store.get('tenant:acme') ?? '{}') as Record<string, unknown>;
      expect(String(stored.authTokenSecretEnc)).toMatch(/^v1\./);
      expect(JSON.stringify(stored)).not.toContain('my-plaintext-widget-secret');
    });

    it('fails loud with 500 when BUGDROP_KEK is missing', async () => {
      const res = await admin.fetch(
        req('/tenants', {
          method: 'POST',
          body: JSON.stringify(validTenantInput({ authTokenSecret: 'my-plaintext-widget-secret' })),
        }),
        env
      );
      expect(res.status).toBe(500);
      expect(store.has('tenant:acme')).toBe(false);
    });

    it('rejects a too-short secret with 400', async () => {
      const kekEnv = { ...env, BUGDROP_KEK: KEK } as Env;
      const res = await admin.fetch(
        req('/tenants', {
          method: 'POST',
          body: JSON.stringify(validTenantInput({ authTokenSecret: 'short' })),
        }),
        kekEnv
      );
      expect(res.status).toBe(400);
    });

    it('PUT without the secret fields inherits the stored envelope; null clears it', async () => {
      const kekEnv = { ...env, BUGDROP_KEK: KEK } as Env;
      await admin.fetch(
        req('/tenants', {
          method: 'POST',
          body: JSON.stringify(validTenantInput({ authTokenSecret: 'my-plaintext-widget-secret' })),
        }),
        kekEnv
      );

      const update = await admin.fetch(
        req('/tenants/acme', {
          method: 'PUT',
          body: JSON.stringify(validTenantInput({ name: 'Renamed' })),
        }),
        kekEnv
      );
      expect(update.status).toBe(200);
      let stored = JSON.parse(store.get('tenant:acme') ?? '{}') as Record<string, unknown>;
      expect(String(stored.authTokenSecretEnc)).toMatch(/^v1\./);

      const clear = await admin.fetch(
        req('/tenants/acme', {
          method: 'PUT',
          body: JSON.stringify(validTenantInput({ authTokenSecret: null })),
        }),
        kekEnv
      );
      expect(clear.status).toBe(200);
      stored = JSON.parse(store.get('tenant:acme') ?? '{}') as Record<string, unknown>;
      expect(stored.authTokenSecretEnc).toBeUndefined();
      expect((await clear.json()).hasAuthTokenSecret).toBe(false);
    });
  });
});

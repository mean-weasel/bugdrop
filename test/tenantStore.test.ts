import { describe, expect, it, vi, beforeEach } from 'vitest';
import { deleteTenant, getTenant, listTenants, putTenant } from '../src/lib/tenantStore';
import type { TenantConfig } from '../src/lib/tenants';
import type { Env } from '../src/types';

function validTenant(overrides: Partial<TenantConfig> = {}): TenantConfig {
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

describe('tenantStore', () => {
  let mockKv: {
    get: ReturnType<typeof vi.fn>;
    put: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
  };
  let env: Env;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockKv = {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue({ keys: [], list_complete: true, cursor: '' }),
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
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('getTenant', () => {
    it('returns null when the key is missing', async () => {
      mockKv.get.mockResolvedValue(null);

      const result = await getTenant(env, 'ghost');

      expect(result).toBeNull();
      expect(mockKv.get).toHaveBeenCalledWith('tenant:ghost', { cacheTtl: 60 });
    });

    it('returns the validated tenant when the stored JSON is valid', async () => {
      const tenant = validTenant();
      mockKv.get.mockResolvedValue(JSON.stringify(tenant));

      const result = await getTenant(env, 'acme');

      expect(result).toEqual(tenant);
    });

    it('returns null and logs when the stored value is not valid JSON', async () => {
      mockKv.get.mockResolvedValue('not json{');

      const result = await getTenant(env, 'acme');

      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('returns null and logs when the stored JSON fails TenantConfig validation', async () => {
      mockKv.get.mockResolvedValue(JSON.stringify({ version: 1, key: 'acme' }));

      const result = await getTenant(env, 'acme');

      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('reads with cacheTtl: 60', async () => {
      mockKv.get.mockResolvedValue(JSON.stringify(validTenant()));

      await getTenant(env, 'acme');

      expect(mockKv.get).toHaveBeenCalledWith('tenant:acme', { cacheTtl: 60 });
    });
  });

  describe('putTenant', () => {
    it('writes the tenant under the tenant: prefix', async () => {
      const tenant = validTenant();

      await putTenant(env, tenant);

      expect(mockKv.put).toHaveBeenCalledWith('tenant:acme', JSON.stringify(tenant));
    });
  });

  describe('deleteTenant', () => {
    it('deletes the tenant under the tenant: prefix', async () => {
      await deleteTenant(env, 'acme');

      expect(mockKv.delete).toHaveBeenCalledWith('tenant:acme');
    });
  });

  describe('listTenants', () => {
    it('lists keys and names by the tenant: prefix', async () => {
      mockKv.list.mockResolvedValue({
        keys: [{ name: 'tenant:acme' }, { name: 'tenant:beta' }],
        list_complete: true,
        cursor: '',
      });
      mockKv.get.mockImplementation(async (storageKey: string) => {
        const key = storageKey.replace('tenant:', '');
        return JSON.stringify(validTenant({ key, name: key.toUpperCase() }));
      });

      const result = await listTenants(env);

      expect(mockKv.list).toHaveBeenCalledWith({ prefix: 'tenant:' });
      expect(result).toEqual([
        { key: 'acme', name: 'ACME' },
        { key: 'beta', name: 'BETA' },
      ]);
    });

    it('skips entries that fail validation', async () => {
      mockKv.list.mockResolvedValue({
        keys: [{ name: 'tenant:acme' }, { name: 'tenant:broken' }],
        list_complete: true,
        cursor: '',
      });
      mockKv.get.mockImplementation(async (storageKey: string) => {
        if (storageKey === 'tenant:broken') {
          return 'not json{';
        }
        return JSON.stringify(validTenant());
      });

      const result = await listTenants(env);

      expect(result).toEqual([{ key: 'acme', name: 'Acme Corp' }]);
    });

    it('returns an empty list when there are no tenants', async () => {
      const result = await listTenants(env);

      expect(result).toEqual([]);
    });
  });
});

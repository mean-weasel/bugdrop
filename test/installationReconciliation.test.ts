import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../src/types';
import {
  INSTALLATION_RECONCILIATION_AUDIT_KEY,
  MAX_SCHEDULED_GITHUB_REQUESTS,
  reconcileInstallationRecords,
} from '../src/lib/installation-reconciliation';
import {
  MAX_GITHUB_INSTALLATION_PAGES,
  listActiveGitHubInstallations,
} from '../src/lib/github-installation-inventory';
import type { NewInstallationRecord } from '../src/lib/installation-analytics';
import { INSTALLATION_SWEEP_PAGE_SIZE } from '../src/lib/installation-retention';

const baseEnv: Env = {
  GITHUB_APP_ID: '123',
  GITHUB_PRIVATE_KEY: 'test-private-key',
  ENVIRONMENT: 'test',
  ALLOWED_ORIGINS: '*',
  GITHUB_APP_NAME: 'test-bugdrop-app',
  MAX_SCREENSHOT_SIZE_MB: '5',
  ASSETS: {} as Fetcher,
};

function activeInstallation(id: number): NewInstallationRecord {
  return {
    installationId: id,
    account: {
      login: `app-${id}`,
      type: 'Organization',
      profileUrl: `https://github.com/app-${id}`,
    },
    installedAt: '2026-08-28T12:00:00.000Z',
  };
}

function inventory(records: NewInstallationRecord[], pageCount = 1) {
  return {
    installationIds: records.map(record => record.installationId),
    records,
    skippedCount: 0,
    pageCount,
  };
}

function createStore(initial: Record<string, string> = {}): {
  store: KVNamespace;
  values: Map<string, string>;
  put: ReturnType<typeof vi.fn>;
} {
  const values = new Map(Object.entries(initial));
  const put = vi.fn(async (key: string, value: string) => {
    values.set(key, value);
  });
  return {
    values,
    put,
    store: {
      get: vi.fn(async (key: string) => values.get(key) ?? null),
      put,
      delete: vi.fn(async (key: string) => {
        values.delete(key);
      }),
      getWithMetadata: vi.fn(),
      list: vi.fn(async () => ({
        keys: [...values.keys()]
          .filter(name => name.startsWith('installation:'))
          .map(name => ({ name })),
        list_complete: true,
        cacheStatus: null,
      })),
    } as unknown as KVNamespace,
  };
}

describe('active installation reconciliation', () => {
  it('normalizes only the approved minimal identity fields from GitHub', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json([
        {
          id: 42,
          account: {
            login: 'acme',
            type: 'Organization',
            html_url: 'https://github.com/acme',
            email: 'private@example.com',
          },
          created_at: '2026-08-28T05:00:00-07:00',
          repositories_url: 'https://api.github.com/installation/repositories',
          repository_selection: 'all',
        },
        {
          id: 43,
          account: {
            login: 'acme-enterprise',
            type: 'Enterprise',
            html_url: 'https://github.com/enterprises/acme',
          },
          created_at: '2026-08-28T12:00:00Z',
        },
      ])
    );

    const result = await listActiveGitHubInstallations(baseEnv, {
      fetchImpl,
      createJwt: vi.fn().mockResolvedValue('app-jwt'),
    });

    expect(result).toEqual({
      installationIds: [42, 43],
      skippedCount: 1,
      pageCount: 1,
      records: [
        {
          installationId: 42,
          account: {
            login: 'acme',
            type: 'Organization',
            profileUrl: 'https://github.com/acme',
          },
          installedAt: '2026-08-28T12:00:00.000Z',
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('private@example.com');
    expect(JSON.stringify(result)).not.toContain('repositories');
  });

  it('reports a dry run without writing records or an audit', async () => {
    const existing = activeInstallation(1);
    const { store, put } = createStore({
      'installation:1': JSON.stringify({ schemaVersion: 1, ...existing }),
    });

    const audit = await reconcileInstallationRecords(
      { ...baseEnv, INSTALLATION_ANALYTICS: store },
      {
        mode: 'dry-run',
        now: new Date('2026-08-31T12:00:00.000Z'),
        inventory: inventory([existing, activeInstallation(2)]),
      }
    );

    expect(audit).toEqual({
      schemaVersion: 1,
      mode: 'dry-run',
      completedAt: '2026-08-31T12:00:00.000Z',
      activeCount: 2,
      eligibleCount: 2,
      skippedCount: 0,
      existingCount: 1,
      missingCount: 1,
      processedCount: 0,
      createdCount: 0,
      inactiveCount: 0,
      remainingCount: 1,
    });
    expect(put).not.toHaveBeenCalled();
  });

  it('creates only missing records, writes aggregate evidence, and is idempotent', async () => {
    const existing = activeInstallation(1);
    const missing = activeInstallation(2);
    const { store, values } = createStore({
      'installation:1': JSON.stringify({ schemaVersion: 1, ...existing }),
    });
    const env = { ...baseEnv, INSTALLATION_ANALYTICS: store };

    const first = await reconcileInstallationRecords(env, {
      mode: 'apply',
      now: new Date('2026-08-31T12:00:00.000Z'),
      inventory: inventory([existing, missing]),
      confirmInactive: vi.fn().mockResolvedValue(false),
    });
    const second = await reconcileInstallationRecords(env, {
      mode: 'apply',
      now: new Date('2026-08-31T13:00:00.000Z'),
      inventory: inventory([existing, missing]),
      confirmInactive: vi.fn().mockResolvedValue(false),
    });

    expect(first).toMatchObject({
      existingCount: 1,
      missingCount: 1,
      processedCount: 1,
      createdCount: 1,
      remainingCount: 0,
    });
    expect(second).toMatchObject({
      existingCount: 2,
      missingCount: 0,
      processedCount: 0,
      createdCount: 0,
      remainingCount: 0,
    });
    expect(JSON.parse(values.get('installation:2')!)).toEqual({
      schemaVersion: 1,
      ...missing,
    });
    expect(JSON.parse(values.get(INSTALLATION_RECONCILIATION_AUDIT_KEY)!)).toEqual(second);
  });

  it('resumes safely after a partial write failure without publishing a false audit', async () => {
    const { store, values } = createStore();
    const originalPut = store.put.bind(store);
    let interrupted = false;
    store.put = vi.fn(async (key: string, value: string, options?: KVNamespacePutOptions) => {
      if (key === 'installation:2' && !interrupted) {
        interrupted = true;
        throw new Error('temporary KV failure');
      }
      await originalPut(key, value, options);
    });
    const env = { ...baseEnv, INSTALLATION_ANALYTICS: store };
    const active = [activeInstallation(1), activeInstallation(2)];

    await expect(
      reconcileInstallationRecords(env, {
        mode: 'apply',
        inventory: inventory(active),
        confirmInactive: vi.fn().mockResolvedValue(false),
      })
    ).rejects.toThrow('temporary KV failure');
    expect(values.has('installation:1')).toBe(true);
    expect(values.has('installation:2')).toBe(false);
    expect(values.has(INSTALLATION_RECONCILIATION_AUDIT_KEY)).toBe(false);

    const retry = await reconcileInstallationRecords(env, {
      mode: 'apply',
      now: new Date('2026-08-31T14:00:00.000Z'),
      inventory: inventory(active),
      confirmInactive: vi.fn().mockResolvedValue(false),
    });
    expect(retry).toMatchObject({
      existingCount: 1,
      missingCount: 1,
      processedCount: 1,
      createdCount: 1,
      remainingCount: 0,
    });
    expect(values.has('installation:2')).toBe(true);
    expect(values.has(INSTALLATION_RECONCILIATION_AUDIT_KEY)).toBe(true);
  });

  it('bounds each apply run and continues with the remaining missing records later', async () => {
    const { store, values } = createStore();
    const safeBatchSize =
      MAX_SCHEDULED_GITHUB_REQUESTS - MAX_GITHUB_INSTALLATION_PAGES - INSTALLATION_SWEEP_PAGE_SIZE;
    const records = Array.from({ length: safeBatchSize + 5 }, (_, index) =>
      activeInstallation(index + 1)
    );

    const audit = await reconcileInstallationRecords(
      { ...baseEnv, INSTALLATION_ANALYTICS: store },
      {
        mode: 'apply',
        inventory: inventory(records, MAX_GITHUB_INSTALLATION_PAGES),
        confirmInactive: vi.fn().mockResolvedValue(false),
      }
    );

    expect(audit).toMatchObject({
      missingCount: safeBatchSize + 5,
      processedCount: safeBatchSize,
      createdCount: safeBatchSize,
      remainingCount: 5,
    });
    expect([...values.keys()].filter(key => /^installation:\d+$/.test(key))).toHaveLength(
      safeBatchSize
    );
    expect(
      MAX_GITHUB_INSTALLATION_PAGES + safeBatchSize + INSTALLATION_SWEEP_PAGE_SIZE
    ).toBeLessThanOrEqual(MAX_SCHEDULED_GITHUB_REQUESTS);
  });

  it('removes a record when uninstall races reconciliation after creation', async () => {
    const { store, values } = createStore();
    const confirmInactive = vi.fn().mockResolvedValue(true);
    const deleteInstallation = vi.fn(async (_env: Env, installationId: number) => {
      await store.delete(`installation:${installationId}`);
    });

    const audit = await reconcileInstallationRecords(
      { ...baseEnv, INSTALLATION_ANALYTICS: store },
      {
        mode: 'apply',
        inventory: inventory([activeInstallation(42)]),
        confirmInactive,
        deleteInstallation,
      }
    );

    expect(confirmInactive).toHaveBeenCalledOnce();
    expect(deleteInstallation).toHaveBeenCalledOnce();
    expect(values.has('installation:42')).toBe(false);
    expect(audit).toMatchObject({
      processedCount: 1,
      createdCount: 0,
      inactiveCount: 1,
      remainingCount: 0,
    });
  });

  it('fails closed on malformed or duplicate GitHub installation records', async () => {
    const malformed = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json([
        {
          id: 42,
          account: { login: 'acme', type: 'Organization', html_url: 'https://evil.example/acme' },
          created_at: '2026-08-28T12:00:00Z',
        },
      ])
    );
    await expect(
      listActiveGitHubInstallations(baseEnv, {
        fetchImpl: malformed,
        createJwt: vi.fn().mockResolvedValue('app-jwt'),
      })
    ).rejects.toThrow('invalid installation record');

    const valid = {
      id: 42,
      account: { login: 'acme', type: 'Organization', html_url: 'https://github.com/acme' },
      created_at: '2026-08-28T12:00:00Z',
    };
    await expect(
      listActiveGitHubInstallations(baseEnv, {
        fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(Response.json([valid, valid])),
        createJwt: vi.fn().mockResolvedValue('app-jwt'),
      })
    ).rejects.toThrow('duplicate installation');
  });
});

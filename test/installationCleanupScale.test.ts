import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import worker from '../src/index';
import type { Env } from '../src/types';
import {
  INSTALLATION_CLEANUP_AUDIT_KEY,
  INSTALLATION_CLEANUP_CHECKPOINT_KEY,
  INSTALLATION_SWEEP_PAGE_SIZE,
  MAX_CONCURRENT_CLEANUP_OPERATIONS,
  MAX_GITHUB_INSTALLATION_PAGES,
  confirmGitHubInstallationIsInactive,
  deleteInstallationRecord,
  installationRecordKey,
  sweepInstallationRecords,
} from '../src/lib/installation-retention';

const baseEnv: Env = {
  GITHUB_APP_ID: '123',
  GITHUB_PRIVATE_KEY: 'test-private-key',
  GITHUB_WEBHOOK_SECRET: 'webhook-secret',
  ENVIRONMENT: 'test',
  ALLOWED_ORIGINS: '*',
  GITHUB_APP_NAME: 'test-bugdrop-app',
  MAX_SCREENSHOT_SIZE_MB: '5',
  ASSETS: {} as Fetcher,
};

function createStore(overrides: Partial<KVNamespace> = {}): KVNamespace {
  return {
    delete: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    getWithMetadata: vi.fn(),
    list: vi.fn().mockResolvedValue({ keys: [], list_complete: true, cacheStatus: null }),
    put: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as KVNamespace;
}

async function sign(body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(baseEnv.GITHUB_WEBHOOK_SECRET!),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const digest = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  );
  return `sha256=${Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

describe('installation cleanup boundaries', () => {
  it('validates installation IDs before constructing or deleting keys', async () => {
    const store = createStore();
    expect(installationRecordKey(42)).toBe('installation:42');
    expect(() => installationRecordKey(0)).toThrow('Invalid installation ID');
    expect(() => installationRecordKey(1.5)).toThrow('Invalid installation ID');
    await expect(deleteInstallationRecord(store, -1)).rejects.toThrow('Invalid installation ID');
    expect(store.delete).not.toHaveBeenCalled();
  });

  it('confirms a candidate is inactive before destructive cleanup', async () => {
    const activeResponse = new Response('{}', { status: 200 });
    const missingResponse = new Response('{}', { status: 404 });
    const failureResponse = new Response('{}', { status: 500 });
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(activeResponse)
      .mockResolvedValueOnce(missingResponse);
    const options = {
      fetchImpl,
      createJwt: vi.fn().mockResolvedValue('app-jwt'),
    };

    await expect(confirmGitHubInstallationIsInactive(baseEnv, 42, options)).resolves.toBe(false);
    await expect(confirmGitHubInstallationIsInactive(baseEnv, 43, options)).resolves.toBe(true);
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'https://api.github.com/app/installations/43',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer app-jwt' }),
      })
    );

    await expect(
      confirmGitHubInstallationIsInactive(baseEnv, 44, {
        fetchImpl: vi.fn().mockResolvedValue(failureResponse),
        createJwt: vi.fn().mockResolvedValue('app-jwt'),
      })
    ).rejects.toThrow('Failed to confirm GitHub App installation: 500');
    expect(activeResponse.bodyUsed).toBe(true);
    expect(missingResponse.bodyUsed).toBe(true);
    expect(failureResponse.bodyUsed).toBe(true);
  });

  it('checkpoints after one bounded KV page instead of claiming a partial sweep succeeded', async () => {
    let concurrentConfirmations = 0;
    let peakConfirmations = 0;
    const confirmInstallationIsInactive = vi.fn(async () => {
      concurrentConfirmations += 1;
      peakConfirmations = Math.max(peakConfirmations, concurrentConfirmations);
      await Promise.resolve();
      concurrentConfirmations -= 1;
      return true;
    });
    const keys = Array.from({ length: INSTALLATION_SWEEP_PAGE_SIZE }, (_, index) => ({
      name: `installation:${index + 1}`,
    }));
    const store = createStore({
      list: vi.fn().mockResolvedValue({
        keys,
        list_complete: false,
        cursor: 'page-2',
        cacheStatus: null,
      }),
    });

    const result = await sweepInstallationRecords(
      { ...baseEnv, INSTALLATION_ANALYTICS: store },
      {
        listActiveInstallationIds: vi.fn().mockResolvedValue(new Set<number>()),
        confirmInstallationIsInactive,
      }
    );

    expect(result).toBeNull();
    expect(store.delete).toHaveBeenCalledTimes(INSTALLATION_SWEEP_PAGE_SIZE);
    expect(confirmInstallationIsInactive).toHaveBeenCalledTimes(INSTALLATION_SWEEP_PAGE_SIZE);
    expect(peakConfirmations).toBe(MAX_CONCURRENT_CLEANUP_OPERATIONS);
    expect(MAX_GITHUB_INSTALLATION_PAGES + INSTALLATION_SWEEP_PAGE_SIZE).toBeLessThanOrEqual(50);
    expect(store.put).toHaveBeenCalledExactlyOnceWith(
      INSTALLATION_CLEANUP_CHECKPOINT_KEY,
      expect.stringContaining('"cursor":"page-2"')
    );
    expect(store.put).not.toHaveBeenCalledWith(INSTALLATION_CLEANUP_AUDIT_KEY, expect.anything());
  });

  it('preserves an active record omitted by a shifting GitHub pagination boundary', async () => {
    const store = createStore({
      list: vi.fn().mockResolvedValue({
        keys: [{ name: 'installation:101' }],
        list_complete: true,
        cacheStatus: null,
      }),
    });
    const confirmInstallationIsInactive = vi.fn().mockResolvedValue(false);

    const result = await sweepInstallationRecords(
      { ...baseEnv, INSTALLATION_ANALYTICS: store },
      {
        listActiveInstallationIds: vi.fn().mockResolvedValue(new Set<number>()),
        confirmInstallationIsInactive,
      }
    );

    expect(confirmInstallationIsInactive).toHaveBeenCalledExactlyOnceWith(expect.anything(), 101);
    expect(store.delete).toHaveBeenCalledExactlyOnceWith(INSTALLATION_CLEANUP_CHECKPOINT_KEY);
    expect(result?.deletedCount).toBe(0);
  });

  it('does not delete or record success when candidate confirmation fails', async () => {
    const store = createStore({
      list: vi.fn().mockResolvedValue({
        keys: [{ name: 'installation:101' }],
        list_complete: true,
        cacheStatus: null,
      }),
    });

    await expect(
      sweepInstallationRecords(
        { ...baseEnv, INSTALLATION_ANALYTICS: store },
        {
          listActiveInstallationIds: vi.fn().mockResolvedValue(new Set<number>()),
          confirmInstallationIsInactive: vi.fn().mockRejectedValue(new Error('GitHub unavailable')),
        }
      )
    ).rejects.toThrow('GitHub unavailable');
    expect(store.delete).not.toHaveBeenCalled();
    expect(store.put).not.toHaveBeenCalled();
  });

  it('fails closed on a malformed cleanup checkpoint', async () => {
    const impossibleCheckpoint = {
      schemaVersion: 1,
      cursor: 'page-2',
      startedAt: '2026-08-28T12:00:00.000Z',
      scannedCount: 0,
      deletedCount: 50,
    };
    const store = createStore({
      get: vi.fn().mockResolvedValue(JSON.stringify(impossibleCheckpoint)),
    });

    await expect(
      sweepInstallationRecords(
        { ...baseEnv, INSTALLATION_ANALYTICS: store },
        { listActiveInstallationIds: vi.fn().mockResolvedValue(new Set<number>()) }
      )
    ).rejects.toThrow('Malformed installation cleanup checkpoint');
    expect(store.list).not.toHaveBeenCalled();
    expect(store.delete).not.toHaveBeenCalled();
    expect(store.put).not.toHaveBeenCalled();
  });

  it('mounts the authenticated webhook at the production API path', async () => {
    const store = createStore();
    const body = JSON.stringify({ action: 'deleted', installation: { id: 42 } });
    const response = await worker.fetch(
      new Request('https://bugdrop.dev/api/github/webhook', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-github-event': 'installation',
          'x-hub-signature-256': await sign(body),
        },
        body,
      }),
      { ...baseEnv, INSTALLATION_ANALYTICS: store },
      {} as ExecutionContext
    );

    expect(response.status).toBe(200);
    expect(store.delete).toHaveBeenCalledExactlyOnceWith('installation:42');
  });

  it('binds isolated storage, the first-party route, and daily cleanup triggers', () => {
    const config = readFileSync('wrangler.toml', 'utf8');

    expect(config.match(/binding = "INSTALLATION_ANALYTICS"/g)).toHaveLength(3);
    expect(config.match(/crons = \["17 3 \* \* \*"\]/g)).toHaveLength(2);
    expect(config.match(/bugdrop\.dev\/api\/github\/webhook\*/g)).toHaveLength(2);
    expect(config.indexOf('routes = [')).toBeLessThan(config.indexOf('[triggers]'));
    expect(config).toContain('id = "a567f723a2eb4cfab807b0c1d678dc76"');
    expect(config).toContain('id = "c58b33f6a0dc416b8661661ce0d23f7f"');
  });
});

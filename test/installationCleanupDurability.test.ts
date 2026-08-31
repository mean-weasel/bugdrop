import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../src/types';
import {
  INSTALLATION_CLEANUP_AUDIT_KEY,
  INSTALLATION_CLEANUP_CHECKPOINT_KEY,
  sweepInstallationRecords,
} from '../src/lib/installation-retention';

const baseEnv = {
  GITHUB_APP_ID: '123',
  GITHUB_PRIVATE_KEY: 'test-private-key',
  FEEDBACK_COUNTER: {
    idFromName: vi.fn().mockReturnValue({} as DurableObjectId),
    get: vi.fn().mockReturnValue({
      fetch: vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    }),
  } as unknown as DurableObjectNamespace,
} as Env;

function createStore(overrides: Partial<KVNamespace> = {}): KVNamespace {
  return {
    delete: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    getWithMetadata: vi.fn(),
    list: vi.fn().mockResolvedValue({
      keys: [{ name: 'installation:3' }],
      list_complete: true,
      cacheStatus: null,
    }),
    put: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as KVNamespace;
}

function cleanupStates() {
  const audit = {
    schemaVersion: 1 as const,
    completedAt: '2026-08-28T12:00:00.000Z',
    scannedCount: 1,
    activeCount: 0,
    deletedCount: 1,
  };
  const finalizing = { schemaVersion: 1 as const, phase: 'finalizing' as const, audit };
  const deleting = {
    schemaVersion: 1 as const,
    phase: 'deleting' as const,
    installationIds: [3],
    next: finalizing,
  };
  return { audit, deleting, finalizing };
}

function createOptions() {
  return {
    now: new Date('2026-08-28T12:00:00.000Z'),
    listActiveInstallationIds: vi.fn().mockResolvedValue(new Set<number>()),
    confirmInstallationIsInactive: vi.fn().mockResolvedValue(true),
  };
}

describe('installation cleanup durability', () => {
  it('never records a successful sweep when GitHub or deletion fails', async () => {
    const githubFailureStore = createStore();
    await expect(
      sweepInstallationRecords(
        { ...baseEnv, INSTALLATION_ANALYTICS: githubFailureStore },
        { listActiveInstallationIds: vi.fn().mockRejectedValue(new Error('GitHub unavailable')) }
      )
    ).rejects.toThrow('GitHub unavailable');
    expect(githubFailureStore.delete).not.toHaveBeenCalled();
    expect(githubFailureStore.put).not.toHaveBeenCalled();

    const deletionFailureStore = createStore({
      delete: vi.fn().mockRejectedValue(new Error('KV deletion failed')),
    });
    await expect(
      sweepInstallationRecords(
        { ...baseEnv, INSTALLATION_ANALYTICS: deletionFailureStore },
        createOptions()
      )
    ).rejects.toThrow('KV deletion failed');
    expect(deletionFailureStore.put).toHaveBeenNthCalledWith(
      1,
      INSTALLATION_CLEANUP_CHECKPOINT_KEY,
      expect.stringContaining('"phase":"deleting"')
    );
    expect(deletionFailureStore.put).not.toHaveBeenCalledWith(
      INSTALLATION_CLEANUP_AUDIT_KEY,
      expect.anything()
    );
  });

  it('does not delete records unless the pending deletion is durable', async () => {
    const store = createStore({ put: vi.fn().mockRejectedValue(new Error('KV unavailable')) });
    const options = createOptions();

    await expect(
      sweepInstallationRecords({ ...baseEnv, INSTALLATION_ANALYTICS: store }, options)
    ).rejects.toThrow('KV unavailable');

    expect(store.delete).not.toHaveBeenCalled();
  });

  it('replays a deletion when advancing to finalization fails', async () => {
    const { audit, deleting, finalizing } = cleanupStates();
    const options = createOptions();
    const store = createStore({
      get: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(JSON.stringify(deleting)),
      put: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('checkpoint unavailable'))
        .mockResolvedValue(undefined),
    });

    await expect(
      sweepInstallationRecords({ ...baseEnv, INSTALLATION_ANALYTICS: store }, options)
    ).rejects.toThrow('checkpoint unavailable');
    const result = await sweepInstallationRecords(
      { ...baseEnv, INSTALLATION_ANALYTICS: store },
      options
    );

    expect(result).toEqual(audit);
    expect(options.listActiveInstallationIds).toHaveBeenCalledTimes(1);
    expect(store.list).toHaveBeenCalledTimes(1);
    expect(store.delete).toHaveBeenNthCalledWith(1, 'installation-usage:3');
    expect(store.delete).toHaveBeenNthCalledWith(2, 'installation:3');
    expect(store.delete).toHaveBeenNthCalledWith(3, 'installation-usage:3');
    expect(store.delete).toHaveBeenNthCalledWith(4, 'installation:3');
    expect(store.put).toHaveBeenNthCalledWith(
      4,
      INSTALLATION_CLEANUP_CHECKPOINT_KEY,
      JSON.stringify(finalizing)
    );
    expect(store.put).toHaveBeenNthCalledWith(
      5,
      INSTALLATION_CLEANUP_AUDIT_KEY,
      JSON.stringify(audit)
    );
  });

  it('retries the exact final audit after publication fails without rescanning', async () => {
    const { audit, deleting, finalizing } = cleanupStates();
    const options = createOptions();
    const store = createStore({
      get: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(JSON.stringify(finalizing)),
      put: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('audit unavailable'))
        .mockResolvedValueOnce(undefined),
    });

    await expect(
      sweepInstallationRecords({ ...baseEnv, INSTALLATION_ANALYTICS: store }, options)
    ).rejects.toThrow('audit unavailable');
    const result = await sweepInstallationRecords(
      { ...baseEnv, INSTALLATION_ANALYTICS: store },
      options
    );

    expect(result).toEqual(audit);
    expect(store.list).toHaveBeenCalledTimes(1);
    expect(store.put).toHaveBeenNthCalledWith(
      1,
      INSTALLATION_CLEANUP_CHECKPOINT_KEY,
      JSON.stringify(deleting)
    );
    expect(store.put).toHaveBeenNthCalledWith(
      4,
      INSTALLATION_CLEANUP_AUDIT_KEY,
      JSON.stringify(audit)
    );
    expect(store.delete).toHaveBeenLastCalledWith(INSTALLATION_CLEANUP_CHECKPOINT_KEY);
  });
});

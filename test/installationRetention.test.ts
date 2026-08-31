import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../src/types';
import {
  INSTALLATION_CLEANUP_AUDIT_KEY,
  INSTALLATION_CLEANUP_CHECKPOINT_KEY,
  deleteInstallationData,
  listActiveGitHubInstallationIds,
  sweepInstallationRecords,
  verifyGitHubWebhookSignature,
} from '../src/lib/installation-retention';
import { createGitHubWebhook } from '../src/routes/github-webhook';

const githubWebhook = createGitHubWebhook({
  confirmInstallationIsInactive: vi.fn().mockResolvedValue(false),
});

function createCounterNamespace(
  fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
): DurableObjectNamespace {
  return {
    idFromName: vi.fn().mockReturnValue({} as DurableObjectId),
    get: vi.fn().mockReturnValue({ fetch }),
  } as unknown as DurableObjectNamespace;
}

const baseEnv: Env = {
  GITHUB_APP_ID: '123',
  GITHUB_PRIVATE_KEY: 'test-private-key',
  GITHUB_WEBHOOK_SECRET: "It's a Secret to Everybody",
  ENVIRONMENT: 'test',
  ALLOWED_ORIGINS: '*',
  GITHUB_APP_NAME: 'test-bugdrop-app',
  MAX_SCREENSHOT_SIZE_MB: '5',
  ASSETS: {} as Fetcher,
  FEEDBACK_COUNTER: createCounterNamespace(),
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

async function sign(body: string, secret = baseEnv.GITHUB_WEBHOOK_SECRET!): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const digest = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  );
  return `sha256=${Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

describe('installation retention safeguards', () => {
  it('matches GitHub’s published SHA-256 webhook validation vector', async () => {
    await expect(
      verifyGitHubWebhookSignature(
        "It's a Secret to Everybody",
        'sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17',
        'Hello, World!'
      )
    ).resolves.toBe(true);
    await expect(
      verifyGitHubWebhookSignature(
        "It's a Secret to Everybody",
        'sha256=057107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17',
        'Hello, World!'
      )
    ).resolves.toBe(false);
  });

  it('deletes usage before identity so partial cleanup remains retryable', async () => {
    const operations: string[] = [];
    const store = createStore({
      put: vi.fn(async (key: string) => {
        operations.push(`put:${key}`);
      }),
      delete: vi.fn(async (key: string) => {
        operations.push(`delete:${key}`);
      }),
    });
    const namespace = {
      idFromName: vi.fn().mockReturnValue({} as DurableObjectId),
      get: vi.fn().mockReturnValue({
        fetch: vi.fn(async () => {
          operations.push('delete:durable-counter');
          return new Response(null, { status: 204 });
        }),
      }),
    } as unknown as DurableObjectNamespace;

    await deleteInstallationData(
      {
        ...baseEnv,
        INSTALLATION_ANALYTICS: store,
        FEEDBACK_COUNTER: namespace,
        INSTALLATION_USAGE_ENABLED: 'true',
      },
      42
    );

    expect(operations).toEqual([
      'put:installation-usage-deleted:42',
      'delete:durable-counter',
      'delete:installation-usage:42',
      'delete:installation:42',
    ]);
  });

  it('purges old usage without creating guards while collection is disabled', async () => {
    const operations: string[] = [];
    const store = createStore({
      put: vi.fn(async (key: string) => {
        operations.push(`put:${key}`);
      }),
      delete: vi.fn(async (key: string) => {
        operations.push(`delete:${key}`);
      }),
    });
    const fetch = vi.fn(async (request: RequestInfo | URL) => {
      operations.push(`counter:${String(request)}`);
      return new Response(null, { status: 204 });
    });

    await deleteInstallationData(
      {
        ...baseEnv,
        INSTALLATION_ANALYTICS: store,
        FEEDBACK_COUNTER: createCounterNamespace(fetch),
      },
      42
    );

    expect(operations).toEqual([
      'counter:https://feedback-counter/installation/purge',
      'delete:installation-usage:42',
      'delete:installation:42',
    ]);
  });

  it('keeps the installation identity when counter cleanup fails', async () => {
    const store = createStore();
    const namespace = {
      idFromName: vi.fn().mockReturnValue({} as DurableObjectId),
      get: vi.fn().mockReturnValue({
        fetch: vi.fn().mockResolvedValue(new Response(null, { status: 500 })),
      }),
    } as unknown as DurableObjectNamespace;

    await expect(
      deleteInstallationData(
        {
          ...baseEnv,
          INSTALLATION_ANALYTICS: store,
          FEEDBACK_COUNTER: namespace,
          INSTALLATION_USAGE_ENABLED: 'true',
        },
        42
      )
    ).rejects.toThrow('deletion failed');

    expect(store.delete).not.toHaveBeenCalledWith('installation:42');
  });

  it('deletes only the uninstalled app record after authenticating the webhook', async () => {
    const store = createStore();
    const body = JSON.stringify({ action: 'deleted', installation: { id: 987654 } });
    const response = await githubWebhook.fetch(
      new Request('https://bugdrop.example/github/webhook', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-github-event': 'installation',
          'x-hub-signature-256': await sign(body),
        },
        body,
      }),
      { ...baseEnv, INSTALLATION_ANALYTICS: store }
    );

    expect(response.status).toBe(200);
    expect(store.put).not.toHaveBeenCalledWith(
      'installation-usage-deleted:987654',
      expect.anything(),
      expect.anything()
    );
    expect(store.delete).toHaveBeenNthCalledWith(1, 'installation-usage:987654');
    expect(store.delete).toHaveBeenNthCalledWith(2, 'installation:987654');
  });

  it('keeps the identity whenever its durable counter binding is unavailable', async () => {
    const store = createStore();

    await expect(
      deleteInstallationData(
        {
          ...baseEnv,
          INSTALLATION_ANALYTICS: store,
          FEEDBACK_COUNTER: undefined,
        },
        42
      )
    ).rejects.toThrow('binding is required');

    expect(store.delete).not.toHaveBeenCalledWith('installation:42');
  });

  it('rejects unsigned deliveries and fails visibly when deletion storage is unavailable', async () => {
    const body = JSON.stringify({ action: 'deleted', installation: { id: 42 } });
    const unsigned = await githubWebhook.fetch(
      new Request('https://bugdrop.example/github/webhook', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-github-event': 'installation' },
        body,
      }),
      { ...baseEnv, INSTALLATION_ANALYTICS: createStore() }
    );
    const missingStore = await githubWebhook.fetch(
      new Request('https://bugdrop.example/github/webhook', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-github-event': 'installation',
          'x-hub-signature-256': await sign(body),
        },
        body,
      }),
      baseEnv
    );

    expect(unsigned.status).toBe(401);
    expect(missingStore.status).toBe(503);
  });

  it('acknowledges unrelated or non-deletion events without writing installation records', async () => {
    const store = createStore();
    const body = JSON.stringify({ action: 'suspended', installation: { id: 42 } });
    const response = await githubWebhook.fetch(
      new Request('https://bugdrop.example/github/webhook', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-github-event': 'installation',
          'x-hub-signature-256': await sign(body),
        },
        body,
      }),
      { ...baseEnv, INSTALLATION_ANALYTICS: store }
    );

    expect(response.status).toBe(202);
    expect(store.delete).not.toHaveBeenCalled();
    expect(store.put).not.toHaveBeenCalled();
  });

  it('stores only approved public account fields for a newly created installation', async () => {
    const store = createStore();
    const body = JSON.stringify({
      action: 'created',
      installation: {
        id: 42,
        account: {
          login: 'acme',
          type: 'Organization',
          html_url: 'https://github.com/acme',
          email: 'private@example.com',
          avatar_url: 'https://avatars.githubusercontent.com/u/1',
        },
        created_at: '2026-08-28T12:00:00Z',
        repository_selection: 'all',
      },
      repositories: [{ full_name: 'acme/private-repo' }],
      sender: { login: 'private-installer' },
    });
    const response = await githubWebhook.fetch(
      new Request('https://bugdrop.example/github/webhook', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-github-event': 'installation',
          'x-hub-signature-256': await sign(body),
        },
        body,
      }),
      { ...baseEnv, INSTALLATION_ANALYTICS: store }
    );

    expect(response.status).toBe(201);
    expect(store.put).toHaveBeenCalledExactlyOnceWith(
      'installation:42',
      JSON.stringify({
        schemaVersion: 1,
        installationId: 42,
        account: {
          login: 'acme',
          type: 'Organization',
          profileUrl: 'https://github.com/acme',
        },
        installedAt: '2026-08-28T12:00:00.000Z',
      })
    );
    expect(JSON.stringify(vi.mocked(store.put).mock.calls)).not.toContain('private-repo');
    expect(JSON.stringify(vi.mocked(store.put).mock.calls)).not.toContain('private-installer');
    expect(JSON.stringify(vi.mocked(store.put).mock.calls)).not.toContain('private@example.com');
  });

  it('rejects a created-installation payload with a non-canonical profile link', async () => {
    const store = createStore();
    const body = JSON.stringify({
      action: 'created',
      installation: {
        id: 42,
        account: {
          login: 'acme',
          type: 'Organization',
          html_url: 'https://example.com/acme',
        },
        created_at: '2026-08-28T12:00:00Z',
      },
    });
    const response = await githubWebhook.fetch(
      new Request('https://bugdrop.example/github/webhook', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-github-event': 'installation',
          'x-hub-signature-256': await sign(body),
        },
        body,
      }),
      { ...baseEnv, INSTALLATION_ANALYTICS: store }
    );

    expect(response.status).toBe(400);
    expect(store.put).not.toHaveBeenCalled();
  });

  it('does not replace an existing identity record when GitHub redelivers the created event', async () => {
    const existing = JSON.stringify({
      schemaVersion: 1,
      installationId: 42,
      account: {
        login: 'acme',
        type: 'Organization',
        profileUrl: 'https://github.com/acme',
      },
      installedAt: '2026-08-28T12:00:00.000Z',
    });
    const store = createStore({ get: vi.fn().mockResolvedValue(existing) });
    const body = JSON.stringify({
      action: 'created',
      installation: {
        id: 42,
        account: {
          login: 'acme',
          type: 'Organization',
          html_url: 'https://github.com/acme',
        },
        created_at: '2026-08-28T12:00:00Z',
      },
    });
    const response = await githubWebhook.fetch(
      new Request('https://bugdrop.example/github/webhook', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-github-event': 'installation',
          'x-hub-signature-256': await sign(body),
        },
        body,
      }),
      { ...baseEnv, INSTALLATION_ANALYTICS: store }
    );

    expect(response.status).toBe(201);
    expect(store.put).not.toHaveBeenCalled();
  });

  it('does not recreate an identity record from a delayed created event after uninstall', async () => {
    const store = createStore();
    const delayedWebhook = createGitHubWebhook({
      confirmInstallationIsInactive: vi.fn().mockResolvedValue(true),
    });
    const body = JSON.stringify({
      action: 'created',
      installation: {
        id: 42,
        account: {
          login: 'acme',
          type: 'Organization',
          html_url: 'https://github.com/acme',
        },
        created_at: '2026-08-28T12:00:00Z',
      },
    });
    const response = await delayedWebhook.fetch(
      new Request('https://bugdrop.example/github/webhook', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-github-event': 'installation',
          'x-hub-signature-256': await sign(body),
        },
        body,
      }),
      { ...baseEnv, INSTALLATION_ANALYTICS: store }
    );

    expect(response.status).toBe(202);
    expect(store.put).not.toHaveBeenCalled();
  });

  it('removes a created record when uninstall happens during creation', async () => {
    const store = createStore();
    const confirmInstallationIsInactive = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const racingWebhook = createGitHubWebhook({ confirmInstallationIsInactive });
    const body = JSON.stringify({
      action: 'created',
      installation: {
        id: 42,
        account: {
          login: 'acme',
          type: 'Organization',
          html_url: 'https://github.com/acme',
        },
        created_at: '2026-08-28T12:00:00Z',
      },
    });
    const response = await racingWebhook.fetch(
      new Request('https://bugdrop.example/github/webhook', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-github-event': 'installation',
          'x-hub-signature-256': await sign(body),
        },
        body,
      }),
      { ...baseEnv, INSTALLATION_ANALYTICS: store }
    );

    expect(response.status).toBe(202);
    expect(confirmInstallationIsInactive).toHaveBeenCalledTimes(2);
    expect(store.put).toHaveBeenCalledOnce();
    expect(store.delete).toHaveBeenNthCalledWith(1, 'installation-usage:42');
    expect(store.delete).toHaveBeenNthCalledWith(2, 'installation:42');
  });

  it('paginates GitHub’s active-installation list', async () => {
    const installation = (id: number) => ({
      id,
      account: {
        login: `app-${id}`,
        type: 'Organization',
        html_url: `https://github.com/app-${id}`,
      },
      created_at: '2026-08-28T12:00:00Z',
    });
    const firstPage = Array.from({ length: 100 }, (_, index) => installation(index + 1));
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(firstPage))
      .mockResolvedValueOnce(Response.json([installation(101)]));

    const ids = await listActiveGitHubInstallationIds(baseEnv, {
      fetchImpl,
      createJwt: vi.fn().mockResolvedValue('app-jwt'),
    });

    expect(ids.size).toBe(101);
    expect(ids.has(1)).toBe(true);
    expect(ids.has(101)).toBe(true);
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'https://api.github.com/app/installations?per_page=100&page=2',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer app-jwt' }),
      })
    );
  });

  it('deletes stale records across KV pages and records anonymous cleanup evidence', async () => {
    const checkpoint = {
      schemaVersion: 1,
      phase: 'scanning',
      cursor: 'next-page',
      startedAt: '2026-08-28T12:00:00.000Z',
      scannedCount: 2,
      deletedCount: 1,
    };
    const store = createStore({
      get: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(JSON.stringify(checkpoint)),
      list: vi
        .fn()
        .mockResolvedValueOnce({
          keys: [{ name: 'installation:1' }, { name: 'installation:2' }],
          list_complete: false,
          cursor: 'next-page',
          cacheStatus: null,
        })
        .mockResolvedValueOnce({
          keys: [{ name: 'installation:3' }],
          list_complete: true,
          cacheStatus: null,
        }),
    });

    const listActiveInstallationIds = vi.fn().mockResolvedValue(new Set([1, 3]));
    const firstResult = await sweepInstallationRecords(
      { ...baseEnv, INSTALLATION_ANALYTICS: store },
      {
        now: new Date('2026-08-28T12:00:00.000Z'),
        listActiveInstallationIds,
        confirmInstallationIsInactive: vi.fn().mockResolvedValue(true),
      }
    );
    const result = await sweepInstallationRecords(
      { ...baseEnv, INSTALLATION_ANALYTICS: store },
      {
        now: new Date('2026-08-28T12:00:00.000Z'),
        listActiveInstallationIds,
        confirmInstallationIsInactive: vi.fn().mockResolvedValue(true),
      }
    );

    expect(firstResult).toBeNull();
    expect(result).toEqual({
      schemaVersion: 1,
      completedAt: '2026-08-28T12:00:00.000Z',
      scannedCount: 3,
      activeCount: 2,
      deletedCount: 1,
    });
    expect(store.list).toHaveBeenNthCalledWith(1, {
      prefix: 'installation:',
      limit: 25,
    });
    expect(store.list).toHaveBeenNthCalledWith(2, {
      prefix: 'installation:',
      limit: 25,
      cursor: 'next-page',
    });
    expect(store.delete).toHaveBeenNthCalledWith(1, 'installation-usage:2');
    expect(store.delete).toHaveBeenNthCalledWith(2, 'installation:2');
    expect(store.delete).toHaveBeenNthCalledWith(3, INSTALLATION_CLEANUP_CHECKPOINT_KEY);
    expect(store.delete).toHaveBeenCalledTimes(3);
    expect(store.put).toHaveBeenNthCalledWith(
      1,
      INSTALLATION_CLEANUP_CHECKPOINT_KEY,
      JSON.stringify({
        schemaVersion: 1,
        phase: 'deleting',
        installationIds: [2],
        next: checkpoint,
      })
    );
    expect(store.put).toHaveBeenNthCalledWith(
      2,
      INSTALLATION_CLEANUP_CHECKPOINT_KEY,
      JSON.stringify(checkpoint)
    );
    expect(store.put).toHaveBeenNthCalledWith(
      3,
      INSTALLATION_CLEANUP_CHECKPOINT_KEY,
      JSON.stringify({ schemaVersion: 1, phase: 'finalizing', audit: result })
    );
    expect(store.put).toHaveBeenNthCalledWith(
      4,
      INSTALLATION_CLEANUP_AUDIT_KEY,
      JSON.stringify(result)
    );
    expect(store.put).toHaveBeenCalledTimes(4);
    expect(JSON.stringify(result)).not.toContain('installation:2');
  });

  it('rejects malformed record IDs rather than silently skipping cleanup', async () => {
    const store = createStore({
      list: vi.fn().mockResolvedValue({
        keys: [{ name: 'installation:not-a-number' }],
        list_complete: true,
        cacheStatus: null,
      }),
    });

    await expect(
      sweepInstallationRecords(
        { ...baseEnv, INSTALLATION_ANALYTICS: store },
        {
          listActiveInstallationIds: vi.fn().mockResolvedValue(new Set<number>()),
          confirmInstallationIsInactive: vi.fn().mockResolvedValue(true),
        }
      )
    ).rejects.toThrow('Malformed installation record key');
    expect(store.put).not.toHaveBeenCalled();
  });
});

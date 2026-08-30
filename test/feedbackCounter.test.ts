import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../src/types';
import {
  FeedbackCounter,
  getFeedbackCountBaseline,
  getPublicFeedbackCount,
  isExcludedFromFeedbackCount,
  roundFeedbackCount,
  scheduleSuccessfulFeedbackCount,
} from '../src/lib/feedback-counter';

const baseEnv: Env = {
  GITHUB_APP_ID: 'test-app-id',
  GITHUB_PRIVATE_KEY: 'test-private-key',
  ENVIRONMENT: 'test',
  ALLOWED_ORIGINS: '*',
  GITHUB_APP_NAME: 'test-bugdrop-app',
  MAX_SCREENSHOT_SIZE_MB: '5',
  ASSETS: {} as Fetcher,
};

describe('anonymous feedback counter', () => {
  it('initializes from the audited baseline and stores no identifying values', async () => {
    const values = new Map<string, unknown>();
    const storage = createStorage(values);
    const counter = new FeedbackCounter({ storage } as unknown as DurableObjectState, {
      ...baseEnv,
      FEEDBACK_COUNT_BASELINE: '3116',
    });

    const firstEventId = '11111111-1111-4111-8111-111111111111';
    const secondEventId = '22222222-2222-4222-8222-222222222222';
    const first = await counter.fetch(incrementRequest(firstEventId));
    const second = await counter.fetch(incrementRequest(secondEventId));

    expect(await first.json()).toEqual({ total: 3117 });
    expect(await second.json()).toEqual({ total: 3118 });
    expect(values.get('total')).toBe(3118);
    expect(values.get('recentEventIds')).toEqual([firstEventId, secondEventId]);
    expect(JSON.stringify([...values.values()])).not.toContain('external/app');
  });

  it('deduplicates an ambiguous retry using the same opaque event ID', async () => {
    const values = new Map<string, unknown>();
    const counter = new FeedbackCounter(
      { storage: createStorage(values) } as unknown as DurableObjectState,
      { ...baseEnv, FEEDBACK_COUNT_BASELINE: '3116' }
    );
    const eventId = '11111111-1111-4111-8111-111111111111';

    const first = await counter.fetch(incrementRequest(eventId));
    const retry = await counter.fetch(incrementRequest(eventId));

    expect(await first.json()).toEqual({ total: 3117 });
    expect(await retry.json()).toEqual({ total: 3117 });
    expect(values.get('total')).toBe(3117);
  });

  it('publishes only a rounded-down bucket', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ total: 3199 }));
    const env = { ...baseEnv, FEEDBACK_COUNTER: createNamespace(fetch) };

    await expect(getPublicFeedbackCount(env)).resolves.toBe(3100);
    expect(fetch).toHaveBeenCalledWith('https://feedback-counter/total');
    expect(roundFeedbackCount(3200)).toBe(3200);
  });

  it('uses a rounded baseline when the binding is intentionally absent', async () => {
    await expect(
      getPublicFeedbackCount({ ...baseEnv, FEEDBACK_COUNT_BASELINE: '3116' })
    ).resolves.toBe(3100);
    await expect(getPublicFeedbackCount(baseEnv)).resolves.toBeNull();
  });

  it('excludes configured first-party owners without persisting repository identity', () => {
    const env = {
      ...baseEnv,
      FEEDBACK_COUNT_EXCLUDED_OWNERS: 'mean-weasel, NeonWatty',
    };

    expect(isExcludedFromFeedbackCount(env, 'mean-weasel/bugdrop')).toBe(true);
    expect(isExcludedFromFeedbackCount(env, 'neonwatty/test-repo')).toBe(true);
    expect(isExcludedFromFeedbackCount(env, 'external/app')).toBe(false);
  });

  it('isolates counter failures from successful feedback responses', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('counter unavailable'));
    const waitUntil = vi.fn();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const env = { ...baseEnv, FEEDBACK_COUNTER: createNamespace(fetch) };

    expect(() =>
      scheduleSuccessfulFeedbackCount(env, 'external/app', {
        executionCtx: { waitUntil },
      })
    ).not.toThrow();

    const queued = waitUntil.mock.calls[0][0] as Promise<void>;
    await expect(queued).rejects.toThrow('counter unavailable');
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(error).toHaveBeenCalledWith(
      '[BugDrop] Failed to increment anonymous feedback counter:',
      expect.any(Error)
    );
    error.mockRestore();
  });

  it('reuses one opaque event ID when retrying an ambiguous delivery failure', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('response lost'))
      .mockResolvedValueOnce(Response.json({ total: 3117 }));
    const waitUntil = vi.fn();
    const env = { ...baseEnv, FEEDBACK_COUNTER: createNamespace(fetch) };

    scheduleSuccessfulFeedbackCount(env, 'external/app', {
      executionCtx: { waitUntil },
    });
    await (waitUntil.mock.calls[0][0] as Promise<void>);

    expect(fetch).toHaveBeenCalledTimes(2);
    const firstBody = (fetch.mock.calls[0][1] as RequestInit).body;
    const retryBody = (fetch.mock.calls[1][1] as RequestInit).body;
    expect(firstBody).toBe(retryBody);
  });

  it('does not schedule counter work for excluded owners', () => {
    const fetch = vi.fn();
    const waitUntil = vi.fn();
    const env = {
      ...baseEnv,
      FEEDBACK_COUNTER: createNamespace(fetch),
      FEEDBACK_COUNT_EXCLUDED_OWNERS: 'mean-weasel',
    };

    scheduleSuccessfulFeedbackCount(env, 'mean-weasel/bugdrop', {
      executionCtx: { waitUntil },
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it.each([
    [undefined, 0],
    ['3116', 3116],
    ['invalid', 0],
    ['3116issues', 0],
    ['-1', 0],
  ])('normalizes baseline %s to %d', (value, expected) => {
    expect(getFeedbackCountBaseline({ ...baseEnv, FEEDBACK_COUNT_BASELINE: value })).toBe(expected);
  });
});

function incrementRequest(eventId: string): Request {
  return new Request('https://feedback-counter/increment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventId }),
  });
}

function createNamespace(fetch: ReturnType<typeof vi.fn>): DurableObjectNamespace {
  const id = {} as DurableObjectId;
  return {
    idFromName: vi.fn().mockReturnValue(id),
    get: vi.fn().mockReturnValue({ fetch }),
  } as unknown as DurableObjectNamespace;
}

function createStorage(values: Map<string, unknown>): DurableObjectStorage {
  return {
    get: async <T>(key: string) => values.get(key) as T | undefined,
    transaction: async <T>(
      closure: (transaction: DurableObjectTransaction) => Promise<T>
    ): Promise<T> =>
      closure({
        get: async <Value>(key: string) => values.get(key) as Value | undefined,
        put: async <Value>(key: string, value: Value) => {
          values.set(key, value);
        },
      } as DurableObjectTransaction),
  } as DurableObjectStorage;
}

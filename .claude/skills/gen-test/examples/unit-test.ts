/**
 * Example unit test pattern for BugDrop backend code.
 *
 * Key patterns:
 * - Import from vitest: describe, it, expect, vi, beforeEach
 * - Mock KV with vi.fn() for get/put
 * - Create test Hono app with middleware applied
 * - Pass mock bindings via app.fetch(req, env)
 * - Test both success and error paths
 * - Test graceful degradation when KV is unavailable
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../src/types';

describe('Example Middleware', () => {
  let mockKv: { get: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockKv = {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
    };
  });

  function createTestApp() {
    const app = new Hono<{ Bindings: Env }>();
    app.get('/test', c => c.json({ success: true }));

    return {
      app,
      fetch: (req: Request) =>
        app.fetch(req, {
          RATE_LIMIT: mockKv as unknown as KVNamespace,
          GITHUB_APP_ID: 'test',
          GITHUB_PRIVATE_KEY: 'test',
          ENVIRONMENT: 'test',
          ALLOWED_ORIGINS: '*',
          GITHUB_APP_NAME: 'test',
          MAX_SCREENSHOT_SIZE_MB: '5',
          ASSETS: {} as Fetcher,
        } as Env),
    };
  }

  it('handles the happy path', async () => {
    const { fetch } = createTestApp();
    const res = await fetch(new Request('http://localhost/test'));
    expect(res.status).toBe(200);
  });

  it('handles errors gracefully', async () => {
    mockKv.get.mockRejectedValue(new Error('KV error'));
    const { fetch } = createTestApp();
    const res = await fetch(new Request('http://localhost/test'));
    expect(res.status).toBe(200); // Degrades gracefully
  });
});

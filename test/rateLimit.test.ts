import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../src/types';
import { rateLimit, rateLimitByRepo } from '../src/middleware/rateLimit';

describe('Rate Limit Middleware', () => {
  let mockKv: {
    get: ReturnType<typeof vi.fn>;
    put: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockKv = {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
    };
  });

  describe('rateLimit', () => {
    function createTestApp(kv: typeof mockKv | undefined = mockKv) {
      const app = new Hono<{ Bindings: Env }>();

      // Apply rate limit middleware
      app.use(
        '*',
        rateLimit({
          windowMs: 60 * 1000, // 1 minute
          maxRequests: 5,
          keyPrefix: 'test',
        })
      );

      app.get('/test', c => c.json({ success: true }));

      return {
        app,
        fetch: (req: Request) =>
          app.fetch(req, {
            RATE_LIMIT: kv as unknown as KVNamespace,
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

    it('allows requests under the limit', async () => {
      mockKv.get.mockResolvedValue('2');
      const { fetch } = createTestApp();

      const res = await fetch(new Request('http://localhost/test'));

      expect(res.status).toBe(200);
      expect(mockKv.put).toHaveBeenCalled();
    });

    it('blocks requests over the limit with 429', async () => {
      mockKv.get.mockResolvedValue('5'); // At the limit
      const { fetch } = createTestApp();

      const res = await fetch(new Request('http://localhost/test'));
      const data = await res.json();

      expect(res.status).toBe(429);
      expect(data.error).toBe('Too many requests. Please try again later.');
      expect(data.retryAfter).toBe(60);
      expect(res.headers.get('Retry-After')).toBe('60');
    });

    it('returns correct rate limit headers', async () => {
      mockKv.get.mockResolvedValue('2');
      const { fetch } = createTestApp();

      const res = await fetch(new Request('http://localhost/test'));

      expect(res.headers.get('X-RateLimit-Limit')).toBe('5');
      expect(res.headers.get('X-RateLimit-Remaining')).toBe('2'); // 5 - 2 - 1 = 2
    });

    it('increments the counter with correct TTL', async () => {
      mockKv.get.mockResolvedValue('0');
      const { fetch } = createTestApp();

      await fetch(new Request('http://localhost/test'));

      expect(mockKv.put).toHaveBeenCalledWith(expect.stringMatching(/^test:/), '1', {
        expirationTtl: 60,
      });
    });

    it('handles KV errors gracefully (allows request)', async () => {
      mockKv.get.mockRejectedValue(new Error('KV error'));
      const { fetch } = createTestApp();

      const res = await fetch(new Request('http://localhost/test'));

      expect(res.status).toBe(200);
    });

    it('skips rate limiting when KV is not configured', async () => {
      const { fetch } = createTestApp(undefined);

      const res = await fetch(new Request('http://localhost/test'));

      expect(res.status).toBe(200);
    });

    it('uses cf-connecting-ip header for client IP', async () => {
      mockKv.get.mockResolvedValue('0');
      const { fetch } = createTestApp();

      const req = new Request('http://localhost/test', {
        headers: { 'cf-connecting-ip': '1.2.3.4' },
      });
      await fetch(req);

      expect(mockKv.put).toHaveBeenCalledWith(
        expect.stringContaining('1.2.3.4'),
        expect.any(String),
        expect.any(Object)
      );
    });

    it('falls back to x-forwarded-for header', async () => {
      mockKv.get.mockResolvedValue('0');
      const { fetch } = createTestApp();

      const req = new Request('http://localhost/test', {
        headers: { 'x-forwarded-for': '5.6.7.8, 9.10.11.12' },
      });
      await fetch(req);

      expect(mockKv.put).toHaveBeenCalledWith(
        expect.stringContaining('5.6.7.8'),
        expect.any(String),
        expect.any(Object)
      );
    });
  });

  describe('rateLimitByRepo', () => {
    function createTestApp(kv: typeof mockKv | undefined = mockKv) {
      const app = new Hono<{ Bindings: Env }>();

      // Apply repo rate limit middleware
      app.use(
        '*',
        rateLimitByRepo({
          windowMs: 60 * 60 * 1000, // 1 hour
          maxRequests: 50,
        })
      );

      app.post('/feedback', async c => {
        const body = await c.req.json();
        return c.json({ success: true, repo: body.repo });
      });

      app.get('/test', c => c.json({ success: true }));

      return {
        app,
        fetch: (req: Request) =>
          app.fetch(req, {
            RATE_LIMIT: kv as unknown as KVNamespace,
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

    it('allows requests under the repo limit', async () => {
      mockKv.get.mockResolvedValue('10');
      const { fetch } = createTestApp();

      const req = new Request('http://localhost/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo: 'owner/repo', title: 'test' }),
      });
      const res = await fetch(req);

      expect(res.status).toBe(200);
    });

    it('blocks requests over the repo limit', async () => {
      mockKv.get.mockResolvedValue('50'); // At the limit
      const { fetch } = createTestApp();

      const req = new Request('http://localhost/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo: 'owner/repo', title: 'test' }),
      });
      const res = await fetch(req);
      const data = await res.json();

      expect(res.status).toBe(429);
      expect(data.error).toContain('too many feedback submissions');
    });

    it('skips rate limiting for GET requests', async () => {
      const { fetch } = createTestApp();

      const res = await fetch(new Request('http://localhost/test'));

      expect(res.status).toBe(200);
      expect(mockKv.get).not.toHaveBeenCalled();
    });

    it('skips rate limiting when repo is missing', async () => {
      const { fetch } = createTestApp();

      const req = new Request('http://localhost/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'test' }), // No repo
      });
      const res = await fetch(req);

      // Should pass through to the handler (which will validate repo)
      expect(res.status).toBe(200);
    });

    it('handles invalid JSON gracefully', async () => {
      const { fetch } = createTestApp();

      const req = new Request('http://localhost/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json{',
      });

      // Should pass through to the handler
      const res = await fetch(req);
      // The handler will then fail on JSON parsing, but rate limiter passes
      expect(res.status).toBe(500); // Handler fails to parse
    });

    it('uses repo as key for rate limiting', async () => {
      mockKv.get.mockResolvedValue('0');
      const { fetch } = createTestApp();

      const req = new Request('http://localhost/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo: 'owner/repo', title: 'test' }),
      });
      await fetch(req);

      expect(mockKv.put).toHaveBeenCalledWith(
        expect.stringContaining('owner/repo'),
        expect.any(String),
        expect.any(Object)
      );
    });

    it('skips when KV is not configured', async () => {
      const { fetch } = createTestApp(undefined);

      const req = new Request('http://localhost/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo: 'owner/repo', title: 'test' }),
      });
      const res = await fetch(req);

      expect(res.status).toBe(200);
    });
  });
});

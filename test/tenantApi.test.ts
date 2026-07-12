import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../src/types';
import type { TenantConfig } from '../src/lib/tenants';

// Mock GitHub API functions the same way test/api.test.ts does, so
// handleCheckRequest/handleFeedbackRequest (reused verbatim from src/routes/api.ts)
// exercise this test's fakes instead of hitting the network.
const mockGetInstallationToken = vi.fn();
const mockCreateIssue = vi.fn();
const mockUploadScreenshotAsAsset = vi.fn();
const mockUploadAttachmentAsAsset = vi.fn();
const mockIsRepoPublic = vi.fn();

vi.mock('../src/lib/github', () => ({
  getInstallationToken: (...args: unknown[]) => mockGetInstallationToken(...args),
  createIssue: (...args: unknown[]) => mockCreateIssue(...args),
  uploadScreenshotAsAsset: (...args: unknown[]) => mockUploadScreenshotAsAsset(...args),
  uploadAttachmentAsAsset: (...args: unknown[]) => mockUploadAttachmentAsAsset(...args),
  isRepoPublic: (...args: unknown[]) => mockIsRepoPublic(...args),
  GitHubLabelError: class extends Error {},
}));

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

describe('tenant API routes', () => {
  let tenantStore: Map<string, string>;
  let rateLimitStore: Map<string, string>;
  let env: Env;
  let app: Hono;

  beforeEach(async () => {
    mockGetInstallationToken.mockReset();
    mockCreateIssue.mockReset();
    mockUploadScreenshotAsAsset.mockReset();
    mockUploadAttachmentAsAsset.mockReset();
    mockIsRepoPublic.mockReset();
    mockGetInstallationToken.mockResolvedValue('test-token');
    mockCreateIssue.mockResolvedValue({
      number: 42,
      html_url: 'https://github.com/acme/widget/issues/42',
    });
    mockIsRepoPublic.mockResolvedValue(true);

    tenantStore = new Map();
    rateLimitStore = new Map();

    const tenantsKv = {
      get: async (key: string) => tenantStore.get(key) ?? null,
      put: async (key: string, value: string) => {
        tenantStore.set(key, value);
      },
      delete: async (key: string) => {
        tenantStore.delete(key);
      },
      list: async ({ prefix }: { prefix: string }) => ({
        keys: [...tenantStore.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })),
        list_complete: true,
        cursor: '',
      }),
    };

    const rateLimitKv = {
      get: async (key: string) => rateLimitStore.get(key) ?? null,
      put: async (key: string, value: string) => {
        rateLimitStore.set(key, value);
      },
    };

    env = {
      TENANTS: tenantsKv as unknown as KVNamespace,
      RATE_LIMIT: rateLimitKv as unknown as KVNamespace,
      GITHUB_APP_ID: 'test',
      GITHUB_PRIVATE_KEY: 'test',
      ENVIRONMENT: 'test',
      ALLOWED_ORIGINS: '*',
      GITHUB_APP_NAME: 'test',
      MAX_SCREENSHOT_SIZE_MB: '5',
      ASSETS: {} as Fetcher,
    } as Env;

    // Mirrors the production mount shape (src/index.ts): tenantApi's own routes
    // don't include :key, it comes from the mount prefix.
    const { default: tenantApi } = await import('../src/routes/tenantApi');
    app = new Hono();
    app.route('/api/t/:key', tenantApi);
  });

  async function putTenant(tenant: TenantConfig): Promise<void> {
    tenantStore.set(`tenant:${tenant.key}`, JSON.stringify(tenant));
  }

  describe('tenant resolution', () => {
    it('returns 404 for an unknown tenant key', async () => {
      const res = await app.fetch(
        new Request('http://localhost/api/t/ghost/check/acme/widget'),
        env
      );
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data).toEqual({ error: 'Unknown tenant' });
    });

    it('returns 403 for a paused tenant', async () => {
      await putTenant(storedTenant({ status: 'paused' }));
      const res = await app.fetch(
        new Request('http://localhost/api/t/acme/check/acme/widget'),
        env
      );
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data).toEqual({ error: 'Tenant is paused' });
    });
  });

  describe('origin enforcement (D4)', () => {
    it('allows a request whose Origin is in tenant.origins', async () => {
      await putTenant(storedTenant());
      const req = new Request('http://localhost/api/t/acme/check/acme/widget', {
        headers: { Origin: 'https://app.acme.com' },
      });
      const res = await app.fetch(req, env);

      expect(res.status).toBe(200);
      expect(res.headers.get('access-control-allow-origin')).toBe('https://app.acme.com');
    });

    it('rejects a request whose Origin is not in tenant.origins with 403', async () => {
      await putTenant(storedTenant());
      const req = new Request('http://localhost/api/t/acme/check/acme/widget', {
        headers: { Origin: 'https://evil.example.com' },
      });
      const res = await app.fetch(req, env);
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data).toEqual({ error: 'Origin not allowed for this tenant' });
      expect(mockGetInstallationToken).not.toHaveBeenCalled();
    });

    it("rejects a request using a DIFFERENT tenant's valid origin (cross-tenant spoof)", async () => {
      await putTenant(storedTenant({ key: 'acme', origins: ['https://app.acme.com'] }));
      await putTenant(
        storedTenant({ key: 'other', repo: 'other/widget', origins: ['https://app.other.com'] })
      );

      const req = new Request('http://localhost/api/t/acme/check/acme/widget', {
        headers: { Origin: 'https://app.other.com' },
      });
      const res = await app.fetch(req, env);
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data).toEqual({ error: 'Origin not allowed for this tenant' });
    });

    it('allows a request with no Origin header (curl, server-to-server)', async () => {
      await putTenant(storedTenant());
      const req = new Request('http://localhost/api/t/acme/check/acme/widget');
      const res = await app.fetch(req, env);

      expect(res.status).toBe(200);
    });

    it('handles a CORS preflight for an allowed origin', async () => {
      await putTenant(storedTenant());
      const req = new Request('http://localhost/api/t/acme/feedback', {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://app.acme.com',
          'Access-Control-Request-Method': 'POST',
        },
      });
      const res = await app.fetch(req, env);

      expect(res.status).toBe(204);
      expect(res.headers.get('access-control-allow-origin')).toBe('https://app.acme.com');
      expect(res.headers.get('access-control-allow-methods')).toContain('POST');
    });

    it('rejects a CORS preflight for a disallowed origin with 403', async () => {
      await putTenant(storedTenant());
      const req = new Request('http://localhost/api/t/acme/feedback', {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://evil.example.com',
          'Access-Control-Request-Method': 'POST',
        },
      });
      const res = await app.fetch(req, env);

      expect(res.status).toBe(403);
      expect(res.headers.get('access-control-allow-origin')).toBeNull();
    });
  });

  describe('repo pinning (D4)', () => {
    it('rejects /check for a repo that does not match tenant.repo', async () => {
      await putTenant(storedTenant());
      const req = new Request('http://localhost/api/t/acme/check/someone/else');
      const res = await app.fetch(req, env);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data).toEqual({ error: 'Repository does not match tenant configuration' });
      expect(mockGetInstallationToken).not.toHaveBeenCalled();
    });

    it('allows /check for the tenant-pinned repo and delegates to the shared handler', async () => {
      await putTenant(storedTenant());
      const req = new Request('http://localhost/api/t/acme/check/acme/widget');
      const res = await app.fetch(req, env);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data).toEqual({ installed: true, repo: 'acme/widget', appName: 'test' });
      expect(mockGetInstallationToken).toHaveBeenCalledWith(env, 'acme', 'widget');
    });

    it('rejects /feedback whose body repo does not match tenant.repo with 400', async () => {
      await putTenant(storedTenant());
      const req = new Request('http://localhost/api/t/acme/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo: 'someone/else', title: 'Test' }),
      });
      const res = await app.fetch(req, env);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data).toEqual({ error: 'Repository does not match tenant configuration' });
      expect(mockCreateIssue).not.toHaveBeenCalled();
    });

    it('creates the issue via the shared handler when /feedback repo matches tenant.repo', async () => {
      await putTenant(storedTenant());
      const req = new Request('http://localhost/api/t/acme/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo: 'acme/widget',
          title: 'Test feedback',
          description: 'via tenant route',
          metadata: {
            url: 'http://localhost:3000',
            userAgent: 'Mozilla/5.0',
            viewport: { width: 1920, height: 1080 },
            timestamp: '2025-01-15T12:00:00Z',
          },
        }),
      });
      const res = await app.fetch(req, env);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data).toMatchObject({ success: true, issueNumber: 42 });
      expect(mockCreateIssue).toHaveBeenCalledWith(
        'test-token',
        'acme',
        'widget',
        'Test feedback',
        expect.any(String),
        expect.any(Array)
      );
    });
  });

  describe('widget-auth parity with legacy /api/feedback', () => {
    const feedbackBody = JSON.stringify({
      repo: 'acme/widget',
      title: 'Test feedback',
      description: 'via tenant route',
      metadata: {
        url: 'http://localhost:3000',
        userAgent: 'Mozilla/5.0',
        viewport: { width: 1920, height: 1080 },
        timestamp: '2025-01-15T12:00:00Z',
      },
    });

    it('rejects /feedback without a bd1. token when AUTH_TOKEN_SECRET is configured', async () => {
      await putTenant(storedTenant());
      const req = new Request('http://localhost/api/t/acme/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: feedbackBody,
      });
      const res = await app.fetch(req, { ...env, AUTH_TOKEN_SECRET: 'tenant-parity-secret' });

      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'BugDrop auth token required' });
      expect(mockCreateIssue).not.toHaveBeenCalled();
    });

    it('accepts /feedback with a valid bd1. token when AUTH_TOKEN_SECRET is configured', async () => {
      await putTenant(storedTenant());
      const { createBugDropAuthTokenForTest } = await import('../src/lib/authToken');
      const now = Math.floor(Date.now() / 1000);
      const token = await createBugDropAuthTokenForTest(
        { sub: 'user-1', repo: 'acme/widget', iat: now, exp: now + 300, jti: 'jti-1' },
        'tenant-parity-secret'
      );
      const req = new Request('http://localhost/api/t/acme/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: feedbackBody,
      });
      const res = await app.fetch(req, { ...env, AUTH_TOKEN_SECRET: 'tenant-parity-secret' });

      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ success: true, issueNumber: 42 });
    });
  });

  describe('rate limiting (t:{key}: prefix, tenant.rate override)', () => {
    const validPayload = {
      repo: 'acme/widget',
      title: 'Test feedback',
      metadata: {
        url: 'http://localhost:3000',
        userAgent: 'Mozilla/5.0',
        viewport: { width: 1920, height: 1080 },
        timestamp: '2025-01-15T12:00:00Z',
      },
    };

    function feedbackRequest(): Request {
      return new Request('http://localhost/api/t/acme/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.10' },
        body: JSON.stringify(validPayload),
      });
    }

    it('keys the IP rate-limit bucket with the t:{key}: prefix', async () => {
      await putTenant(storedTenant());
      await app.fetch(feedbackRequest(), env);

      const ipKeys = [...rateLimitStore.keys()].filter(k => k.startsWith('t:acme:ip:'));
      expect(ipKeys.length).toBeGreaterThan(0);
    });

    it('keys the repo rate-limit bucket with the t:{key}: prefix', async () => {
      await putTenant(storedTenant());
      await app.fetch(feedbackRequest(), env);

      const repoKeys = [...rateLimitStore.keys()].filter(k => k.startsWith('t:acme:repo:'));
      expect(repoKeys.length).toBeGreaterThan(0);
    });

    it('applies the default per-IP limit (20) when tenant.rate is not set', async () => {
      await putTenant(storedTenant());
      const req = feedbackRequest();
      // Pre-seed the bucket at the default limit.
      const windowStart = Math.floor(Date.now() / (15 * 60 * 1000));
      rateLimitStore.set(`t:acme:ip:203.0.113.10:${windowStart}`, '20');

      const res = await app.fetch(req, env);
      const data = await res.json();

      expect(res.status).toBe(429);
      expect(data.error).toBe('Too many requests. Please try again later.');
      expect(mockCreateIssue).not.toHaveBeenCalled();
    });

    it('applies a custom tenant.rate.perIp override instead of the default', async () => {
      await putTenant(storedTenant({ rate: { perIp: 2 } }));
      const windowStart = Math.floor(Date.now() / (15 * 60 * 1000));
      rateLimitStore.set(`t:acme:ip:203.0.113.10:${windowStart}`, '2');

      const res = await app.fetch(feedbackRequest(), env);
      const data = await res.json();

      expect(res.status).toBe(429);
      expect(data.error).toBe('Too many requests. Please try again later.');
    });

    it('does not share a rate-limit bucket across two different tenants', async () => {
      await putTenant(storedTenant({ key: 'acme', origins: ['https://app.acme.com'] }));
      await putTenant(
        storedTenant({ key: 'other', repo: 'other/widget', origins: ['https://app.other.com'] })
      );

      const windowStart = Math.floor(Date.now() / (15 * 60 * 1000));
      rateLimitStore.set(`t:acme:ip:203.0.113.10:${windowStart}`, '20');

      const otherReq = new Request('http://localhost/api/t/other/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.10' },
        body: JSON.stringify({ ...validPayload, repo: 'other/widget' }),
      });
      const res = await app.fetch(otherReq, env);

      expect(res.status).toBe(200);
    });
  });

  describe('IP rate limit runs before auth (FIX 2)', () => {
    const feedbackBody = JSON.stringify({
      repo: 'acme/widget',
      title: 'Test feedback',
      metadata: {
        url: 'http://localhost:3000',
        userAgent: 'Mozilla/5.0',
        viewport: { width: 1920, height: 1080 },
        timestamp: '2025-01-15T12:00:00Z',
      },
    });

    function invalidTokenRequest(): Request {
      return new Request('http://localhost/api/t/acme/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'cf-connecting-ip': '203.0.113.20',
          Authorization: 'Bearer not-a-real-token',
        },
        body: feedbackBody,
      });
    }

    it('increments the t:{key}:ip: counter even when the request is rejected for an invalid token (401)', async () => {
      await putTenant(storedTenant());
      const res = await app.fetch(invalidTokenRequest(), {
        ...env,
        ENVIRONMENT: 'production',
        AUTH_TOKEN_SECRET: 'tenant-parity-secret',
      });

      expect(res.status).toBe(401);
      const ipKeys = [...rateLimitStore.keys()].filter(k =>
        k.startsWith('t:acme:ip:203.0.113.20:')
      );
      expect(ipKeys.length).toBe(1);
      expect(rateLimitStore.get(ipKeys[0]!)).toBe('1');
    });

    it('returns 429 (not 401) when the IP bucket is already at the limit, even with an invalid token', async () => {
      await putTenant(storedTenant());
      const windowStart = Math.floor(Date.now() / (15 * 60 * 1000));
      rateLimitStore.set(`t:acme:ip:203.0.113.20:${windowStart}`, '20');

      const res = await app.fetch(invalidTokenRequest(), {
        ...env,
        ENVIRONMENT: 'production',
        AUTH_TOKEN_SECRET: 'tenant-parity-secret',
      });

      expect(res.status).toBe(429);
      expect(mockCreateIssue).not.toHaveBeenCalled();
    });
  });

  describe('TENANTS binding absent (FIX 4)', () => {
    it('returns 404 (unknown tenant) when the TENANTS binding is not configured', async () => {
      const { TENANTS: _unused, ...envWithoutTenants } = env;
      const req = new Request('http://localhost/api/t/acme/check/acme/widget');
      const res = await app.fetch(req, envWithoutTenants as Env);
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data).toEqual({ error: 'Unknown tenant' });
    });
  });
});

import { describe, expect, it, beforeEach } from 'vitest';
import app from '../src/index';
import type { Env } from '../src/types';

// Regression coverage for review-pass-2 FIX 1: admin must be mounted before the
// legacy api router so api's global wildcard '*' CORS middleware (which honors
// ALLOWED_ORIGINS, including "*") never applies to /api/admin traffic (D6: admin
// has no CORS allowance at all, same-origin/curl only).
describe('admin mount isolation from global CORS (FIX 1)', () => {
  let store: Map<string, string>;
  let env: Env;

  beforeEach(() => {
    store = new Map();
    const mockKv = {
      get: async (key: string) => store.get(key) ?? null,
      put: async (key: string, value: string) => {
        store.set(key, value);
      },
      delete: async (key: string) => {
        store.delete(key);
      },
      list: async ({ prefix }: { prefix: string }) => ({
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

  it('never sends Access-Control-Allow-Origin for admin traffic, even with a hostile Origin and ALLOWED_ORIGINS "*"', async () => {
    const req = new Request('http://localhost/api/admin/tenants', {
      headers: { Origin: 'https://evil.example' },
    });
    const res = await app.fetch(req, env);

    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect([401, 503]).toContain(res.status);
  });

  it('returns 200 with no CORS header for a correctly authorized admin request', async () => {
    const req = new Request('http://localhost/api/admin/tenants', {
      headers: {
        Origin: 'https://evil.example',
        Authorization: `Bearer ${env.ADMIN_TOKEN}`,
      },
    });
    const res = await app.fetch(req, env);

    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

import { test, expect } from '@playwright/test';

/**
 * E2E tests for API endpoints
 * Tests run against wrangler dev server at http://localhost:8787
 */

test.describe('Health API', () => {
  test('GET /api/health returns correct structure', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.status).toBe('ok');
    expect(data.environment).toBe('development');
    expect(data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('GET /api/health has CORS headers', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.headers()['access-control-allow-origin']).toBe('*');
  });
});

test.describe('Installation Check API', () => {
  test('GET /api/check/:owner/:repo returns response', async ({ request }) => {
    // Without GitHub App configured, this may return error or installed: false
    const response = await request.get('/api/check/testowner/testrepo');

    // Should return 200 (with installed: false) or 500 (if no credentials configured)
    expect([200, 500]).toContain(response.status());
  });
});

test.describe('Feedback API - Validation', () => {
  test('POST /api/feedback returns 400 for missing repo', async ({ request }) => {
    const response = await request.post('/api/feedback', {
      data: {
        title: 'Test',
        description: 'Test description',
      },
    });
    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Missing required fields');
  });

  test('POST /api/feedback returns 400 for missing title', async ({ request }) => {
    const response = await request.post('/api/feedback', {
      data: {
        repo: 'owner/repo',
        description: 'Test description',
      },
    });
    expect(response.status()).toBe(400);
  });

  test('POST /api/feedback accepts missing description (optional field)', async ({ request }) => {
    const response = await request.post('/api/feedback', {
      data: {
        repo: 'owner/repo',
        title: 'Test',
      },
    });
    // Description is optional — server should not reject this.
    // Will get 500 due to missing GitHub secrets in E2E, but not 400.
    expect(response.status()).not.toBe(400);
  });

  test('POST /api/feedback returns 400 for invalid repo format', async ({ request }) => {
    const response = await request.post('/api/feedback', {
      data: {
        repo: 'invalidformat',
        title: 'Test',
        description: 'Test description',
        metadata: {
          url: 'http://test.com',
          userAgent: 'test',
          viewport: { width: 1920, height: 1080 },
          timestamp: new Date().toISOString(),
        },
      },
    });
    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Invalid repo format');
  });

  test('POST /api/feedback returns 400 for invalid JSON', async ({ request }) => {
    const response = await request.post('/api/feedback', {
      headers: { 'Content-Type': 'application/json' },
      data: 'not valid json{',
    });
    expect(response.status()).toBe(400);
  });
});

test.describe('Feedback API - Valid Payloads', () => {
  test('POST /api/feedback with valid payload returns 403 (app not installed)', async ({
    request,
  }) => {
    // Without a real GitHub App configured, this should return 403
    const response = await request.post('/api/feedback', {
      data: {
        repo: 'testowner/testrepo',
        title: 'Test Feedback',
        description: 'This is a test feedback submission',
        metadata: {
          url: 'http://localhost:8787/test/',
          userAgent: 'Playwright Test',
          viewport: { width: 1920, height: 1080 },
          timestamp: new Date().toISOString(),
        },
      },
    });

    // Should be 403 because GitHub App is not installed
    // Or 500 if there's an error with GitHub API
    expect([403, 500]).toContain(response.status());
  });
});

test.describe('CORS', () => {
  test('OPTIONS /api/health returns correct CORS headers', async ({ request }) => {
    const response = await request.fetch('/api/health', { method: 'OPTIONS' });
    expect(response.status()).toBe(204);
    expect(response.headers()['access-control-allow-origin']).toBe('*');
    expect(response.headers()['access-control-allow-methods']).toContain('GET');
  });

  test('OPTIONS /api/feedback returns correct CORS headers', async ({ request }) => {
    const response = await request.fetch('/api/feedback', { method: 'OPTIONS' });
    expect(response.status()).toBe(204);
    expect(response.headers()['access-control-allow-origin']).toBe('*');
    expect(response.headers()['access-control-allow-methods']).toContain('POST');
  });
});
